-- MAR-144: OAuth client tokens get no more than the MCP tools need.
--
-- Supabase's OAuth server issues ordinary `authenticated` JWTs plus a
-- `client_id` claim. Whoever holds one (the connected AI client) can call the
-- Data API directly, not just through /api/mcp, so the database itself must
-- limit them. The MCP tools only:
--
--   * read groups, players and matches (GET/HEAD /groups, /players, /matches),
--   * record a match through public.create_match (POST /rpc/create_match).
--
-- Two layers, because neither covers everything alone:
--
--   1. Restrictive RLS policies. They apply to every product that reads the
--      tables with the caller's JWT (Data API, GraphQL, Realtime): no direct
--      writes to any table, and no reads beyond groups, players and matches.
--      Security definer functions such as create_match bypass RLS, so
--      they keep working.
--   2. A Data API pre-request guard. It allowlists the exact requests above,
--      which also blocks every other RPC (security definer ones bypass RLS)
--      and GraphQL (POST /rpc/graphql).
--
-- Ordinary app sessions (web, native) carry no client_id and are unaffected.

-- ------------------------------------------------------------
-- 1. Restrictive RLS policies
-- ------------------------------------------------------------
-- Restrictive policies are ANDed with the permissive ones, so they can only
-- take access away. `(select ...)` evaluates the claim once per statement.

-- Tables the MCP tools read: reads stay, writes go.
do $$
declare
  t text;
begin
  foreach t in array array['groups', 'players', 'matches'] loop
    execute format(
      'create policy "OAuth clients cannot insert" on public.%I as restrictive for insert to authenticated
         with check ((select auth.jwt() ->> %L) is null)', t, 'client_id');
    execute format(
      'create policy "OAuth clients cannot update" on public.%I as restrictive for update to authenticated
         using ((select auth.jwt() ->> %L) is null)', t, 'client_id');
    execute format(
      'create policy "OAuth clients cannot delete" on public.%I as restrictive for delete to authenticated
         using ((select auth.jwt() ->> %L) is null)', t, 'client_id');
  end loop;

  -- Tables the MCP tools never touch: no access at all.
  foreach t in array array[
    'profiles', 'group_members', 'match_events', 'match_votes', 'score_tokens', 'match_score_tokens'
  ] loop
    execute format(
      'create policy "OAuth clients have no access" on public.%I as restrictive for all to authenticated
         using ((select auth.jwt() ->> %L) is null)
         with check ((select auth.jwt() ->> %L) is null)', t, 'client_id', 'client_id');
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 2. Data API pre-request guard
-- ------------------------------------------------------------
-- Not in an exposed schema, so it can't be called as an RPC. PostgREST calls
-- it as the request's role on every request, so every API role needs it:
-- without the grant, all of that role's requests would fail.
create schema mcp_private;
revoke all on schema mcp_private from public;
grant usage on schema mcp_private to anon, authenticated, service_role;

create function mcp_private.check_request()
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
  if v_method = 'POST' and v_path = 'rpc/create_match' then
    return;
  end if;

  raise sqlstate 'PGRST' using
    message = json_build_object(
      'code', 'OAUTH_CLIENT_FORBIDDEN',
      'message', 'OAuth client tokens can only make the requests the Padelaso MCP server needs')::text,
    detail = json_build_object('status', 403, 'headers', json_build_object())::text;
end;
$$;

revoke all on function mcp_private.check_request() from public, anon, authenticated;
grant execute on function mcp_private.check_request() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'mcp_private.check_request';
notify pgrst, 'reload config';
