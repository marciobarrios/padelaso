-- MAR-145: rate limit /api/mcp per user and per OAuth client.
--
-- The MCP route runs on serverless functions with no shared memory, so the
-- counters live here. Before running a request, /api/mcp calls
-- public.hit_mcp_rate_limit() with the caller's own token. It counts the request
-- in two fixed one-minute windows and returns both counts:
--
--   * per user and client: the (user, client_id) pair,
--   * per user: every client of that user together (client_id = '').
--
-- The limits themselves are app settings (MCP_RATE_LIMIT_PER_CLIENT,
-- MCP_RATE_LIMIT_PER_USER), compared in the app, so changing them needs no
-- migration. A caller who calls this RPC directly only spends their own budget.

create table mcp_private.rate_limit_windows (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- '' is the user's total across clients.
  client_id text not null,
  window_start timestamptz not null,
  requests integer not null check (requests > 0),
  primary key (user_id, client_id, window_start)
);

-- Only the security definer function below touches it.
alter table mcp_private.rate_limit_windows enable row level security;
revoke all on table mcp_private.rate_limit_windows from public, anon, authenticated;

create function public.hit_mcp_rate_limit()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_client text := (select auth.jwt() ->> 'client_id');
  v_window timestamptz := date_bin(interval '1 minute', now(), timestamptz '2000-01-01 00:00:00+00');
  v_client_requests integer;
  v_user_requests integer;
begin
  if v_user is null or v_client is null or v_client = '' then
    raise exception 'An OAuth access token is required' using errcode = '42501';
  end if;

  -- Earlier windows are never read again. The primary key's prefix makes this cheap.
  delete from mcp_private.rate_limit_windows
  where user_id = v_user and window_start < v_window;

  -- The user-wide row is always locked first, so concurrent requests from two
  -- clients of one user can't deadlock.
  insert into mcp_private.rate_limit_windows as w (user_id, client_id, window_start, requests)
  values (v_user, '', v_window, 1)
  on conflict (user_id, client_id, window_start) do update set requests = w.requests + 1
  returning w.requests into v_user_requests;

  insert into mcp_private.rate_limit_windows as w (user_id, client_id, window_start, requests)
  values (v_user, v_client, v_window, 1)
  on conflict (user_id, client_id, window_start) do update set requests = w.requests + 1
  returning w.requests into v_client_requests;

  return jsonb_build_object(
    'client_requests', v_client_requests,
    'user_requests', v_user_requests,
    'retry_after', greatest(1, ceil(extract(epoch from v_window + interval '1 minute' - now())))::integer
  );
end;
$$;

revoke all on function public.hit_mcp_rate_limit() from public, anon, authenticated;
grant execute on function public.hit_mcp_rate_limit() to authenticated;

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
  if v_method = 'POST' and v_path in ('rpc/create_match', 'rpc/hit_mcp_rate_limit') then
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
