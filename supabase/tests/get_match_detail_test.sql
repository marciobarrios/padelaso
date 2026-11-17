BEGIN;

SELECT plan(22);

-- ------------------------------------------------------------
-- Fixtures: a member, an outsider with their own group, and a match in each.
-- ------------------------------------------------------------
INSERT INTO auth.users (id, email)
VALUES
  ('10000000-0000-0000-0000-000000000061', 'detail-member@example.com'),
  ('10000000-0000-0000-0000-000000000062', 'detail-outsider@example.com');

INSERT INTO public.groups (id, name, emoji, invite_code, created_by)
VALUES
  ('20000000-0000-0000-0000-000000000061', 'Detail group', 'P', 'DETAL1', '10000000-0000-0000-0000-000000000061'),
  ('20000000-0000-0000-0000-000000000062', 'Outsider group', 'P', 'DETAL2', '10000000-0000-0000-0000-000000000062');

INSERT INTO public.group_members (group_id, user_id, role)
VALUES
  ('20000000-0000-0000-0000-000000000061', '10000000-0000-0000-0000-000000000061', 'member'),
  ('20000000-0000-0000-0000-000000000062', '10000000-0000-0000-0000-000000000062', 'member');

INSERT INTO public.players (id, name, emoji, group_id)
VALUES
  ('50000000-0000-0000-0000-000000000061', 'Ana', 'A', '20000000-0000-0000-0000-000000000061'),
  ('50000000-0000-0000-0000-000000000062', 'Pablo', 'P', '20000000-0000-0000-0000-000000000061'),
  ('50000000-0000-0000-0000-000000000063', 'Lucia', 'L', '20000000-0000-0000-0000-000000000061'),
  ('50000000-0000-0000-0000-000000000064', 'Marta', 'M', '20000000-0000-0000-0000-000000000061'),
  ('50000000-0000-0000-0000-000000000065', 'Oscar', 'O', '20000000-0000-0000-0000-000000000062'),
  ('50000000-0000-0000-0000-000000000066', 'Rosa', 'R', '20000000-0000-0000-0000-000000000062'),
  ('50000000-0000-0000-0000-000000000067', 'Sara', 'S', '20000000-0000-0000-0000-000000000062'),
  ('50000000-0000-0000-0000-000000000068', 'Tomas', 'T', '20000000-0000-0000-0000-000000000062');

INSERT INTO public.matches (id, group_id, created_by, date, court_number, team1, team2, sets)
VALUES
  (
    '60000000-0000-0000-0000-000000000061',
    '20000000-0000-0000-0000-000000000061',
    '10000000-0000-0000-0000-000000000061',
    '2026-11-16T19:00:00Z',
    4,
    ARRAY['50000000-0000-0000-0000-000000000061', '50000000-0000-0000-0000-000000000062']::uuid[],
    ARRAY['50000000-0000-0000-0000-000000000063', '50000000-0000-0000-0000-000000000064']::uuid[],
    '[{"team1Score": 6, "team2Score": 3}, {"team1Score": 4, "team2Score": 6}]'
  ),
  (
    '60000000-0000-0000-0000-000000000062',
    '20000000-0000-0000-0000-000000000062',
    '10000000-0000-0000-0000-000000000062',
    '2026-11-16T19:00:00Z',
    NULL,
    ARRAY['50000000-0000-0000-0000-000000000065', '50000000-0000-0000-0000-000000000066']::uuid[],
    ARRAY['50000000-0000-0000-0000-000000000067', '50000000-0000-0000-0000-000000000068']::uuid[],
    '[{"team1Score": 6, "team2Score": 0}]'
  );

INSERT INTO public.match_events (id, match_id, player_id, type, created_by)
VALUES
  ('70000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000061',
   '50000000-0000-0000-0000-000000000061', 'vibora', '10000000-0000-0000-0000-000000000061');
INSERT INTO public.match_events (id, match_id, player_id, type, created_by)
VALUES
  ('70000000-0000-0000-0000-000000000062', '60000000-0000-0000-0000-000000000061',
   '50000000-0000-0000-0000-000000000063', 'smash', '10000000-0000-0000-0000-000000000061');

CREATE FUNCTION pg_temp.act_as(p_user uuid, p_client_id text DEFAULT NULL)
RETURNS void
LANGUAGE sql
AS $function$
  SELECT set_config('request.jwt.claims', jsonb_strip_nulls(jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'aud', 'authenticated', 'client_id', p_client_id
  ))::text, true);
$function$;

CREATE FUNCTION pg_temp.detail(p_group uuid, p_match uuid)
RETURNS jsonb
LANGUAGE sql
AS $function$
  SELECT public.get_match_detail(p_group, p_match);
$function$;

CREATE TEMP TABLE versions (name text PRIMARY KEY, version bigint);
GRANT ALL ON versions TO authenticated;

-- ------------------------------------------------------------
-- Privileges
-- ------------------------------------------------------------
SELECT ok(
  has_function_privilege('authenticated', 'public.get_match_detail(uuid, uuid)', 'execute'),
  'signed-in users can call get_match_detail'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.get_match_detail(uuid, uuid)', 'execute'),
  'anonymous callers cannot call get_match_detail'
);

SELECT ok(
  (SELECT prosecdef AND proconfig @> ARRAY['search_path=""']
   FROM pg_proc WHERE oid = 'public.get_match_detail(uuid, uuid)'::regprocedure),
  'get_match_detail is a security definer with an empty search_path'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.get_match_detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000061') $$,
  '42501',
  NULL,
  'the anon role is refused'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"role": "authenticated"}';

SELECT is(
  pg_temp.detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000061') ->> 'code',
  'AUTH_REQUIRED',
  'a request without a user is refused'
);

