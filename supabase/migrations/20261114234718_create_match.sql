-- Atomic match creation (MAR-99).
--
-- public.create_match records a finished match and its events in one
-- transaction, as the calling user. It is the write path for the MCP server and
-- follows native_apply_command: security definer, with auth.uid() and group
-- membership checked explicitly, and server-owned state kept in a schema that
-- PostgREST does not expose. No service role is involved.
--
-- The rules mirror validateMatchDraft in @padelaso/domain/matches: two teams of
-- two different group players, 1 to 5 played sets with whole scores from 0 to
-- 99, and up to 50 events for the match's players.
--
-- Duplicate protection has two layers, because a model may change a key it
-- generated between retries:
--   1. An optional idempotency key, scoped per user and kept 48 hours. The same
--      key with the same request replays the saved match; with another request
--      it is refused.
--   2. Without a matching key, an identical match (same group, same teams in
--      either order, same set scores) created in the last 15 minutes, and played
--      within 12 hours of the requested date, is returned instead of a new one.
-- Calls for the same group are serialized, so concurrent retries cannot both
-- pass the duplicate check.

create schema match_private;
revoke all on schema match_private from public;

create table match_private.creation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  match_id uuid not null references public.matches(id) on delete cascade,
  -- The request without its key, compared on replay.
  request jsonb not null,
  retain_until timestamptz not null,
  primary key (user_id, idempotency_key)
);

create index idx_creation_receipts_match_id
  on match_private.creation_receipts(match_id);

alter table match_private.creation_receipts enable row level security;

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------
create function match_private.error(p_code text, p_message text, p_player_ids uuid[] default null)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'status', 'rejected',
    'code', p_code,
    'message', p_message,
    'playerIds', to_jsonb(p_player_ids)
  ));
$$;

create function match_private.try_uuid(p_value jsonb)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_value) is distinct from 'string' then
    return null;
  end if;
  return (p_value #>> '{}')::uuid;
exception when data_exception then
  return null;
end;
$$;

-- A team is a JSON array of exactly two player ID strings.
create function match_private.team(p_value jsonb)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_value) = 'array' and jsonb_array_length(p_value) = 2
      and match_private.try_uuid(p_value -> 0) is not null
      and match_private.try_uuid(p_value -> 1) is not null
    then array[match_private.try_uuid(p_value -> 0), match_private.try_uuid(p_value -> 1)]
  end;
$$;

