-- Appending events to an existing match (MAR-158).
--
-- public.add_match_events adds one or more events to a match as the calling
-- user, in one transaction. It is the MCP server's second write path and
-- follows create_match: security definer, with auth.uid() and group membership
-- checked explicitly, and receipts kept in match_private, which PostgREST does
-- not expose. No service role is involved.
--
-- Rules:
--   * The caller is a member of the match's group. A missing match, another
--     group's match and a group the caller isn't in all return MATCH_NOT_FOUND,
--     as get_match_detail does.
--   * 1 to 50 events per call, each for one of the match's four players and of
--     a current type (match_private.recordable_event_types, which mirrors
--     EVENT_CONFIGS in @padelaso/domain/events).
--   * At most 50 events per match in total (MAX_RECORDED_EVENTS).
--
-- Two events of the same type for the same player are legitimate ("two aces"),
-- so there is no duplicate window: the idempotency key is required and is the
-- only retry protection. It is scoped per user and kept 48 hours. The same key
-- with the same request replays the saved result; with another request it is
-- refused. Calls for the same match are serialized with an advisory lock, so a
-- concurrent retry waits and then finds the receipt.

create table match_private.event_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  match_id uuid not null references public.matches(id) on delete cascade,
  -- The normalized request without its key, compared on replay.
  request jsonb not null,
  -- The events this call added, in order.
  event_ids uuid[] not null,
  retain_until timestamptz not null,
  primary key (user_id, idempotency_key)
);

create index idx_event_receipts_match_id
  on match_private.event_receipts(match_id);

alter table match_private.event_receipts enable row level security;

-- The event types that may be recorded now. Keep in sync with EVENT_CONFIGS
-- (@padelaso/domain/events): the integration test records every one of them.
-- Retired types stay readable but can't be added.
create function match_private.recordable_event_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'remate_red', 'ace', 'doble_falta', 'remate', 'dejada_imposible', 'tomahawk',
    'salvada_top', 'por_4_metros', 'por_3_metros', 'grito_guerra', 'cinta', 'pelotazo',
    'por_debajo_piernas', 'tocaste_techo', 'por_la_puerta'
  ];
$$;

