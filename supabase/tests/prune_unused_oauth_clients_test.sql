BEGIN;

SELECT plan(12);

-- ------------------------------------------------------------
-- Fixtures: one user and a set of OAuth clients.
-- ------------------------------------------------------------
INSERT INTO auth.users (id, email)
VALUES ('10000000-0000-0000-0000-000000000071', 'prune-oauth@example.com');

INSERT INTO auth.oauth_clients
  (id, client_name, registration_type, client_type, token_endpoint_auth_method, grant_types, redirect_uris, created_at, deleted_at)
VALUES
  -- Pruned: dynamic, two days old, never used.
  ('70000000-0000-0000-0000-000000000001', 'Orphan', 'dynamic', 'confidential', 'client_secret_post', 'authorization_code,refresh_token', 'https://claude.ai/api/mcp/auth_callback', now() - interval '2 days', NULL),
  -- Kept: registered within the last day; the user may still be connecting.
  ('70000000-0000-0000-0000-000000000002', 'Fresh', 'dynamic', 'confidential', 'client_secret_post', 'authorization_code,refresh_token', 'https://claude.ai/api/mcp/auth_callback', now() - interval '1 hour', NULL),
  -- Kept: has a consent.
  ('70000000-0000-0000-0000-000000000003', 'Consented', 'dynamic', 'confidential', 'client_secret_post', 'authorization_code,refresh_token', 'https://claude.ai/api/mcp/auth_callback', now() - interval '2 days', NULL),
  -- Kept: has an authorization request.
  ('70000000-0000-0000-0000-000000000004', 'Authorized', 'dynamic', 'public', 'none', 'authorization_code,refresh_token', 'https://www.cursor.com/agents/mcp/oauth/callback', now() - interval '2 days', NULL),
  -- Kept: has a session.
  ('70000000-0000-0000-0000-000000000005', 'Session', 'dynamic', 'public', 'none', 'authorization_code,refresh_token', 'https://www.cursor.com/agents/mcp/oauth/callback', now() - interval '2 days', NULL),
  -- Kept: registered by hand.
  ('70000000-0000-0000-0000-000000000006', 'Manual', 'manual', 'public', 'none', 'authorization_code,refresh_token', 'https://chatgpt.com/connector/oauth/x', now() - interval '2 days', NULL),
  -- Untouched: already deleted.
  ('70000000-0000-0000-0000-000000000007', 'Deleted', 'dynamic', 'public', 'none', 'authorization_code,refresh_token', 'https://chatgpt.com/connector/oauth/y', now() - interval '2 days', '2026-01-01 00:00:00+00');

INSERT INTO auth.oauth_consents (id, user_id, client_id, scopes)
VALUES ('71000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000071', '70000000-0000-0000-0000-000000000003', 'openid');

INSERT INTO auth.oauth_authorizations (id, authorization_id, client_id, redirect_uri, scope)
VALUES ('72000000-0000-0000-0000-000000000004', 'prune-test-authorization', '70000000-0000-0000-0000-000000000004', 'https://www.cursor.com/agents/mcp/oauth/callback', 'openid');

INSERT INTO auth.sessions (id, user_id, oauth_client_id)
VALUES ('73000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000071', '70000000-0000-0000-0000-000000000005');

-- ------------------------------------------------------------
-- Pruning
-- ------------------------------------------------------------
SELECT is(mcp_private.prune_unused_oauth_clients(), 1, 'prunes exactly one client');

SELECT isnt((SELECT deleted_at FROM auth.oauth_clients WHERE id = '70000000-0000-0000-0000-000000000001'), NULL, 'unused dynamic client older than a day is soft-deleted');
SELECT is((SELECT deleted_at FROM auth.oauth_clients WHERE id = '70000000-0000-0000-0000-000000000002'), NULL, 'client registered within the last day is kept');
SELECT is((SELECT deleted_at FROM auth.oauth_clients WHERE id = '70000000-0000-0000-0000-000000000003'), NULL, 'client with a consent is kept');
SELECT is((SELECT deleted_at FROM auth.oauth_clients WHERE id = '70000000-0000-0000-0000-000000000004'), NULL, 'client with an authorization is kept');
SELECT is((SELECT deleted_at FROM auth.oauth_clients WHERE id = '70000000-0000-0000-0000-000000000005'), NULL, 'client with a session is kept');
SELECT is((SELECT deleted_at FROM auth.oauth_clients WHERE id = '70000000-0000-0000-0000-000000000006'), NULL, 'manually registered client is kept');
SELECT is((SELECT deleted_at FROM auth.oauth_clients WHERE id = '70000000-0000-0000-0000-000000000007'), '2026-01-01 00:00:00+00'::timestamptz, 'already deleted client keeps its deleted_at');

SELECT is(mcp_private.prune_unused_oauth_clients(), 0, 'a second run prunes nothing');

-- ------------------------------------------------------------
-- Access and schedule
-- ------------------------------------------------------------
SELECT ok(
  NOT has_function_privilege('anon', 'mcp_private.prune_unused_oauth_clients()', 'execute')
  AND NOT has_function_privilege('authenticated', 'mcp_private.prune_unused_oauth_clients()', 'execute'),
  'anon and authenticated cannot execute prune_unused_oauth_clients'
);
SELECT ok(
  NOT has_function_privilege('service_role', 'mcp_private.prune_unused_oauth_clients()', 'execute'),
  'service_role cannot execute prune_unused_oauth_clients'
);

SELECT results_eq(
  $$ SELECT schedule, command FROM cron.job WHERE jobname = 'prune-unused-oauth-clients' $$,
  $$ VALUES ('0 4 1 * *'::text, 'select mcp_private.prune_unused_oauth_clients()'::text) $$,
  'cron job runs the prune at 04:00 UTC on the 1st of each month'
);

SELECT * FROM finish();
ROLLBACK;
