-- Native scoring commands (MAR-46).
--
-- Implements the v1 contract in packages/data/README.md. A command is bound to
-- an explicit match + scoring session, and one transaction authorizes,
-- deduplicates, checks session/revision/sequence/target, applies the change and
-- saves its receipt. The legacy Shortcut routes, the increment RPC and web writes
-- keep working: triggers make their changes visible as new revisions, so a native
-- client holding an older revision must resynchronize instead of silently rebasing.
--
-- Rollout: additive. Old deployments keep writing the same columns.

-- ------------------------------------------------------------
-- Stable event order
-- ------------------------------------------------------------
-- Generated always, so clients cannot choose their position in the event order.
-- Values are globally increasing, so a match's sequence has gaps. The contract
-- allows that.
alter table public.match_events add column sequence bigint;

with ordered as (
  select id, row_number() over (order by created_at, id) as position
  from public.match_events
)
update public.match_events as event
set sequence = ordered.position
from ordered
where event.id = ordered.id;

alter table public.match_events alter column sequence set not null;

do $$
declare
  next_sequence bigint;
begin
  select coalesce(max(sequence), 0) + 1 into next_sequence from public.match_events;
  execute format(
    'alter table public.match_events alter column sequence add generated always as identity (start with %s)',
    next_sequence
  );
end;
$$;

-- ------------------------------------------------------------
-- Server-owned state. RLS without policies: reachable only through the RPCs.
-- ------------------------------------------------------------
create table public.native_match_state (
  match_id uuid primary key references public.matches(id) on delete cascade,
  session_id uuid not null default gen_random_uuid(),
  revision bigint not null default 0,
  -- Parallel to matches.sets, which legacy writers replace as id-less scores.
  set_ids text[] not null default '{}'
);

create table public.native_command_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  match_id uuid not null references public.matches(id) on delete cascade,
  payload jsonb not null,
  applied_revision bigint not null,
  retain_until timestamptz not null,
  primary key (user_id, command_id)
);

create index idx_native_command_receipts_match_id
  on public.native_command_receipts(match_id);

-- Keyed by user so one account cannot advance another account's client ordering.
create table public.native_client_sequences (
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  session_id uuid not null,
  client_id text not null,
  last_sequence bigint not null,
  primary key (user_id, session_id, client_id)
);

create index idx_native_client_sequences_match_id
  on public.native_client_sequences(match_id);

alter table public.native_match_state enable row level security;
alter table public.native_command_receipts enable row level security;
alter table public.native_client_sequences enable row level security;

revoke all on table public.native_match_state from public, anon, authenticated;
revoke all on table public.native_command_receipts from public, anon, authenticated;
revoke all on table public.native_client_sequences from public, anon, authenticated;

-- ------------------------------------------------------------
-- Keep state in step with every writer
-- ------------------------------------------------------------
-- Set identity follows position: writers that only grow or shrink the array keep
-- earlier IDs. Any such write also bumps the revision, so a command based on the
-- previous positions is rejected as stale.
create function public.native_fit_set_ids(p_set_ids text[], p_length integer)
returns text[]
language sql
volatile
set search_path = ''
as $$
  select p_set_ids[1:p_length] || array(
    select gen_random_uuid()::text
    from generate_series(cardinality(p_set_ids) + 1, p_length)
  );
$$;

create function public.native_set_count(p_sets jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_sets) = 'array' then jsonb_array_length(p_sets) else 0 end;
$$;

insert into public.native_match_state (match_id, set_ids)
select id, public.native_fit_set_ids('{}', public.native_set_count(sets))
from public.matches;

create function public.native_on_match_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.native_match_state (match_id, set_ids)
  values (new.id, public.native_fit_set_ids('{}', public.native_set_count(new.sets)));
  return null;
end;
$$;

create function public.native_on_match_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.native_match_state
  set
    revision = revision + 1,
    set_ids = public.native_fit_set_ids(set_ids, public.native_set_count(new.sets))
  where match_id = new.id;
  return null;
end;
$$;

create function public.native_on_match_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Finds no row while a match delete cascades. Nothing is left to version then.
  update public.native_match_state
  set revision = revision + 1
  where match_id = coalesce(new.match_id, old.match_id);
  return null;