-- ISO 8601 with a UTC designator or offset, so the instant is unambiguous.
create function match_private.try_timestamp(p_value jsonb)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_value) is distinct from 'string'
    or (p_value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$' then
    return null;
  end if;
  return (p_value #>> '{}')::timestamptz;
exception when data_exception then
  return null;
end;
$$;

create function match_private.is_score(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- CASE, so the cast only runs on numbers.
  select case
    when jsonb_typeof(p_value) = 'number' then
      (p_value #>> '{}')::numeric between 0 and 99
      and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric)
    else false
  end;
$$;

create function match_private.timestamp(p_value timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p_value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- What was saved. Volatile so it sees the calling function's own writes.
create function match_private.summary(p_match_id uuid, p_status text)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select jsonb_build_object(
    'status', p_status,
    'match', jsonb_build_object(
      'id', m.id,
      'groupId', m.group_id,
      'date', match_private.timestamp(m.date),
      'createdAt', match_private.timestamp(m.created_at),
      'courtNumber', m.court_number,
      'team1', to_jsonb(m.team1),
      'team2', to_jsonb(m.team2),
      'sets', m.sets
    ),
    'events', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('id', event.id, 'playerId', event.player_id, 'type', event.type)
          order by event.sequence
        ),
        '[]'::jsonb
      )
      from public.match_events as event
      where event.match_id = m.id
    )
  )
  from public.matches as m
  where m.id = p_match_id;
$$;

-- ------------------------------------------------------------
-- RPC
-- ------------------------------------------------------------
create function public.create_match(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
as $$
declare
  c_fields constant text[] := array[
    'groupId', 'team1', 'team2', 'sets', 'date', 'courtNumber', 'events', 'idempotencyKey'
  ];
  c_max_sets constant integer := 5;
  c_max_events constant integer := 50;
  c_duplicate_window constant interval := '15 minutes';
  c_date_tolerance constant interval := '12 hours';
  c_receipt_retention constant interval := '48 hours';
  -- now(), not clock_timestamp(): matches.created_at defaults to now().
  v_now timestamptz := now();
  v_user_id uuid := (select auth.uid());
  v_unknown text;
  v_group_id uuid;
  v_team1 uuid[];
  v_team2 uuid[];
  v_players uuid[];
  v_missing uuid[];
  v_set jsonb;
  v_set_number integer;
  v_sets jsonb := '[]'::jsonb;
  v_swapped_sets jsonb := '[]'::jsonb;
  v_date timestamptz;
  v_court integer;
  v_event jsonb;
  v_events jsonb := '[]'::jsonb;
  v_key text;
  v_request jsonb;
  v_receipt match_private.creation_receipts%rowtype;
  v_match_id uuid;
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
  if v_group_id is null then
    return match_private.error('INVALID_REQUEST', 'groupId must be a group ID.');
  end if;

  -- Missing and forbidden look the same, as they do through RLS.
  if not exists (
    select 1 from public.group_members
    where group_id = v_group_id and user_id = v_user_id
  ) then
    return match_private.error('GROUP_NOT_FOUND', 'Group not found.');
  end if;

  -- ---------- Teams ----------
  v_team1 := match_private.team(p_request -> 'team1');
  v_team2 := match_private.team(p_request -> 'team2');
  if v_team1 is null or v_team2 is null then
    return match_private.error('INVALID_TEAMS', 'Each team must have exactly two players.');
  end if;
  v_players := v_team1 || v_team2;
  if (select count(distinct p) from unnest(v_players) as p) <> 4 then
    return match_private.error('INVALID_TEAMS', 'A match needs four different players.');
  end if;

  -- Key share blocks a concurrent player deletion until this transaction ends,
  -- so it cannot miss the new match when it rewrites the group's teams.
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

  -- ---------- Sets ----------
  if jsonb_typeof(p_request -> 'sets') is distinct from 'array'
    or jsonb_array_length(p_request -> 'sets') not between 1 and c_max_sets then
    return match_private.error('INVALID_SETS', format('A match has between 1 and %s sets.', c_max_sets));
  end if;

  for v_set, v_set_number in
    select value, ordinality from jsonb_array_elements(p_request -> 'sets') with ordinality
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
    v_swapped_sets := v_swapped_sets || jsonb_build_array(jsonb_build_object(
      'team1Score', (v_set ->> 'team2Score')::integer,
      'team2Score', (v_set ->> 'team1Score')::integer
    ));
  end loop;

  -- ---------- Date and court ----------
  if jsonb_typeof(p_request -> 'date') is null or jsonb_typeof(p_request -> 'date') = 'null' then
    v_date := v_now;
  else
    v_date := match_private.try_timestamp(p_request -> 'date');
    if v_date is null then
      return match_private.error('INVALID_DATE', 'date must be an ISO 8601 date and time with a UTC offset.');
    end if;
    -- Matches are recorded after they are played; allow a little clock skew.
    if v_date > v_now + interval '5 minutes' then
      return match_private.error('INVALID_DATE', 'The match date is in the future.');
    end if;
    if v_date < v_now - interval '1 year' then
      return match_private.error('INVALID_DATE', 'The match date is more than a year ago.');
    end if;
  end if;

  if jsonb_typeof(p_request -> 'courtNumber') is not null
    and jsonb_typeof(p_request -> 'courtNumber') <> 'null' then
    if jsonb_typeof(p_request -> 'courtNumber') <> 'number' then
      return match_private.error('INVALID_REQUEST', 'courtNumber must be a whole number from 1 to 99.');
    end if;
    if (p_request ->> 'courtNumber')::numeric not between 1 and 99
      or (p_request ->> 'courtNumber')::numeric <> trunc((p_request ->> 'courtNumber')::numeric) then
      return match_private.error('INVALID_REQUEST', 'courtNumber must be a whole number from 1 to 99.');
    end if;
    v_court := (p_request ->> 'courtNumber')::integer;
  end if;

  -- ---------- Events ----------
  if jsonb_typeof(p_request -> 'events') is not null
    and jsonb_typeof(p_request -> 'events') <> 'null' then
    if jsonb_typeof(p_request -> 'events') <> 'array'
      or jsonb_array_length(p_request -> 'events') > c_max_events then
      return match_private.error('INVALID_EVENTS', format('A match can have at most %s events.', c_max_events));
    end if;
    for v_event in select value from jsonb_array_elements(p_request -> 'events') loop
      if jsonb_typeof(v_event) is distinct from 'object'
        or (select array_agg(k order by k) from jsonb_object_keys(v_event) as k)
          is distinct from array['playerId', 'type']
        or jsonb_typeof(v_event -> 'type') <> 'string'
        -- The vocabulary itself lives in @padelaso/domain, as for native commands.
        or (v_event ->> 'type') !~ '^[a-z][a-z0-9_]{0,63}$' then
        return match_private.error('INVALID_EVENTS', 'Each event needs a playerId and a type.');
      end if;
      if match_private.try_uuid(v_event -> 'playerId') is null
        or not (match_private.try_uuid(v_event -> 'playerId') = any(v_players)) then
        return match_private.error('INVALID_EVENTS', 'Every event must belong to one of the match''s four players.');
      end if;
      v_events := v_events || jsonb_build_array(jsonb_build_object(
        'playerId', match_private.try_uuid(v_event -> 'playerId'),
        'type', v_event ->> 'type'
      ));
    end loop;
  end if;

  -- ---------- Idempotency key ----------
  if jsonb_typeof(p_request -> 'idempotencyKey') is not null
    and jsonb_typeof(p_request -> 'idempotencyKey') <> 'null' then
    if jsonb_typeof(p_request -> 'idempotencyKey') <> 'string'
      or (p_request ->> 'idempotencyKey') !~ '^[A-Za-z0-9._:-]{8,128}$' then
      return match_private.error('INVALID_REQUEST',
        'idempotencyKey must be 8 to 128 letters, digits or . _ : - characters.');
    end if;
    v_key := p_request ->> 'idempotencyKey';
  end if;

  -- Normalized, so a retry that only spells the same values differently replays.
  v_request := jsonb_build_object(
    'groupId', v_group_id,
    'team1', to_jsonb(v_team1),
    'team2', to_jsonb(v_team2),
    'sets', v_sets,
    'date', case when jsonb_typeof(p_request -> 'date') = 'string'
      then match_private.timestamp(v_date) end,
    'courtNumber', v_court,
    'events', v_events
  );

  -- This block is a subtransaction: any exception below undoes the whole call.
  begin
    perform pg_advisory_xact_lock(hashtextextended('public.create_match:' || v_group_id::text, 0));

    if v_key is not null then
      delete from match_private.creation_receipts
      where user_id = v_user_id and retain_until < v_now;

      select * into v_receipt
      from match_private.creation_receipts
      where user_id = v_user_id and idempotency_key = v_key;

      if found then
        if v_receipt.request <> v_request then
          return match_private.error('IDEMPOTENCY_KEY_REUSED',
            'This idempotency key was already used for a different match.');
        end if;
        return match_private.summary(v_receipt.match_id, 'replayed');
      end if;
    end if;

    -- Teams compare as sets (both arrays hold two distinct IDs), in either order.
    select m.id into v_match_id
    from public.matches as m
    where m.group_id = v_group_id
      and m.created_at >= v_now - c_duplicate_window
      and m.date between v_date - c_date_tolerance and v_date + c_date_tolerance
      and (
        (m.team1 @> v_team1 and m.team1 <@ v_team1 and m.team2 @> v_team2 and m.team2 <@ v_team2
          and m.sets = v_sets)
        or (m.team1 @> v_team2 and m.team1 <@ v_team2 and m.team2 @> v_team1 and m.team2 <@ v_team1
          and m.sets = v_swapped_sets)
      )
    order by m.created_at desc, m.id
    limit 1;

    if found then
      v_status := 'duplicate';
    else
      v_status := 'created';
      insert into public.matches (group_id, team1, team2, sets, date, court_number, created_by)
      values (v_group_id, v_team1, v_team2, v_sets, v_date, v_court, v_user_id)
      returning id into v_match_id;

      insert into public.match_events (match_id, player_id, type, created_by)
      select v_match_id, (event ->> 'playerId')::uuid, event ->> 'type', v_user_id
      from jsonb_array_elements(v_events) with ordinality as item(event, position)
      order by position;
    end if;

    if v_key is not null then
      insert into match_private.creation_receipts (
        user_id, idempotency_key, match_id, request, retain_until
      )
      values (v_user_id, v_key, v_match_id, v_request, v_now + c_receipt_retention)
      on conflict do nothing;

      -- Only possible when the same user raced the same key in another group,
      -- because the group lock serializes every other case.
      if not found then
        raise exception 'idempotency key reused' using errcode = 'PM001';
      end if;
    end if;

    return match_private.summary(v_match_id, v_status);
  exception
    when sqlstate 'PM001' then
      return match_private.error('IDEMPOTENCY_KEY_REUSED',
        'This idempotency key was already used for a different match.');
    when lock_not_available or deadlock_detected then
      return match_private.error('BUSY', 'The group is busy. Try again in a moment.');
  end;
end;
$$;

revoke all on all functions in schema match_private from public;

-- Security definer on purpose: it writes receipts callers have no access to,
-- after checking auth.uid() and group membership itself (Supabase lint 0029, option 3).
revoke all on function public.create_match(jsonb) from public, anon, authenticated;
grant execute on function public.create_match(jsonb) to authenticated;
