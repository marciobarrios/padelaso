BEGIN;

SELECT plan(42);

-- ------------------------------------------------------------
-- Fixtures: a member of one group and an outsider.
-- ------------------------------------------------------------
INSERT INTO auth.users (id, email)
VALUES
  ('10000000-0000-0000-0000-000000000041', 'oauth-member@example.com'),
  ('10000000-0000-0000-0000-000000000042', 'oauth-outsider@example.com');

INSERT INTO public.groups (id, name, emoji, invite_code, created_by)
VALUES
  ('20000000-0000-0000-0000-000000000041', 'OAuth group', 'P', 'OAUTH1', '10000000-0000-0000-0000-000000000041'),
  ('20000000-0000-0000-0000-000000000042', 'Outsider group', 'P', 'OAUTH2', '10000000-0000-0000-0000-000000000042');

INSERT INTO public.group_members (group_id, user_id, role)
VALUES
  ('20000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000041', 'admin'),
  ('20000000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000042', 'admin');

INSERT INTO public.players (id, name, emoji, group_id, user_id, created_by)
VALUES
  ('50000000-0000-0000-0000-000000000041', 'Ana', 'A', '20000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000041'),
  ('50000000-0000-0000-0000-000000000042', 'Pablo', 'P', '20000000-0000-0000-0000-000000000041', NULL, '10000000-0000-0000-0000-000000000041'),
  ('50000000-0000-0000-0000-000000000043', 'Lucia', 'L', '20000000-0000-0000-0000-000000000041', NULL, '10000000-0000-0000-0000-000000000041'),
  ('50000000-0000-0000-0000-000000000044', 'Marta', 'M', '20000000-0000-0000-0000-000000000041', NULL, '10000000-0000-0000-0000-000000000041');

INSERT INTO public.matches (id, group_id, created_by, team1, team2, sets)
VALUES (
  '60000000-0000-0000-0000-000000000041',
  '20000000-0000-0000-0000-000000000041',
  '10000000-0000-0000-0000-000000000041',
  ARRAY['50000000-0000-0000-0000-000000000041', '50000000-0000-0000-0000-000000000042']::uuid[],
  ARRAY['50000000-0000-0000-0000-000000000043', '50000000-0000-0000-0000-000000000044']::uuid[],
  '[{"team1Score": 6, "team2Score": 3}]'
);

INSERT INTO public.match_events (match_id, player_id, type, created_by)
VALUES (
  '60000000-0000-0000-0000-000000000041',
  '50000000-0000-0000-0000-000000000041',
  'vibora',
  '10000000-0000-0000-0000-000000000041'
);

-- Claims as Supabase sets them for a request. OAuth server tokens add client_id.
CREATE FUNCTION pg_temp.act_as(p_user uuid, p_client_id text DEFAULT NULL)
RETURNS void
LANGUAGE sql
AS $function$
  SELECT set_config('request.jwt.claims', jsonb_strip_nulls(jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'aud', 'authenticated', 'client_id', p_client_id
  ))::text, true);
$function$;

CREATE FUNCTION pg_temp.request(p_method text, p_path text)
RETURNS void
LANGUAGE sql
AS $function$
  SELECT set_config('request.method', p_method, true), set_config('request.path', p_path, true);
$function$;

CREATE TEMP TABLE affected (name text PRIMARY KEY, rows integer);
GRANT ALL ON affected TO authenticated;

-- ------------------------------------------------------------
-- Every public table is covered, so a new table can't slip through.
-- ------------------------------------------------------------
SELECT is(
  ARRAY(
    SELECT t.tablename::text
    FROM pg_tables AS t
    WHERE t.schemaname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies AS p
        WHERE p.schemaname = 'public' AND p.tablename = t.tablename
          AND p.permissive = 'RESTRICTIVE' AND p.cmd = 'ALL'
          AND p.qual LIKE '%client_id%' AND p.with_check LIKE '%client_id%'
      )
      -- Each write is covered by a restrictive policy, or not granted at all.
      AND EXISTS (
        SELECT 1 FROM unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) AS w(cmd)
        WHERE has_table_privilege('authenticated', format('public.%I', t.tablename), w.cmd)
          AND NOT EXISTS (
            SELECT 1 FROM pg_policies AS p
            WHERE p.schemaname = 'public' AND p.tablename = t.tablename
              AND p.permissive = 'RESTRICTIVE' AND p.cmd = w.cmd
              AND coalesce(p.qual, p.with_check) LIKE '%client_id%'
          )
      )
    ORDER BY 1
  ),
  ARRAY[]::text[],
  'every public table blocks writes from OAuth client tokens'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_db_role_setting AS s
    JOIN pg_roles AS r ON r.oid = s.setrole
    WHERE r.rolname = 'authenticator'
      AND 'pgrst.db_pre_request=mcp_private.check_request' = ANY (s.setconfig)
  ),
  'the Data API runs the OAuth request guard before every request'
);

SELECT ok(
  NOT has_schema_privilege('authenticated', 'mcp_private', 'create'),
  'callers cannot add functions to mcp_private'
);

