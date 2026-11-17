-- Match detail for MCP targeting (MAR-157).
--
-- public.get_match_detail returns one match with its events' IDs and a version,
-- so an assistant can name the exact match and event a later edit should change
-- (MAR-158 to MAR-160). It only reads.
--
-- OAuth client tokens still can't read public.match_events directly (MAR-144);
-- this function is their only path to events. Like create_match it is security
-- definer and checks auth.uid() and group membership itself. A match that
-- doesn't exist, that belongs to another group, or whose group the caller isn't
-- in all return MATCH_NOT_FOUND, so the answer never reveals that it exists.
--
-- `version` is native_private.match_state.revision. Triggers bump it on every
-- change to the match's teams, sets, date, court or group and on every event
-- insert or delete, whichever writer made it (web, native, MCP), so edit tools
-- can refuse a request based on an older read.

create function public.get_match_detail(p_group_id uuid, p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_version bigint;
begin
  if v_user_id is null then
    return match_private.error('AUTH_REQUIRED', 'Sign in to read matches.');
  end if;

  select state.revision into v_version
  from public.matches as m
  join native_private.match_state as state on state.match_id = m.id
  where m.id = p_match_id
    and m.group_id = p_group_id
    and exists (
      select 1 from public.group_members as member
      where member.group_id = m.group_id and member.user_id = v_user_id
    );

  if not found then
    return match_private.error('MATCH_NOT_FOUND', 'Match not found in this group.');
  end if;

  return match_private.summary(p_match_id, 'found') || jsonb_build_object('version', v_version);
end;
$$;

-- Security definer on purpose: OAuth tokens may not read match_events or
-- native_private, and the membership check above replaces RLS.
revoke all on function public.get_match_detail(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_match_detail(uuid, uuid) to authenticated;

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
  if v_method = 'POST'
    and v_path in ('rpc/create_match', 'rpc/hit_mcp_rate_limit', 'rpc/get_match_detail') then
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