-- ------------------------------------------------------------
-- A member reads the match, its events and its version, with an OAuth token too.
-- ------------------------------------------------------------
SELECT pg_temp.act_as('10000000-0000-0000-0000-000000000061', 'mcp-client');

SELECT is(
  pg_temp.detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000061') ->> 'status',
  'found',
  'a member finds the match with an OAuth token'
);

SELECT is(
  pg_temp.detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000061') -> 'match',
  jsonb_build_object(
    'id', '60000000-0000-0000-0000-000000000061',
    'groupId', '20000000-0000-0000-0000-000000000061',
    'date', '2026-11-16T19:00:00.000Z',
    'createdAt', (pg_temp.detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000061') -> 'match' ->> 'createdAt'),
    'courtNumber', 4,
    'team1', jsonb_build_array('50000000-0000-0000-0000-000000000061', '50000000-0000-0000-0000-000000000062'),
    'team2', jsonb_build_array('50000000-0000-0000-0000-000000000063', '50000000-0000-0000-0000-000000000064'),
    'sets', '[{"team1Score": 6, "team2Score": 3}, {"team1Score": 4, "team2Score": 6}]'::jsonb
  ),
  'the match has its date, court, teams and sets'
);

SELECT is(
  pg_temp.detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000061') -> 'events',
  jsonb_build_array(
    jsonb_build_object('id', '70000000-0000-0000-0000-000000000061',
      'playerId', '50000000-0000-0000-0000-000000000061', 'type', 'vibora'),
    jsonb_build_object('id', '70000000-0000-0000-0000-000000000062',
      'playerId', '50000000-0000-0000-0000-000000000063', 'type', 'smash')
  ),
  'events come with their IDs, in recorded order'
);

SELECT is(
  jsonb_typeof(pg_temp.detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000061') -> 'version'),
  'number',
  'the match has a numeric version'
);

-- The OAuth token still can't read events directly: this function is its only path.
SELECT is((SELECT count(*)::integer FROM public.match_events), 0,
  'the OAuth token still cannot read match_events directly');

-- ------------------------------------------------------------
-- Not found looks the same for every reason.
-- ------------------------------------------------------------
SELECT is(
  pg_temp.detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000069') ->> 'code',
  'MATCH_NOT_FOUND',
  'a match that does not exist is not found'
);

SELECT is(
  pg_temp.detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000062') ->> 'code',
  'MATCH_NOT_FOUND',
  'another group''s match is not found under the member''s group'
);

SELECT is(
  pg_temp.detail('20000000-0000-0000-0000-000000000062', '60000000-0000-0000-0000-000000000062') ->> 'code',
  'MATCH_NOT_FOUND',
  'a match in a group the caller is not in is not found'
);

SELECT is(
  pg_temp.detail('20000000-0000-0000-0000-000000000062', '60000000-0000-0000-0000-000000000062') - 'status',
  pg_temp.detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000069') - 'status',
  'another group''s match and a missing match give the same answer'
);

SELECT pg_temp.act_as('10000000-0000-0000-0000-000000000062', 'mcp-client');

SELECT is(
  pg_temp.detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000061') ->> 'code',
  'MATCH_NOT_FOUND',
  'a non-member cannot read the match, even with its group ID'
);

SELECT ok(
  NOT (pg_temp.detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000061') ? 'events'),
  'a non-member gets no events'
);

-- ------------------------------------------------------------
-- The version changes with every change to the match, whoever makes it.
-- ------------------------------------------------------------
SELECT pg_temp.act_as('10000000-0000-0000-0000-000000000061');

INSERT INTO versions
SELECT 'start', (pg_temp.detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000061') ->> 'version')::bigint;

SELECT is(
  (pg_temp.detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000061') ->> 'version')::bigint,
  (SELECT version FROM versions WHERE name = 'start'),
  'reading again gives the same version'
);

INSERT INTO public.match_events (match_id, player_id, type, created_by)
VALUES ('60000000-0000-0000-0000-000000000061', '50000000-0000-0000-0000-000000000062', 'smash',
        '10000000-0000-0000-0000-000000000061');
INSERT INTO versions
SELECT 'event added', (pg_temp.detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000061') ->> 'version')::bigint;

SELECT cmp_ok(
  (SELECT version FROM versions WHERE name = 'event added'), '>',
  (SELECT version FROM versions WHERE name = 'start'),
  'adding an event changes the version'
);

DELETE FROM public.match_events WHERE id = '70000000-0000-0000-0000-000000000062';
INSERT INTO versions
SELECT 'event removed', (pg_temp.detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000061') ->> 'version')::bigint;

SELECT cmp_ok(
  (SELECT version FROM versions WHERE name = 'event removed'), '>',
  (SELECT version FROM versions WHERE name = 'event added'),
  'removing an event changes the version'
);

SELECT ok(
  NOT (pg_temp.detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000061') -> 'events'
    @> '[{"id": "70000000-0000-0000-0000-000000000062"}]'),
  'a removed event is gone from the detail'
);

UPDATE public.matches SET court_number = 7 WHERE id = '60000000-0000-0000-0000-000000000061';
INSERT INTO versions
SELECT 'court changed', (pg_temp.detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000061') ->> 'version')::bigint;

SELECT cmp_ok(
  (SELECT version FROM versions WHERE name = 'court changed'), '>',
  (SELECT version FROM versions WHERE name = 'event removed'),
  'correcting the court changes the version'
);

SELECT is(
  (pg_temp.detail('20000000-0000-0000-0000-000000000061', '60000000-0000-0000-0000-000000000061') -> 'match' ->> 'courtNumber')::integer,
  7,
  'the detail shows the corrected court'
);

SELECT * FROM finish();
ROLLBACK;
