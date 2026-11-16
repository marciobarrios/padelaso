BEGIN;

SELECT plan(14);

INSERT INTO auth.users (id, email)
VALUES
  ('10000000-0000-0000-0000-000000000051', 'rate-one@example.com'),
  ('10000000-0000-0000-0000-000000000052', 'rate-two@example.com');

CREATE FUNCTION pg_temp.act_as(p_user uuid, p_client_id text DEFAULT NULL)
RETURNS void
LANGUAGE sql
AS $function$
  SELECT set_config('request.jwt.claims', jsonb_strip_nulls(jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'aud', 'authenticated', 'client_id', p_client_id
  ))::text, true);
$function$;

-- A window that ended long ago, to check it gets cleaned up.
INSERT INTO mcp_private.rate_limit_windows (user_id, client_id, window_start, requests)
VALUES ('10000000-0000-0000-0000-000000000051', 'chatgpt', now() - interval '1 hour', 99);

-- ------------------------------------------------------------
-- Privileges
-- ------------------------------------------------------------
SELECT ok(
  NOT has_function_privilege('anon', 'public.hit_mcp_rate_limit()', 'execute'),
  'anon cannot count requests'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.hit_mcp_rate_limit()', 'execute'),
  'authenticated can count its own requests'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'mcp_private.rate_limit_windows', 'select')
    AND NOT has_table_privilege('authenticated', 'mcp_private.rate_limit_windows', 'update'),
  'callers cannot read or reset the counters'
);

SET LOCAL ROLE authenticated;

-- ------------------------------------------------------------
-- Only OAuth client tokens are counted
-- ------------------------------------------------------------
SELECT pg_temp.act_as('10000000-0000-0000-0000-000000000051');
SELECT throws_ok('SELECT public.hit_mcp_rate_limit()', '42501', NULL, 'ordinary sessions are refused');

-- ------------------------------------------------------------
-- Under and over the limit: counts rise within the window
-- ------------------------------------------------------------
SELECT pg_temp.act_as('10000000-0000-0000-0000-000000000051', 'chatgpt');
SELECT is(public.hit_mcp_rate_limit() ->> 'client_requests', '1', 'first request counts 1 for the client');
SELECT is(public.hit_mcp_rate_limit() ->> 'client_requests', '2', 'second request counts 2');
SELECT is(
  public.hit_mcp_rate_limit() - 'retry_after',
  '{"client_requests": 3, "user_requests": 3}'::jsonb,
  'third request counts 3 for the client and the user'
);
SELECT ok(
  (public.hit_mcp_rate_limit() ->> 'retry_after')::integer <@ int4range(1, 60, '[]'),
  'retry_after points at the end of the current minute'
);

-- ------------------------------------------------------------
-- Separate budgets
-- ------------------------------------------------------------
SELECT pg_temp.act_as('10000000-0000-0000-0000-000000000051', 'claude');
SELECT is(
  public.hit_mcp_rate_limit() - 'retry_after',
  '{"client_requests": 1, "user_requests": 5}'::jsonb,
  'another client of the same user has its own budget but shares the user total'
);

SELECT pg_temp.act_as('10000000-0000-0000-0000-000000000052', 'chatgpt');
SELECT is(
  public.hit_mcp_rate_limit() - 'retry_after',
  '{"client_requests": 1, "user_requests": 1}'::jsonb,
  'another user of the same client does not share a budget'
);

RESET ROLE;

SELECT is(
  (SELECT requests FROM mcp_private.rate_limit_windows
   WHERE user_id = '10000000-0000-0000-0000-000000000051' AND client_id = 'chatgpt'),
  4,
  'one row per user and client in the current window'
);
SELECT is(
  (SELECT requests FROM mcp_private.rate_limit_windows
   WHERE user_id = '10000000-0000-0000-0000-000000000051' AND client_id = ''),
  5,
  'one user-wide row in the current window'
);
SELECT is(
  (SELECT count(*)::integer FROM mcp_private.rate_limit_windows WHERE window_start < date_bin(interval '1 minute', now(), timestamptz '2000-01-01 00:00:00+00')),
  0,
  'earlier windows are deleted'
);

-- Counters go with the account.
DELETE FROM auth.users WHERE id = '10000000-0000-0000-0000-000000000052';
SELECT is(
  (SELECT count(*)::integer FROM mcp_private.rate_limit_windows WHERE user_id = '10000000-0000-0000-0000-000000000052'),
  0,
  'deleting a user deletes their counters'
);

SELECT * FROM finish();
ROLLBACK;
