BEGIN;

SELECT plan(13);

-- ------------------------------------------------------------
-- rls_auto_enable: not callable by clients
-- ------------------------------------------------------------
SELECT ok(
  NOT has_function_privilege('anon', 'public.rls_auto_enable()', 'execute'),
  'anon cannot execute rls_auto_enable'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute'),
  'authenticated cannot execute rls_auto_enable'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.rls_auto_enable() $$,
  '42501',
  NULL,
  'anon gets permission denied calling rls_auto_enable'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT public.rls_auto_enable() $$,
  '42501',
  NULL,
  'authenticated gets permission denied calling rls_auto_enable'
);
RESET ROLE;

-- ------------------------------------------------------------
-- ensure_rls: still enables RLS on new public tables
-- ------------------------------------------------------------
SELECT is(
  (SELECT evtfoid::regproc::text FROM pg_event_trigger WHERE evtname = 'ensure_rls' AND evtenabled = 'O'),
  'rls_auto_enable',
  'ensure_rls is enabled and runs rls_auto_enable'
);

CREATE TABLE public.mar68_created (id int);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.mar68_created'::regclass),
  'CREATE TABLE in public gets RLS enabled'
);

CREATE TABLE public.mar68_created_as AS SELECT 1 AS id;
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.mar68_created_as'::regclass),
  'CREATE TABLE AS in public gets RLS enabled'
);

CREATE TABLE public.mar68_partitioned (id int) PARTITION BY RANGE (id);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.mar68_partitioned'::regclass),
  'partitioned tables in public get RLS enabled'
);

CREATE SCHEMA mar68_other;
CREATE TABLE mar68_other.untouched (id int);
SELECT ok(
  NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'mar68_other.untouched'::regclass),
  'tables outside public are left alone'
);

-- ------------------------------------------------------------
-- generate_invite_code: fixed search_path, not for anon
-- ------------------------------------------------------------
SELECT is(
  (SELECT proconfig FROM pg_proc WHERE oid = 'public.generate_invite_code()'::regprocedure),
  ARRAY['search_path=""'],
  'generate_invite_code has an empty search_path'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.generate_invite_code()', 'execute'),
  'anon cannot execute generate_invite_code'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.generate_invite_code() $$,
  '42501',
  NULL,
  'anon gets permission denied calling generate_invite_code'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT matches(
  public.generate_invite_code(),
  '^[0-9A-F]{6}$',
  'generate_invite_code still returns a six-character code'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
