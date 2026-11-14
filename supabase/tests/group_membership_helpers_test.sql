BEGIN;

SELECT plan(14);

-- The helpers are no longer reachable as PostgREST RPCs.
SELECT ok(
  to_regprocedure('public.user_group_ids(uuid)') IS NULL,
  'user_group_ids is not in the exposed public schema'
);

SELECT ok(
  to_regprocedure('public.user_admin_group_ids(uuid)') IS NULL,
  'user_admin_group_ids is not in the exposed public schema'
);

SELECT ok(
  NOT has_schema_privilege('anon', 'private', 'USAGE'),
  'anonymous callers have no usage on the private schema'
);

SELECT ok(
  NOT has_function_privilege('anon', 'private.user_group_ids(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'private.user_admin_group_ids(uuid)', 'EXECUTE'),
  'anonymous callers cannot execute the membership helpers'
);

SELECT ok(
  has_function_privilege('authenticated', 'private.user_group_ids(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'private.user_admin_group_ids(uuid)', 'EXECUTE'),
  'authenticated can execute the helpers for RLS policy evaluation'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_proc
    WHERE pronamespace = 'private'::regnamespace
      AND proname IN ('user_group_ids', 'user_admin_group_ids')
      AND proconfig @> ARRAY['search_path=""']
  ),
  2,
  'both helpers pin an empty search_path'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'graphql_public')
      AND p.prosecdef
      AND p.proname IN ('user_group_ids', 'user_admin_group_ids')
  ),
  0,
  'no security definer membership helper remains in an exposed schema'
);

-- RLS behavior that depends on the helpers is unchanged.
INSERT INTO auth.users (id, email)
VALUES
  ('11000000-0000-0000-0000-000000000001', 'helper-admin@example.com'),
  ('11000000-0000-0000-0000-000000000002', 'helper-member@example.com'),
  ('11000000-0000-0000-0000-000000000003', 'helper-outsider@example.com');

INSERT INTO public.groups (id, name, emoji, invite_code, created_by)
VALUES (
  '21000000-0000-0000-0000-000000000001',
  'Helper group',
  'P',
  'HELP01',
  '11000000-0000-0000-0000-000000000001'
);

INSERT INTO public.group_members (group_id, user_id, role)
VALUES
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'admin'),
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002', 'member');

SET LOCAL ROLE authenticated;

SET LOCAL request.jwt.claim.sub = '11000000-0000-0000-0000-000000000002';

SELECT is(
  (SELECT count(*)::integer FROM public.groups WHERE id = '21000000-0000-0000-0000-000000000001'),
  1,
  'a member can view their group'
);

SELECT is(
  (SELECT count(*)::integer FROM public.group_members WHERE group_id = '21000000-0000-0000-0000-000000000001'),
  2,
  'a member can view the group members'
);

SELECT is_empty(
  $$
    UPDATE public.groups SET name = 'Renamed by member'
    WHERE id = '21000000-0000-0000-0000-000000000001'
    RETURNING id
  $$,
  'a non-admin member cannot update the group'
);

SET LOCAL request.jwt.claim.sub = '11000000-0000-0000-0000-000000000001';

SELECT isnt_empty(
  $$
    UPDATE public.groups SET name = 'Renamed by admin'
    WHERE id = '21000000-0000-0000-0000-000000000001'
    RETURNING id
  $$,
  'an admin can update the group'
);

SET LOCAL request.jwt.claim.sub = '11000000-0000-0000-0000-000000000003';

SELECT is(
  (SELECT count(*)::integer FROM public.groups WHERE id = '21000000-0000-0000-0000-000000000001'),
  0,
  'an outsider cannot view the group'
);

SELECT is(
  (SELECT count(*)::integer FROM public.group_members WHERE group_id = '21000000-0000-0000-0000-000000000001'),
  0,
  'an outsider cannot view the group members'
);

RESET ROLE;
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$ SELECT private.user_group_ids('11000000-0000-0000-0000-000000000002') $$,
  '42501',
  NULL,
  'an anonymous caller cannot call the helper directly'
);

SELECT * FROM finish();
ROLLBACK;
