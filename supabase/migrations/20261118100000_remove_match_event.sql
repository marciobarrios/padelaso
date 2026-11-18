-- Removing one mistaken event from a match (MAR-159).
--
-- public.remove_match_event deletes exactly one event of a match as the
-- calling user. It is the MCP server's first tool that removes data and follows
-- add_match_events: security definer, with auth.uid() and group membership
-- checked explicitly, and its bookkeeping in match_private, which PostgREST
-- does not expose. No service role is involved.
--
-- Rules:
--   * The caller is a member of the match's group. A missing match, another
--     group's match and a group the caller isn't in all return MATCH_NOT_FOUND,
--     as get_match_detail does.
--   * The event must belong to that match. An event of another match, or one
--     that never existed, returns EVENT_NOT_FOUND, so the answer never reveals
--     that it exists elsewhere.
--   * expectedVersion is the version get_match returned. When the match changed
--     since (any writer, any change), the call is refused with STALE_VERSION and
--     nothing is removed, so a removal is always based on what the user saw.
--
-- Retries: removing an event that this function already removed succeeds with
-- status already_removed and changes nothing. match_private.removed_events keeps
-- a short-lived record of each removal (48 hours) to tell "already removed" from
-- "never existed". The replay is checked before the version: the removal itself
-- bumped the version, so the retry carries an older one by design.
--
-- Concurrency: the match row is share-locked and its native_private.match_state
-- row locked for update (match first, then state, the order every writer uses),
-- so the version can't change between the check and the delete, and a
-- concurrent identical retry waits and then finds the record.

create table match_private.removed_events (
  event_id uuid primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  -- What was removed, so a retry can report it. No foreign key to players: a
  -- record must not block deleting a player.
  player_id uuid not null,
  type text not null,
  removed_by uuid not null references auth.users(id) on delete cascade,
  removed_at timestamptz not null,
  retain_until timestamptz not null
);

create index idx_removed_events_match_id on match_private.removed_events(match_id);
create index idx_removed_events_removed_by on match_private.removed_events(removed_by);
create index idx_removed_events_retain_until on match_private.removed_events(retain_until);

alter table match_private.removed_events enable row level security;

create function public.remove_match_event(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
as $$
declare
  c_fields constant text[] := array['groupId', 'matchId', 'eventId', 'expectedVersion'];
  c_retention constant interval := '48 hours';
  v_now timestamptz := now();
  v_user_id uuid := (select auth.uid());
  v_unknown text;
  v_group_id uuid;
  v_match_id uuid;
  v_event_id uuid;
  v_expected numeric;
  v_version bigint;
  v_removed jsonb;
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
  v_event_id := match_private.try_uuid(p_request -> 'eventId');
  if v_group_id is null or v_match_id is null or v_event_id is null then
    return match_private.error('INVALID_REQUEST', 'groupId, matchId and eventId must be IDs.');
  end if;

  if jsonb_typeof(p_request -> 'expectedVersion') is distinct from 'number' then
    return match_private.error('INVALID_REQUEST', 'expectedVersion must be the version from get_match.');
  end if;
  v_expected := (p_request ->> 'expectedVersion')::numeric;
  if v_expected < 0 or v_expected <> trunc(v_expected) or v_expected > 9223372036854775807 then
    return match_private.error('INVALID_REQUEST', 'expectedVersion must be the version from get_match.');
  end if;

  -- This block is a subtransaction: any exception below undoes the whole call.
  begin
    perform 1
    from public.matches as m
    where m.id = v_match_id
      and m.group_id = v_group_id
      and exists (
        select 1 from public.group_members as member
        where member.group_id = m.group_id and member.user_id = v_user_id
      )
    for share of m;

    -- Before the replay as well: a removed member can't read through a retry.
    if not found then
      return match_private.error('MATCH_NOT_FOUND', 'Match not found in this group.');
    end if;

    select state.revision into strict v_version
    from native_private.match_state as state
    where state.match_id = v_match_id
    for update;

    delete from match_private.removed_events where retain_until < v_now;

    -- The live event first: native clients choose event IDs, so an ID removed
    -- here may be recorded again later, and then it must be removable.
    if exists (
      select 1 from public.match_events
      where id = v_event_id and match_id = v_match_id
    ) then
      if v_version <> v_expected then
        return match_private.error('STALE_VERSION',
          'The match changed since it was read. Read it again before removing an event.');
      end if;

      -- The trigger on match_events bumps the version.
      delete from public.match_events
      where id = v_event_id and match_id = v_match_id
      returning jsonb_build_object('id', id, 'playerId', player_id, 'type', type)
      into v_removed;

      insert into match_private.removed_events (
        event_id, match_id, player_id, type, removed_by, removed_at, retain_until
      )
      values (
        v_event_id, v_match_id, (v_removed ->> 'playerId')::uuid, v_removed ->> 'type',
        v_user_id, v_now, v_now + c_retention
      )
      on conflict (event_id) do update set
        match_id = excluded.match_id,
        player_id = excluded.player_id,
        type = excluded.type,
        removed_by = excluded.removed_by,
        removed_at = excluded.removed_at,
        retain_until = excluded.retain_until;
      v_status := 'removed';
    else
      select jsonb_build_object('id', removed.event_id, 'playerId', removed.player_id, 'type', removed.type)
      into v_removed
      from match_private.removed_events as removed
      where removed.event_id = v_event_id and removed.match_id = v_match_id;

      if not found then
        return match_private.error('EVENT_NOT_FOUND', 'Event not found in this match.');
      end if;
      v_status := 'already_removed';
    end if;

    return match_private.summary(v_match_id, v_status) || jsonb_build_object(
      'version', (select revision from native_private.match_state where match_id = v_match_id),
      'removedEvent', v_removed
    );
  exception
    when lock_not_available or deadlock_detected then
      return match_private.error('BUSY', 'The match is busy. Try again in a moment.');
  end;
end;
$$;

-- Security definer on purpose: OAuth tokens may not delete match_events, and it
-- writes removal records callers have no access to, after checking auth.uid()
-- and group membership itself (Supabase lint 0029, option 3).
revoke all on function public.remove_match_event(jsonb) from public, anon, authenticated;
grant execute on function public.remove_match_event(jsonb) to authenticated;

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
    'rpc/remove_match_event'
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