-- ------------------------------------------------------------
-- OAuth client token of a group member: reads only what the MCP tools read.
-- ------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('10000000-0000-0000-0000-000000000041', 'mcp-client');

SELECT is((SELECT count(*)::integer FROM public.groups), 1, 'OAuth token reads its own group');
SELECT is((SELECT count(*)::integer FROM public.players), 4, 'OAuth token reads its group''s players');
SELECT is((SELECT count(*)::integer FROM public.matches), 1, 'OAuth token reads its group''s matches');

SELECT is((SELECT count(*)::integer FROM public.group_members), 0, 'OAuth token cannot read group_members');
SELECT is((SELECT count(*)::integer FROM public.profiles), 0, 'OAuth token cannot read profiles');
SELECT is((SELECT count(*)::integer FROM public.match_events), 0, 'OAuth token cannot read match_events');
SELECT is((SELECT count(*)::integer FROM public.match_votes), 0, 'OAuth token cannot read match_votes');
SELECT is((SELECT count(*)::integer FROM public.score_tokens), 0, 'OAuth token cannot read score_tokens');

SELECT throws_ok(
  $$INSERT INTO public.matches (group_id, created_by, team1, team2, sets)
    VALUES ('20000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000041',
            ARRAY['50000000-0000-0000-0000-000000000041', '50000000-0000-0000-0000-000000000042']::uuid[],
            ARRAY['50000000-0000-0000-0000-000000000043', '50000000-0000-0000-0000-000000000044']::uuid[],
            '[{"team1Score": 6, "team2Score": 0}]')$$,
  '42501', NULL, 'OAuth token cannot insert matches directly'
);

SELECT throws_ok(
  $$INSERT INTO public.players (name, emoji, group_id, created_by)
    VALUES ('Intruder', 'I', '20000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000041')$$,
  '42501', NULL, 'OAuth token cannot insert players directly'
);

SELECT throws_ok(
  $$INSERT INTO public.match_events (match_id, player_id, type, created_by)
    VALUES ('60000000-0000-0000-0000-000000000041', '50000000-0000-0000-0000-000000000042', 'smash',
            '10000000-0000-0000-0000-000000000041')$$,
  '42501', NULL, 'OAuth token cannot insert match events directly'
);

WITH u AS (
  UPDATE public.matches SET court_number = 9 WHERE id = '60000000-0000-0000-0000-000000000041' RETURNING 1
)
INSERT INTO affected SELECT 'update match', count(*) FROM u;

WITH u AS (
  UPDATE public.groups SET name = 'Renamed' WHERE id = '20000000-0000-0000-0000-000000000041' RETURNING 1
)
INSERT INTO affected SELECT 'update group', count(*) FROM u;

WITH u AS (
  UPDATE public.players SET name = 'Renamed' WHERE id = '50000000-0000-0000-0000-000000000042' RETURNING 1
)
INSERT INTO affected SELECT 'update player', count(*) FROM u;

WITH d AS (
  DELETE FROM public.matches WHERE id = '60000000-0000-0000-0000-000000000041' RETURNING 1
)
INSERT INTO affected SELECT 'delete match', count(*) FROM d;

WITH d AS (
  DELETE FROM public.groups WHERE id = '20000000-0000-0000-0000-000000000041' RETURNING 1
)
INSERT INTO affected SELECT 'delete group', count(*) FROM d;

WITH d AS (
  DELETE FROM public.group_members WHERE user_id = '10000000-0000-0000-0000-000000000041' RETURNING 1
)
INSERT INTO affected SELECT 'delete membership', count(*) FROM d;

SELECT is((SELECT rows FROM affected WHERE name = 'update match'), 0, 'OAuth token cannot update matches');
SELECT is((SELECT rows FROM affected WHERE name = 'update group'), 0, 'OAuth token cannot update groups');
SELECT is((SELECT rows FROM affected WHERE name = 'update player'), 0, 'OAuth token cannot update players');
SELECT is((SELECT rows FROM affected WHERE name = 'delete match'), 0, 'OAuth token cannot delete matches');
SELECT is((SELECT rows FROM affected WHERE name = 'delete group'), 0, 'OAuth token cannot delete groups');
SELECT is((SELECT rows FROM affected WHERE name = 'delete membership'), 0, 'OAuth token cannot leave groups directly');

-- Recording through create_match, which the MCP tool uses, still works.
SELECT is(
  public.create_match(jsonb_build_object(
    'groupId', '20000000-0000-0000-0000-000000000041',
    'team1', jsonb_build_array('50000000-0000-0000-0000-000000000041', '50000000-0000-0000-0000-000000000043'),
    'team2', jsonb_build_array('50000000-0000-0000-0000-000000000042', '50000000-0000-0000-0000-000000000044'),
    'sets', '[{"team1Score": 6, "team2Score": 4}]'::jsonb,
    'events', jsonb_build_array(jsonb_build_object('playerId', '50000000-0000-0000-0000-000000000041', 'type', 'vibora'))
  )) ->> 'status',
  'created',
  'OAuth token can still record a match through create_match'
);

