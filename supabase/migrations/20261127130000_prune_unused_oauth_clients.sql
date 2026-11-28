-- Prune unused OAuth clients left behind by dynamic client registration.
--
-- Claude and Cursor send two POST /oauth/clients/register requests a few
-- seconds apart when a user connects the MCP server, and keep only the second
-- client. Supabase creates a row for each, so every connection leaves one
-- orphaned client in the dashboard's OAuth Apps list.
--
-- Once a month, soft-delete dynamic clients that are over a day old and were
-- never used: no authorization request, no consent and no session. Setting
-- deleted_at is what the dashboard and the admin API do when you delete a
-- client by hand. Manually registered clients are never touched.

create extension if not exists pg_cron with schema pg_catalog;

create function mcp_private.prune_unused_oauth_clients()
returns integer
language sql
security invoker
set search_path = ''
as $$
  with pruned as (
    update auth.oauth_clients c
    set deleted_at = now(), updated_at = now()
    where c.registration_type = 'dynamic'
      and c.deleted_at is null
      and c.created_at < now() - interval '1 day'
      and not exists (select 1 from auth.oauth_authorizations a where a.client_id = c.id)
      and not exists (select 1 from auth.oauth_consents k where k.client_id = c.id)
      and not exists (select 1 from auth.sessions s where s.oauth_client_id = c.id)
    returning 1
  )
  select count(*)::integer from pruned;
$$;

comment on function mcp_private.prune_unused_oauth_clients() is
  'Soft-deletes dynamic OAuth clients older than a day that have no authorization, consent or session. Run monthly by pg_cron.';

-- mcp_private is usable by the API roles (see lock_down_oauth_client_tokens),
-- so keep this function to the cron job's owner only.
revoke all on function mcp_private.prune_unused_oauth_clients() from public, anon, authenticated, service_role;

-- 04:00 UTC on the 1st of every month. Scheduling by name replaces any
-- existing job with the same name.
select cron.schedule(
  'prune-unused-oauth-clients',
  '0 4 1 * *',
  'select mcp_private.prune_unused_oauth_clients()'
);