create function public.add_match_events(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
as $$
declare
  c_fields constant text[] := array['groupId', 'matchId', 'events', 'idempotencyKey'];
  c_max_events constant integer := 50;
  c_receipt_retention constant interval := '48 hours';
  v_now timestamptz := now();
  v_user_id uuid := (select auth.uid());
  v_unknown text;
  v_group_id uuid;
  v_match_id uuid;
  v_event jsonb;
  v_events jsonb := '[]'::jsonb;
  v_key text;
  v_request jsonb;
  v_players uuid[];
  v_outsiders uuid[];
  v_existing integer;
  v_receipt match_private.event_receipts%rowtype;
  v_event_ids uuid[];
  v_status text;
begin
  if v_user_id is null then
    return match_private.error('AUTH_REQUIRED', 'Sign in again.');
  end if;

  if jsonb_typeof(p_request) is distinct from 'object' then
    return match_private.error('INVALID_REQUEST', 'The request must be a JSON object.');
  end if;

  select k into v_unknown
  from jsonb_object_keys(p_request) as k
  where k <> all (c_fields)
  limit 1;
  if v_unknown is not null then
    return match_private.error('INVALID_REQUEST', format('Unknown field: %s.', v_unknown));
  end if;

  v_group_id := match_private.try_uuid(p_request -> 'groupId');
  v_match_id := match_private.try_uuid(p_request -> 'matchId');
  if v_group_id is null or v_match_id is null then
    return match_private.error('INVALID_REQUEST', 'groupId and matchId must be IDs.');
  end if;

  -- ---------- Events ----------
  if jsonb_typeof(p_request -> 'events') is distinct from 'array'
    or jsonb_array_length(p_request -> 'events') not between 1 and c_max_events then
    return match_private.error('INVALID_EVENTS',
      format('Add between 1 and %s events at a time.', c_max_events));
  end if;
  for v_event in select value from jsonb_array_elements(p_request -> 'events') loop
    if jsonb_typeof(v_event) is distinct from 'object'
      or (select array_agg(k order by k) from jsonb_object_keys(v_event) as k)
        is distinct from array['playerId', 'type']
      or match_private.try_uuid(v_event -> 'playerId') is null
      or jsonb_typeof(v_event -> 'type') <> 'string' then
      return match_private.error('INVALID_EVENTS', 'Each event needs a playerId and a type.');
    end if;
    if not ((v_event ->> 'type') = any(match_private.recordable_event_types())) then
      return match_private.error('INVALID_EVENTS',
        format('Unknown event type: %s.', left(v_event ->> 'type', 64)));
    end if;
    v_events := v_events || jsonb_build_array(jsonb_build_object(
      'playerId', match_private.try_uuid(v_event -> 'playerId'),
      'type', v_event ->> 'type'
    ));
  end loop;

  -- ---------- Idempotency key (required) ----------
  if jsonb_typeof(p_request -> 'idempotencyKey') is distinct from 'string'
    or (p_request ->> 'idempotencyKey') !~ '^[A-Za-z0-9._:-]{8,128}$' then
    return match_private.error('INVALID_REQUEST',
      'idempotencyKey is required: 8 to 128 letters, digits or . _ : - characters.');
  end if;
  v_key := p_request ->> 'idempotencyKey';

  -- Normalized, so a retry that only spells the same values differently replays.
  v_request := jsonb_build_object('groupId', v_group_id, 'matchId', v_match_id, 'events', v_events);

  -- This block is a subtransaction: any exception below undoes the whole call.
  begin
    perform pg_advisory_xact_lock(hashtextextended('public.add_match_events:' || v_match_id::text, 0));

    -- Share lock: the teams can't change, nor the match be deleted, until this
    -- transaction ends, so the player check below stays true.
    select m.team1 || m.team2 into v_players
    from public.matches as m
    where m.id = v_match_id
      and m.group_id = v_group_id
      and exists (
        select 1 from public.group_members as member
        where member.group_id = m.group_id and member.user_id = v_user_id
      )
    for share of m;

    -- Before replay as well: a removed member can't read through a retry.
    if not found then
      return match_private.error('MATCH_NOT_FOUND', 'Match not found in this group.');
    end if;

    delete from match_private.event_receipts
    where user_id = v_user_id and retain_until < v_now;

    select * into v_receipt
    from match_private.event_receipts
    where user_id = v_user_id and idempotency_key = v_key;

    if found then
      if v_receipt.request <> v_request then
        return match_private.error('IDEMPOTENCY_KEY_REUSED',
          'This idempotency key was already used for a different request.');
      end if;
      v_status := 'replayed';
      v_event_ids := v_receipt.event_ids;
    else
      select array_agg(distinct (event ->> 'playerId')::uuid) into v_outsiders
      from jsonb_array_elements(v_events) as event
      where not ((event ->> 'playerId')::uuid = any(v_players));
      if v_outsiders is not null then
        return match_private.error('INVALID_EVENTS',
          'Every event must belong to one of the match''s four players.', v_outsiders);
      end if;

      select count(*) into v_existing
      from public.match_events
      where match_id = v_match_id;
      if v_existing + jsonb_array_length(v_events) > c_max_events then
        return match_private.error('TOO_MANY_EVENTS',
          format('A match can have at most %s events; this one has %s.', c_max_events, v_existing));
      end if;

      -- sequence is an identity column, so it follows this insert order.
      with inserted as (
        insert into public.match_events (match_id, player_id, type, created_by)
        select v_match_id, (event ->> 'playerId')::uuid, event ->> 'type', v_user_id
        from jsonb_array_elements(v_events) with ordinality as item(event, position)
        order by position
        returning id, sequence
      )
      select array_agg(id order by sequence) into v_event_ids from inserted;

      insert into match_private.event_receipts (
        user_id, idempotency_key, match_id, request, event_ids, retain_until
      )
      values (v_user_id, v_key, v_match_id, v_request, v_event_ids, v_now + c_receipt_retention)
      on conflict do nothing;

      -- Only possible when the same user raced the same key against another
      -- match, because this match's lock serializes every other case.
      if not found then
        raise exception 'idempotency key reused' using errcode = 'PM001';
      end if;
      v_status := 'added';
    end if;

    return match_private.summary(v_match_id, v_status) || jsonb_build_object(
      'version', (select revision from native_private.match_state where match_id = v_match_id),
      'addedEventIds', to_jsonb(v_event_ids)
    );
  exception
    when sqlstate 'PM001' then
      return match_private.error('IDEMPOTENCY_KEY_REUSED',
        'This idempotency key was already used for a different request.');
    when lock_not_available or deadlock_detected then
      return match_private.error('BUSY', 'The match is busy. Try again in a moment.');
  end;
end;
$$;

revoke all on all functions in schema match_private from public;

-- Security definer on purpose: OAuth tokens may not write match_events, and it
-- writes receipts callers have no access to, after checking auth.uid() and
-- group membership itself (Supabase lint 0029, option 3).
revoke all on function public.add_match_events(jsonb) from public, anon, authenticated;
grant execute on function public.add_match_events(jsonb) to authenticated;

-- The Data API guard (MAR-144) allowlists OAuth token requests, so it must let
-- this RPC through. Unchanged otherwise.
create or replace function mcp_private.check_request()
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_method text := current_setting('request.method', true);
  -- PostgREST passes the path after the API prefix, e.g. "/matches".
  v_path text := trim(both '/' from coalesce(current_setting('request.path', true), ''));
begin
  if (select auth.jwt() ->> 'client_id') is null then
    return;
  end if;

  if v_method in ('GET', 'HEAD') and v_path in ('groups', 'players', 'matches') then
    return;
  end if;
  if v_method = 'POST' and v_path in (
    'rpc/create_match', 'rpc/hit_mcp_rate_limit', 'rpc/get_match_detail', 'rpc/add_match_events'
  ) then
    return;
  end if;

  raise sqlstate 'PGRST' using
    message = json_build_object(
      'code', 'OAUTH_CLIENT_FORBIDDEN',
      'message', 'OAuth client tokens can only make the requests the Padelaso MCP server needs')::text,
    detail = json_build_object('status', 403, 'headers', json_build_object())::text;
end;
$$;

notify pgrst, 'reload config';