end;
$$;

create trigger native_match_inserted
  after insert on public.matches
  for each row execute function public.native_on_match_insert();

create trigger native_match_updated
  after update on public.matches
  for each row
  when (
    old.sets is distinct from new.sets
    or old.team1 is distinct from new.team1
    or old.team2 is distinct from new.team2
    or old.date is distinct from new.date
    or old.court_number is distinct from new.court_number
    or old.group_id is distinct from new.group_id
  )
  execute function public.native_on_match_update();

create trigger native_match_event_changed
  after insert or delete on public.match_events
  for each row execute function public.native_on_match_event_change();

-- ------------------------------------------------------------
-- Wire helpers
-- ------------------------------------------------------------
create function public.native_timestamp(p_value timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p_value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

create function public.native_error(
  p_command_id text,
  p_code text,
  p_message text,
  p_canonical_revision bigint default null,
  p_retry_after_ms bigint default null
) returns jsonb
language sql
volatile
set search_path = ''
as $$
  select jsonb_build_object(
    'version', 1,
    'commandId', p_command_id,
    'occurredAt', public.native_timestamp(clock_timestamp()),
    'code', p_code,
    'message', p_message,
    'retryAfterMs', p_retry_after_ms,
    'canonicalRevision', p_canonical_revision
  );
$$;

create function public.native_try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when data_exception then
  return null;
end;
$$;

create function public.native_try_timestamp(p_value text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$' then
    return null;
  end if;
  return p_value::timestamptz;
exception when data_exception then
  return null;
end;
$$;

-- Volatile so a read inside the command function sees that command's own writes.
create function public.native_build_snapshot(p_match_id uuid)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select jsonb_build_object(
    'version', 1,
    'matchId', m.id,
    'sessionId', state.session_id,
    'groupId', m.group_id,
    'revision', state.revision,
    'generatedAt', public.native_timestamp(clock_timestamp()),
    'authorizationExpiresAt', null,
    'date', public.native_timestamp(m.date),
    'courtNumber', m.court_number,
    'roster', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('id', player.id, 'name', player.name, 'emoji', player.emoji)
          order by player.id
        ),
        '[]'::jsonb
      )
      from public.players as player
      where player.id = any(m.team1 || m.team2)
        or exists (
          select 1 from public.match_events as event
          where event.match_id = m.id and event.player_id = player.id
        )
    ),
    'team1', to_jsonb(m.team1),
    'team2', to_jsonb(m.team2),
    'sets', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', state.set_ids[item.position::integer],
            'team1Score', coalesce((item.score ->> 'team1Score')::bigint, 0),
            'team2Score', coalesce((item.score ->> 'team2Score')::bigint, 0)
          )
          order by item.position
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements(m.sets) with ordinality as item(score, position)
    ),
    -- Scoring targets the latest set, matching the legacy increment RPC.
    'activeSetId', state.set_ids[cardinality(state.set_ids)],
    'events', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', event.id,
            'playerId', event.player_id,
            'type', event.type,
            'sequence', event.sequence,
            'createdAt', public.native_timestamp(event.created_at)
          )
          order by event.sequence
        ),
        '[]'::jsonb
      )
      from public.match_events as event
      where event.match_id = m.id
    )
  )
  from public.matches as m
  join public.native_match_state as state on state.match_id = m.id
  where m.id = p_match_id;
$$;

