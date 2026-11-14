-- ============================================================
-- Move group membership helpers out of the exposed API schema (MAR-67)
-- ============================================================
-- user_group_ids(uid) and user_admin_group_ids(uid) are security definer and
-- take the user ID as an argument, so while they lived in `public` anyone with
-- the anon key could call /rest/v1/rpc/user_group_ids for any user's UUID.
--
-- PostgREST only exposes the schemas listed in config.toml (`public`,
-- `graphql_public`), so moving the functions to `private` removes the RPC
-- entry points. RLS policies reference functions by OID, so every policy that
-- calls them keeps working without being recreated.
--
-- Policies are evaluated as the querying role, and every policy that uses
-- these helpers is scoped to `authenticated`, so only that role keeps USAGE on
-- the schema and EXECUTE on the functions. `anon` gets neither.
-- ------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter function public.user_group_ids(uuid) set schema private;
alter function public.user_admin_group_ids(uuid) set schema private;

-- The bodies already fully qualify public.group_members.
alter function private.user_group_ids(uuid) set search_path = '';
alter function private.user_admin_group_ids(uuid) set search_path = '';

revoke all on function private.user_group_ids(uuid) from public, anon, authenticated;
revoke all on function private.user_admin_group_ids(uuid) from public, anon, authenticated;

grant execute on function private.user_group_ids(uuid) to authenticated;
grant execute on function private.user_admin_group_ids(uuid) to authenticated;