-- ------------------------------------------------------------
-- The Data API guard allowlists the MCP requests.
-- ------------------------------------------------------------
SELECT pg_temp.request('GET', '/matches');
SELECT lives_ok('SELECT mcp_private.check_request()', 'guard allows GET /matches for OAuth tokens');
SELECT pg_temp.request('HEAD', '/groups');
SELECT lives_ok('SELECT mcp_private.check_request()', 'guard allows HEAD /groups for OAuth tokens');
SELECT pg_temp.request('POST', '/rpc/create_match');
SELECT lives_ok('SELECT mcp_private.check_request()', 'guard allows POST /rpc/create_match for OAuth tokens');
SELECT pg_temp.request('POST', '/rpc/hit_mcp_rate_limit');
SELECT lives_ok('SELECT mcp_private.check_request()', 'guard allows POST /rpc/hit_mcp_rate_limit for OAuth tokens');
SELECT pg_temp.request('POST', '/rpc/get_match_detail');
SELECT lives_ok('SELECT mcp_private.check_request()', 'guard allows POST /rpc/get_match_detail for OAuth tokens');
SELECT pg_temp.request('POST', '/rpc/add_match_events');
SELECT lives_ok('SELECT mcp_private.check_request()', 'guard allows POST /rpc/add_match_events for OAuth tokens');
SELECT pg_temp.request('POST', '/rpc/remove_match_event');
SELECT lives_ok('SELECT mcp_private.check_request()', 'guard allows POST /rpc/remove_match_event for OAuth tokens');
SELECT pg_temp.request('DELETE', '/match_events');
SELECT throws_ok('SELECT mcp_private.check_request()', 'PGRST', NULL, 'guard still blocks direct match_events deletes for OAuth tokens');
SELECT pg_temp.request('POST', '/rpc/update_match');
SELECT lives_ok('SELECT mcp_private.check_request()', 'guard allows POST /rpc/update_match for OAuth tokens');
SELECT pg_temp.request('GET', '/match_events');
SELECT throws_ok('SELECT mcp_private.check_request()', 'PGRST', NULL, 'guard still blocks direct match_events reads for OAuth tokens');

SELECT pg_temp.request('POST', '/rpc/join_group_by_code');
SELECT throws_ok('SELECT mcp_private.check_request()', 'PGRST', NULL, 'guard blocks other RPCs for OAuth tokens');
SELECT pg_temp.request('POST', '/rpc/native_apply_command');
SELECT throws_ok('SELECT mcp_private.check_request()', 'PGRST', NULL, 'guard blocks scoring RPCs for OAuth tokens');
SELECT pg_temp.request('POST', '/rpc/graphql');
SELECT throws_ok('SELECT mcp_private.check_request()', 'PGRST', NULL, 'guard blocks GraphQL for OAuth tokens');
SELECT pg_temp.request('POST', '/matches');
SELECT throws_ok('SELECT mcp_private.check_request()', 'PGRST', NULL, 'guard blocks table writes for OAuth tokens');
SELECT pg_temp.request('GET', '/group_members');
SELECT throws_ok('SELECT mcp_private.check_request()', 'PGRST', NULL, 'guard blocks reads of other tables for OAuth tokens');

-- ------------------------------------------------------------
-- OAuth client token of an outsider: nothing from the member's group.
-- ------------------------------------------------------------
SELECT pg_temp.act_as('10000000-0000-0000-0000-000000000042', 'mcp-client');

SELECT is(
  (SELECT count(*)::integer FROM public.matches WHERE group_id = '20000000-0000-0000-0000-000000000041'),
  0,
  'OAuth token of a non-member cannot read another group''s matches'
);

SELECT is(
  public.create_match(jsonb_build_object(
    'groupId', '20000000-0000-0000-0000-000000000041',
    'team1', jsonb_build_array('50000000-0000-0000-0000-000000000041', '50000000-0000-0000-0000-000000000042'),
    'team2', jsonb_build_array('50000000-0000-0000-0000-000000000043', '50000000-0000-0000-0000-000000000044'),
    'sets', '[{"team1Score": 6, "team2Score": 1}]'::jsonb
  )) ->> 'code',
  'GROUP_NOT_FOUND',
  'OAuth token of a non-member cannot record a match in another group'
);

-- ------------------------------------------------------------
-- Ordinary app session: unchanged.
-- ------------------------------------------------------------
SELECT pg_temp.act_as('10000000-0000-0000-0000-000000000041');

SELECT pg_temp.request('POST', '/rpc/join_group_by_code');
SELECT lives_ok('SELECT mcp_private.check_request()', 'guard lets ordinary sessions call any RPC');

SELECT is((SELECT count(*)::integer FROM public.group_members), 1, 'ordinary session still reads group_members');
SELECT is((SELECT count(*)::integer FROM public.match_events), 2, 'ordinary session still reads match_events');

WITH u AS (
  UPDATE public.matches SET court_number = 3 WHERE id = '60000000-0000-0000-0000-000000000041' RETURNING 1
)
INSERT INTO affected SELECT 'session update match', count(*) FROM u;
SELECT is((SELECT rows FROM affected WHERE name = 'session update match'), 1, 'ordinary session still updates matches');

SELECT * FROM finish();
ROLLBACK;
