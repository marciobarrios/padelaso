-- Correcting a recorded match (MAR-160).
--
-- public.update_match changes a match's teams, set scores, date or court as the
-- calling user, in one transaction. It is the MCP server's third write path and
-- follows create_match and add_match_events: security definer, with auth.uid()
-- and group membership checked explicitly, and receipts kept in match_private,
-- which PostgREST does not expose. No service role is involved.
--
-- The request is a partial patch: fields it leaves out stay as they are, and it
-- never touches events. Rules:
--   * The caller is a member of the match's group. A missing match, another
--     group's match and a group the caller isn't in all return MATCH_NOT_FOUND,
--     as get_match_detail does.
--   * Teams change together (team1 and team2), as two teams of two different
--     players of the group, as in create_match. A team change that would drop a
--     player who has events is refused with PLAYER_HAS_EVENTS: the caller
--     removes those events explicitly first.
--   * Sets replace the whole score: 1 to 5 played sets of whole games 0 to 99.
--   * The date is within the last year and not in the future; the court is a
--     whole number from 1 to 99, or null to clear it.
--
-- Concurrency: expectedVersion is the version get_match_detail returned
-- (native_private.match_state.revision). If the match or its events changed
-- since, the update is refused with STALE_VERSION. The match row is locked for
-- update first, so no other writer (web, native, add_match_events) can change
-- the match or add events between the check and the write.
--
-- Retries: the idempotency key is required, scoped per user and kept 48 hours.
-- The same key with the same request replays the result (the first call already
-- moved the version, so a plain retry would otherwise look stale); with another
-- request it is refused.

create table match_private.update_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  match_id uuid not null references public.matches(id) on delete cascade,
  -- The normalized request without its key, compared on replay.
  request jsonb not null,
  -- The fields this call changed.
  changed text[] not null,
  retain_until timestamptz not null,
  primary key (user_id, idempotency_key)
);

create index idx_update_receipts_match_id
  on match_private.update_receipts(match_id);

alter table match_private.update_receipts enable row level security;

