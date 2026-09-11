BEGIN;

SELECT plan(10);

INSERT INTO auth.users (id, email)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'owner@example.com'),
  ('10000000-0000-0000-0000-000000000002', 'outsider@example.com'),
  ('10000000-0000-0000-0000-000000000003', 'creator@example.com');

INSERT INTO public.groups (id, name, emoji, invite_code, created_by)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  'Invite-only group',
  'P',
  'JOIN01',
  '10000000-0000-0000-0000-000000000001'
);

INSERT INTO public.group_members (group_id, user_id, role)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'admin'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.group_members', 'INSERT'),
  'authenticated has no direct INSERT grant on group_members'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'group_members'
      AND cmd = 'INSERT'
  ),
  0,
  'group_members has no INSERT policy'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.create_group(text,text,text)',
    'EXECUTE'
  ),
  'authenticated can execute create_group'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.join_group_by_code(text)',
    'EXECUTE'
  ),
  'anonymous callers cannot execute join_group_by_code'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';

SELECT throws_ok(
  $$
    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      'admin'
    )
  $$,
  '42501',
  'permission denied for table group_members',
  'an outsider cannot directly join as an admin'
);

SELECT throws_ok(
  $$ SELECT public.join_group_by_code('WRONG1') $$,
  'P0002',
  'Grupo no encontrado',
  'an invalid invitation is rejected'
);

SELECT lives_ok(
  $$ SELECT public.join_group_by_code('JOIN01') $$,
  'a valid invitation can be used to join'
);

SELECT results_eq(
  $$
    SELECT role
    FROM public.group_members
    WHERE group_id = '20000000-0000-0000-0000-000000000001'
      AND user_id = '10000000-0000-0000-0000-000000000002'
  $$,
  ARRAY['member'::text],
  'joining by invitation always assigns the member role'
);

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';

SELECT lives_ok(
  $$ SELECT public.create_group('Created group', 'P', 'NEW001') $$,
  'an authenticated user can create a group'
);

SELECT results_eq(
  $$
    SELECT group_members.role
    FROM public.group_members
    JOIN public.groups ON groups.id = group_members.group_id
    WHERE groups.invite_code = 'NEW001'
      AND group_members.user_id = '10000000-0000-0000-0000-000000000003'
  $$,
  ARRAY['admin'::text],
  'group creation assigns admin only to the creator'
);

SELECT * FROM finish();
ROLLBACK;