-- Commands reject unknown fields rather than silently discarding intent. The API
-- routes also apply the Zod schema, but this function is reachable directly
-- through PostgREST and so validates the shape itself. Event type vocabulary
-- stays in @padelaso/domain and is enforced by Zod: direct table inserts already
-- accept any type under RLS, so this RPC gives no additional capability.
create function public.native_command_is_well_formed(c jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  max_safe constant numeric := 9007199254740991;
  max_score constant numeric := 2147483647;
  fields text[];
  id_field text;
begin
  fields := case c ->> 'kind'
    when 'score.delta' then array['setId', 'team', 'delta']
    when 'score.correct' then array['setId', 'score']
    when 'set.create' then array['afterSetId', 'setId']
    when 'event.create' then array['eventId', 'playerId', 'type']
    when 'event.undo' then array['eventId']
  end;
  if fields is null then
    return false;
  end if;

  if (select array_agg(k order by k) from jsonb_object_keys(c) as k) is distinct from (
    select array_agg(k order by k)
    from unnest(fields || array[
      'version', 'matchId', 'sessionId', 'commandId', 'clientId', 'sequence',
      'expectedRevision', 'createdAt', 'expiresAt', 'kind'
    ]) as k
  ) then
    return false;
  end if;

  foreach id_field in array array['matchId', 'sessionId', 'clientId'] loop
    if jsonb_typeof(c -> id_field) <> 'string'
      or length(c ->> id_field) not between 1 and 128 then
      return false;
    end if;
  end loop;

  foreach id_field in array array['setId', 'eventId', 'playerId'] loop
    if c ? id_field and (
      jsonb_typeof(c -> id_field) <> 'string'
      or length(c ->> id_field) not between 1 and 128
    ) then
      return false;
    end if;
  end loop;

  foreach id_field in array array['sequence', 'expectedRevision'] loop
    if jsonb_typeof(c -> id_field) <> 'number'
      or (c ->> id_field)::numeric not between 0 and max_safe
      or (c ->> id_field)::numeric <> trunc((c ->> id_field)::numeric) then
      return false;
    end if;
  end loop;

  case c ->> 'kind'
    when 'score.delta' then
      return (c -> 'team') in ('1'::jsonb, '2'::jsonb)
        and (c -> 'delta') in ('-1'::jsonb, '1'::jsonb);
    when 'score.correct' then
      return jsonb_typeof(c -> 'score') = 'object'
        and (select count(*) from jsonb_object_keys(c -> 'score')) = 2
        and jsonb_typeof(c #> '{score,team1Score}') = 'number'
        and jsonb_typeof(c #> '{score,team2Score}') = 'number'
        and (c #>> '{score,team1Score}')::numeric between 0 and max_score
        and (c #>> '{score,team2Score}')::numeric between 0 and max_score
        and (c #>> '{score,team1Score}')::numeric = trunc((c #>> '{score,team1Score}')::numeric)
        and (c #>> '{score,team2Score}')::numeric = trunc((c #>> '{score,team2Score}')::numeric);
    when 'set.create' then
      return jsonb_typeof(c -> 'afterSetId') = 'null'
        or (
          jsonb_typeof(c -> 'afterSetId') = 'string'
          and length(c ->> 'afterSetId') between 1 and 128
        );
    when 'event.create' then
      return jsonb_typeof(c -> 'type') = 'string'
        and length(c ->> 'type') between 1 and 64;
    else
      return true;
  end case;
end;
$$;

-- ------------------------------------------------------------
-- RPCs
-- ------------------------------------------------------------
create function public.native_match_snapshot(p_match_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_match_id uuid := public.native_try_uuid(p_match_id);
  v_group_id uuid;
begin
  if v_user_id is null then
    return public.native_error(null, 'AUTH_EXPIRED', 'Authenticate again');
  end if;

  select group_id into v_group_id from public.matches where id = v_match_id;
  if not found then
    return public.native_error(null, 'NOT_FOUND', 'Match not found');
  end if;

  if not exists (
    select 1 from public.group_members
    where group_id = v_group_id and user_id = v_user_id
  ) then
    return public.native_error(null, 'FORBIDDEN', 'Not a member of this match''s group');
  end if;

  return public.native_build_snapshot(v_match_id);
end;
$$;

create function public.native_replace_scoring_session(p_match_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_match_id uuid := public.native_try_uuid(p_match_id);
  v_group_id uuid;
begin
  if v_user_id is null then
    return public.native_error(null, 'AUTH_EXPIRED', 'Authenticate again');
  end if;

  begin
    select group_id into v_group_id from public.matches where id = v_match_id for update;
    if not found then
      return public.native_error(null, 'NOT_FOUND', 'Match not found');
    end if;

    if not exists (
      select 1 from public.group_members
      where group_id = v_group_id and user_id = v_user_id
    ) then
      return public.native_error(null, 'FORBIDDEN', 'Not a member of this match''s group');
    end if;

    update public.native_match_state
    set session_id = gen_random_uuid(), revision = revision + 1
    where match_id = v_match_id;

    return public.native_build_snapshot(v_match_id);
  exception when lock_not_available or deadlock_detected then
    return public.native_error(null, 'IN_FLIGHT', 'Match is busy', null, 1000);
  end;
end;
$$;

create function public.native_apply_command(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_now timestamptz := clock_timestamp();
  -- Echoed as sent: Swift's UUID generates uppercase text.
  v_command_text text;
  v_command_id uuid;
  v_created_at timestamptz;
  v_expires_at timestamptz;
  v_match_id uuid;
  v_kind text;
  v_group_id uuid;
  v_team1 uuid[];
  v_team2 uuid[];
  v_sets jsonb;
  v_state public.native_match_state%rowtype;
  v_receipt public.native_command_receipts%rowtype;
  v_expected_revision bigint;
  v_sequence bigint;
  v_last_sequence bigint;
  v_set_id text;
  v_set_index integer;
  v_set_count integer;
  v_field text;
  v_score bigint;
  v_event_id uuid;
  v_player_id uuid;
  v_applied_revision bigint;
begin
  if jsonb_typeof(p_command) is distinct from 'object' then
    return public.native_error(null, 'INVALID_REQUEST', 'Command must be a JSON object');
  end if;

  v_command_id := public.native_try_uuid(p_command ->> 'commandId');
  if v_command_id is not null and jsonb_typeof(p_command -> 'commandId') = 'string' then
    v_command_text := p_command ->> 'commandId';
  else
    v_command_id := null;
  end if;

  if v_user_id is null then
    return public.native_error(v_command_text, 'AUTH_EXPIRED', 'Authenticate again');
  end if;

  if (p_command -> 'version') is distinct from '1'::jsonb then
    return public.native_error(v_command_text, 'UNSUPPORTED_VERSION', 'Unsupported command version');
  end if;

  if v_command_id is null or not public.native_command_is_well_formed(p_command) then
    return public.native_error(v_command_text, 'INVALID_REQUEST', 'Malformed command');
  end if;

  v_created_at := public.native_try_timestamp(p_command ->> 'createdAt');
  v_expires_at := public.native_try_timestamp(p_command ->> 'expiresAt');
  if v_created_at is null or v_expires_at is null
    or v_expires_at <= v_created_at
    or v_expires_at - v_created_at > interval '24 hours'
    -- createdAt is client-supplied. Without this bound, a future-dated command
    -- could outlive its receipt and then be applied a second time.
    or v_expires_at > v_now + interval '24 hours 5 minutes' then
    return public.native_error(v_command_text, 'INVALID_REQUEST', 'Invalid command lifetime');
  end if;

  -- Checked before the receipt lookup, so the outcome is the same whether or not
  -- the receipt has been evicted.
  if v_expires_at <= v_now then
    return public.native_error(v_command_text, 'COMMAND_EXPIRED', 'Command expired');
  end if;

  v_match_id := public.native_try_uuid(p_command ->> 'matchId');
  v_kind := p_command ->> 'kind';
  v_expected_revision := (p_command ->> 'expectedRevision')::bigint;
  v_sequence := (p_command ->> 'sequence')::bigint;

  -- This block is a subtransaction: any exception below undoes the whole command.
  begin
    -- Lock order is always match, then state, as legacy writers do through their
    -- triggers. This row lock serializes commands for the match, so a concurrent
    -- identical retry waits and then finds the receipt.
    select group_id, team1, team2, sets
    into v_group_id, v_team1, v_team2, v_sets
    from public.matches
    where id = v_match_id
    for update;

    if not found then
      return public.native_error(v_command_text, 'NOT_FOUND', 'Match not found');
    end if;

    -- Before replay as well: a removed member cannot read through a retry.
    if not exists (
      select 1 from public.group_members
      where group_id = v_group_id and user_id = v_user_id
    ) then
      return public.native_error(v_command_text, 'FORBIDDEN', 'Not a member of this match''s group');
    end if;

    select * into strict v_state
    from public.native_match_state
    where match_id = v_match_id
    for update;

    delete from public.native_command_receipts
    where user_id = v_user_id and retain_until < v_now;

    select * into v_receipt
    from public.native_command_receipts
    where user_id = v_user_id and command_id = v_command_id;

    if found and v_receipt.payload <> p_command then
      return public.native_error(
        v_command_text, 'COMMAND_ID_REUSED', 'Command ID was used with a different payload',
        v_state.revision
      );
    end if;

    if (p_command ->> 'sessionId') is distinct from v_state.session_id::text then
      return public.native_error(
        v_command_text, 'STALE_SESSION', 'Scoring session was replaced', v_state.revision
      );
    end if;

    if v_receipt.command_id is not null then
      return jsonb_build_object(
        'version', 1,
        'matchId', v_match_id,
        'sessionId', v_state.session_id,
        'commandId', v_command_text,
        'status', 'replayed',
        'appliedRevision', v_receipt.applied_revision,
        'acknowledgedAt', public.native_timestamp(clock_timestamp()),
        'snapshot', public.native_build_snapshot(v_match_id)
      );
    end if;

    if v_expected_revision <> v_state.revision then
      return public.native_error(
        v_command_text, 'STALE_REVISION', 'Match changed; resynchronize', v_state.revision
      );
    end if;

    select last_sequence into v_last_sequence
    from public.native_client_sequences
    where user_id = v_user_id
      and session_id = v_state.session_id
      and client_id = p_command ->> 'clientId';

    if v_last_sequence is not null and v_sequence <= v_last_sequence then
      return public.native_error(
        v_command_text, 'OUT_OF_ORDER', 'Command sequence is not newer than the last applied',
        v_state.revision
      );
    end if;

    v_set_id := p_command ->> 'setId';
    v_set_count := cardinality(v_state.set_ids);

    case v_kind
      when 'score.delta', 'score.correct' then
        v_set_index := array_position(v_state.set_ids, v_set_id);
        if v_set_index is null or (v_kind = 'score.delta' and v_set_index <> v_set_count) then
          return public.native_error(
            v_command_text, 'STALE_SET', 'Set is not the expected scoring target', v_state.revision
          );
        end if;

        if v_kind = 'score.correct' then
          update public.matches
          set sets = jsonb_set(sets, array[(v_set_index - 1)::text], p_command -> 'score')
          where id = v_match_id;
        else
          v_field := case when (p_command -> 'team') = '1'::jsonb then 'team1Score' else 'team2Score' end;
          v_score := greatest(
            0,
            coalesce((v_sets -> (v_set_index - 1) ->> v_field)::bigint, 0)
              + (p_command ->> 'delta')::bigint
          );
          -- The legacy RPC and existing readers store scores as int.
          if v_score > 2147483647 then
            return public.native_error(
              v_command_text, 'INVALID_REQUEST', 'Score is too large', v_state.revision
            );
          end if;
          update public.matches
          set sets = jsonb_set(sets, array[(v_set_index - 1)::text, v_field], to_jsonb(v_score))
          where id = v_match_id;
        end if;

      when 'set.create' then
        if (p_command ->> 'afterSetId') is distinct from v_state.set_ids[v_set_count] then
          return public.native_error(
            v_command_text, 'STALE_SET', 'Predecessor is not the latest set', v_state.revision
          );
        end if;
        if v_set_id = any(v_state.set_ids) then
          return public.native_error(
            v_command_text, 'INVALID_REQUEST', 'Set ID already exists', v_state.revision
          );
        end if;
        if v_set_count >= 100 then
          return public.native_error(
            v_command_text, 'INVALID_REQUEST', 'Match set limit reached', v_state.revision
          );
        end if;
        -- IDs first, so the match trigger keeps this client-chosen ID.
        update public.native_match_state
        set set_ids = set_ids || v_set_id
        where match_id = v_match_id;
        update public.matches
        set sets = sets || jsonb_build_array(jsonb_build_object('team1Score', 0, 'team2Score', 0))
        where id = v_match_id;

      when 'event.create' then
        v_event_id := public.native_try_uuid(p_command ->> 'eventId');
        v_player_id := public.native_try_uuid(p_command ->> 'playerId');
        if v_event_id is null then
          return public.native_error(
            v_command_text, 'INVALID_REQUEST', 'Event ID must be a UUID', v_state.revision
          );
        end if;
        if v_player_id is null or not (v_player_id = any(v_team1 || v_team2)) then
          return public.native_error(
            v_command_text, 'INVALID_REQUEST', 'Player is not part of this match', v_state.revision
          );
        end if;
        if exists (select 1 from public.match_events where id = v_event_id) then
          return public.native_error(
            v_command_text, 'INVALID_REQUEST', 'Event ID already exists', v_state.revision
          );
        end if;
        insert into public.match_events (id, match_id, player_id, type, created_by)
        values (v_event_id, v_match_id, v_player_id, p_command ->> 'type', v_user_id);

      when 'event.undo' then
        v_event_id := public.native_try_uuid(p_command ->> 'eventId');
        delete from public.match_events
        where id = v_event_id and match_id = v_match_id;
        if not found then
          return public.native_error(
            v_command_text, 'NOT_FOUND', 'Event not found', v_state.revision
          );
        end if;
    end case;

    -- Triggers advanced the revision. A clamped or identical score writes nothing,
    -- so it is acknowledged at the unchanged revision.
    select revision into strict v_applied_revision
    from public.native_match_state
    where match_id = v_match_id;

    -- Retained at least 48 hours and past expiry plus clock skew.
    insert into public.native_command_receipts (
      user_id, command_id, match_id, payload, applied_revision, retain_until
    )
    values (
      v_user_id, v_command_id, v_match_id, p_command, v_applied_revision,
      greatest(v_now + interval '48 hours', v_expires_at + interval '24 hours')
    )
    on conflict do nothing;

    -- Only possible when the same user raced the same ID against a different
    -- match, because this match's lock serializes every other case.
    if not found then
      raise exception 'command id reused' using errcode = 'PN001';
    end if;

    insert into public.native_client_sequences (
      user_id, match_id, session_id, client_id, last_sequence
    )
    values (
      v_user_id, v_match_id, v_state.session_id, p_command ->> 'clientId', v_sequence
    )
    on conflict (user_id, session_id, client_id)
    do update set last_sequence = excluded.last_sequence;

    return jsonb_build_object(
      'version', 1,
      'matchId', v_match_id,
      'sessionId', v_state.session_id,
      'commandId', v_command_text,
      'status', 'applied',
      'appliedRevision', v_applied_revision,
      'acknowledgedAt', public.native_timestamp(clock_timestamp()),
      'snapshot', public.native_build_snapshot(v_match_id)
    );
  exception
    when sqlstate 'PN001' then
      return public.native_error(
        v_command_text, 'COMMAND_ID_REUSED', 'Command ID was used with a different payload'
      );
    when lock_not_available or deadlock_detected then
      return public.native_error(v_command_text, 'IN_FLIGHT', 'Match is busy; retry', null, 1000);
  end;
end;
$$;

revoke all on function public.native_fit_set_ids(text[], integer) from public, anon, authenticated;
revoke all on function public.native_set_count(jsonb) from public, anon, authenticated;
revoke all on function public.native_on_match_insert() from public, anon, authenticated;
revoke all on function public.native_on_match_update() from public, anon, authenticated;
revoke all on function public.native_on_match_event_change() from public, anon, authenticated;
revoke all on function public.native_timestamp(timestamptz) from public, anon, authenticated;
revoke all on function public.native_error(text, text, text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.native_try_uuid(text) from public, anon, authenticated;
revoke all on function public.native_try_timestamp(text) from public, anon, authenticated;
revoke all on function public.native_build_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.native_command_is_well_formed(jsonb) from public, anon, authenticated;
revoke all on function public.native_match_snapshot(text) from public, anon, authenticated;
revoke all on function public.native_replace_scoring_session(text) from public, anon, authenticated;
revoke all on function public.native_apply_command(jsonb) from public, anon, authenticated;

grant execute on function public.native_match_snapshot(text) to authenticated;
grant execute on function public.native_replace_scoring_session(text) to authenticated;
grant execute on function public.native_apply_command(jsonb) to authenticated;