create function public.update_match(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
as $$
declare
  c_fields constant text[] := array['groupId', 'matchId', 'expectedVersion', 'patch', 'idempotencyKey'];
  c_patch_fields constant text[] := array['team1', 'team2', 'sets', 'date', 'courtNumber'];
  c_max_sets constant integer := 5;
  c_receipt_retention constant interval := '48 hours';
  v_now timestamptz := now();
  v_user_id uuid := (select auth.uid());
  v_unknown text;
  v_group_id uuid;
  v_match_id uuid;
  v_expected_version bigint;
  v_patch jsonb;
  v_normalized jsonb := '{}'::jsonb;
  v_team1 uuid[];
  v_team2 uuid[];
  v_players uuid[];
  v_set jsonb;
  v_set_number integer;
  v_sets jsonb;
  v_date timestamptz;
  v_court integer;
  v_key text;
  v_request jsonb;
  v_match public.matches%rowtype;
  v_version bigint;
  v_receipt match_private.update_receipts%rowtype;
  v_missing uuid[];
  v_dropped uuid[];
  v_changed text[] := '{}';
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

  if jsonb_typeof(p_request -> 'expectedVersion') is distinct from 'number'
    or (p_request ->> 'expectedVersion')::numeric < 0
    or (p_request ->> 'expectedVersion')::numeric <> trunc((p_request ->> 'expectedVersion')::numeric)
    or (p_request ->> 'expectedVersion')::numeric > 9007199254740991 then
    return match_private.error('INVALID_REQUEST',
      'expectedVersion is required: the version get_match returned.');
  end if;
  v_expected_version := (p_request ->> 'expectedVersion')::bigint;

  -- ---------- Patch ----------
  v_patch := p_request -> 'patch';
  if jsonb_typeof(v_patch) is distinct from 'object' then
    return match_private.error('INVALID_REQUEST', 'patch must be an object with the fields to change.');
  end if;
  select k into v_unknown
  from jsonb_object_keys(v_patch) as k
  where k <> all (c_patch_fields)
  limit 1;
  if v_unknown is not null then
    return match_private.error('INVALID_REQUEST', format('Unknown patch field: %s.', v_unknown));
  end if;
  if v_patch = '{}'::jsonb then
    return match_private.error('INVALID_REQUEST', 'patch has nothing to change.');
  end if;

  -- Teams: both or neither, so a correction always states the whole line-up.
  if v_patch ? 'team1' or v_patch ? 'team2' then
    v_team1 := match_private.team(v_patch -> 'team1');
    v_team2 := match_private.team(v_patch -> 'team2');
    if v_team1 is null or v_team2 is null then
      return match_private.error('INVALID_TEAMS',
        'Give both teams, each with exactly two players.');
    end if;
    v_players := v_team1 || v_team2;
    if (select count(distinct p) from unnest(v_players) as p) <> 4 then
      return match_private.error('INVALID_TEAMS', 'A match needs four different players.');
    end if;
    v_normalized := v_normalized || jsonb_build_object('team1', to_jsonb(v_team1), 'team2', to_jsonb(v_team2));
  end if;

  if v_patch ? 'sets' then
    if jsonb_typeof(v_patch -> 'sets') is distinct from 'array'
      or jsonb_array_length(v_patch -> 'sets') not between 1 and c_max_sets then
      return match_private.error('INVALID_SETS', format('A match has between 1 and %s sets.', c_max_sets));
    end if;
    v_sets := '[]'::jsonb;
    for v_set, v_set_number in
      select value, ordinality from jsonb_array_elements(v_patch -> 'sets') with ordinality
    loop
      if jsonb_typeof(v_set) is distinct from 'object'
        or (select array_agg(k order by k) from jsonb_object_keys(v_set) as k)
          is distinct from array['team1Score', 'team2Score']
        or not match_private.is_score(v_set -> 'team1Score')
        or not match_private.is_score(v_set -> 'team2Score') then
        return match_private.error('INVALID_SETS',
          format('Set %s: scores must be whole numbers from 0 to 99.', v_set_number));
      end if;
      if (v_set ->> 'team1Score')::numeric = 0 and (v_set ->> 'team2Score')::numeric = 0 then
        return match_private.error('INVALID_SETS',
          format('Set %s has no score. Remove sets that were not played.', v_set_number));
      end if;
      -- Rebuilt as integers, the shape every other writer stores.
      v_sets := v_sets || jsonb_build_array(jsonb_build_object(
        'team1Score', (v_set ->> 'team1Score')::integer,
        'team2Score', (v_set ->> 'team2Score')::integer
      ));
    end loop;
    v_normalized := v_normalized || jsonb_build_object('sets', v_sets);
  end if;

  if v_patch ? 'date' then
    v_date := match_private.try_timestamp(v_patch -> 'date');
    if v_date is null then
      return match_private.error('INVALID_DATE', 'date must be an ISO 8601 date and time with a UTC offset.');
    end if;
    if v_date > v_now + interval '5 minutes' then
      return match_private.error('INVALID_DATE', 'The match date is in the future.');
    end if;
    if v_date < v_now - interval '1 year' then
      return match_private.error('INVALID_DATE', 'The match date is more than a year ago.');
    end if;
    v_normalized := v_normalized || jsonb_build_object('date', match_private.timestamp(v_date));
  end if;

  -- null clears the court.
  if v_patch ? 'courtNumber' then
    if jsonb_typeof(v_patch -> 'courtNumber') <> 'null' then
      if jsonb_typeof(v_patch -> 'courtNumber') <> 'number'
        or (v_patch ->> 'courtNumber')::numeric not between 1 and 99
        or (v_patch ->> 'courtNumber')::numeric <> trunc((v_patch ->> 'courtNumber')::numeric) then
        return match_private.error('INVALID_REQUEST',
          'courtNumber must be a whole number from 1 to 99, or null to clear it.');
      end if;
      v_court := (v_patch ->> 'courtNumber')::integer;
    end if;
    v_normalized := v_normalized || jsonb_build_object('courtNumber', to_jsonb(v_court));
  end if;

  -- ---------- Idempotency key (required) ----------
  if jsonb_typeof(p_request -> 'idempotencyKey') is distinct from 'string'
    or (p_request ->> 'idempotencyKey') !~ '^[A-Za-z0-9._:-]{8,128}$' then
    return match_private.error('INVALID_REQUEST',
      'idempotencyKey is required: 8 to 128 letters, digits or . _ : - characters.');
  end if;
  v_key := p_request ->> 'idempotencyKey';

  -- Normalized, so a retry that only spells the same values differently replays.
  v_request := jsonb_build_object(
    'groupId', v_group_id,
    'matchId', v_match_id,
    'expectedVersion', v_expected_version,
    'patch', v_normalized
  );

  -- This block is a subtransaction: any exception below undoes the whole call.
  begin
    -- For update: blocks every other writer of the match and, through the
    -- match_events foreign key, every event insert, until this transaction ends.
    -- A concurrent retry waits here and then finds the receipt.
    select m.* into v_match
    from public.matches as m
    where m.id = v_match_id
      and m.group_id = v_group_id
      and exists (
        select 1 from public.group_members as member
        where member.group_id = m.group_id and member.user_id = v_user_id
      )
    for update of m;

    -- Before replay as well: a removed member can't read through a retry.
    if not found then
      return match_private.error('MATCH_NOT_FOUND', 'Match not found in this group.');
    end if;

    delete from match_private.update_receipts
    where user_id = v_user_id and retain_until < v_now;

    select * into v_receipt
    from match_private.update_receipts
    where user_id = v_user_id and idempotency_key = v_key;

    if found then
      if v_receipt.request <> v_request then
        return match_private.error('IDEMPOTENCY_KEY_REUSED',
          'This idempotency key was already used for a different request.');
      end if;
      v_status := 'replayed';
      v_changed := v_receipt.changed;
    else
      select revision into strict v_version
      from native_private.match_state
      where match_id = v_match_id;
      if v_version <> v_expected_version then
        return match_private.error('STALE_VERSION',
          'The match changed since it was read. Read it again before changing it.')
          || jsonb_build_object('version', v_version);
      end if;

      if v_players is not null then
        -- Key share blocks a concurrent player deletion until this transaction
        -- ends, so it cannot miss this match when it rewrites the group's teams.
        perform 1 from public.players
        where id = any(v_players) and group_id = v_group_id
        for key share;

        select array_agg(p order by position) into v_missing
        from unnest(v_players) with ordinality as wanted(p, position)
        where not exists (
          select 1 from public.players
          where id = wanted.p and group_id = v_group_id
        );
        if v_missing is not null then
          return match_private.error('PLAYER_NOT_IN_GROUP', 'Some players are not in this group.', v_missing);
        end if;

        select array_agg(distinct event.player_id order by event.player_id) into v_dropped
        from public.match_events as event
        where event.match_id = v_match_id
          and not (event.player_id = any(v_players));
        if v_dropped is not null then
          return match_private.error('PLAYER_HAS_EVENTS',
            'Players leaving the match still have events. Remove their events first.', v_dropped);
        end if;

        if not (v_match.team1 @> v_team1 and v_match.team1 <@ v_team1 and cardinality(v_match.team1) = 2) then
          v_changed := v_changed || 'team1'::text;
        end if;
        if not (v_match.team2 @> v_team2 and v_match.team2 <@ v_team2 and cardinality(v_match.team2) = 2) then
          v_changed := v_changed || 'team2'::text;
        end if;
      end if;

      if v_sets is not null and v_match.sets is distinct from v_sets then
        v_changed := v_changed || 'sets'::text;
      end if;
      if v_patch ? 'date' and v_match.date is distinct from v_date then
        v_changed := v_changed || 'date'::text;
      end if;
      if v_patch ? 'courtNumber' and v_match.court_number is distinct from v_court then
        v_changed := v_changed || 'courtNumber'::text;
      end if;

      if cardinality(v_changed) > 0 then
        -- Only the changed fields: one statement, so the version moves by one.
        update public.matches
        set
          team1 = case when 'team1' = any(v_changed) then v_team1 else team1 end,
          team2 = case when 'team2' = any(v_changed) then v_team2 else team2 end,
          sets = case when 'sets' = any(v_changed) then v_sets else sets end,
          date = case when 'date' = any(v_changed) then v_date else date end,
          court_number = case when 'courtNumber' = any(v_changed) then v_court else court_number end
        where id = v_match_id;
        v_status := 'updated';
      else
        v_status := 'unchanged';
      end if;

      insert into match_private.update_receipts (
        user_id, idempotency_key, match_id, request, changed, retain_until
      )
      values (v_user_id, v_key, v_match_id, v_request, v_changed, v_now + c_receipt_retention)
      on conflict do nothing;

      -- Only possible when the same user raced the same key against another
      -- match, because this match's row lock serializes every other case.
      if not found then
        raise exception 'idempotency key reused' using errcode = 'PM001';
      end if;
    end if;

    return match_private.summary(v_match_id, v_status) || jsonb_build_object(
      'version', (select revision from native_private.match_state where match_id = v_match_id),
      'changed', to_jsonb(v_changed)
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

-- Security definer on purpose: OAuth tokens may not update matches, and it
-- writes receipts callers have no access to, after checking auth.uid() and
-- group membership itself (Supabase lint 0029, option 3).
revoke all on function public.update_match(jsonb) from public, anon, authenticated;
grant execute on function public.update_match(jsonb) to authenticated;

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
    'rpc/create_match', 'rpc/hit_mcp_rate_limit', 'rpc/get_match_detail', 'rpc/add_match_events',
    'rpc/remove_match_event', 'rpc/update_match'
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
