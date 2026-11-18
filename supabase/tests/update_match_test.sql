BEGIN;

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

SELECT plan(61);

-- ------------------------------------------------------------
-- Fixtures: two members of one group, an outsider with their own group, a
-- match in each, and a fifth player of the first group who didn't play.
-- Lucia has an event in the first match.
-- ------------------------------------------------------------
INSERT INTO auth.users (id, email)
VALUES
  ('10000000-0000-0000-0000-0000000000c1', 'update-member@example.com'),
  ('10000000-0000-0000-0000-0000000000c2', 'update-outsider@example.com'),
  ('10000000-0000-0000-0000-0000000000c3', 'update-second-member@example.com');

INSERT INTO public.groups (id, name, emoji, invite_code, created_by)
VALUES
  ('20000000-0000-0000-0000-0000000000c1', 'Update group', 'P', 'UPDMT1', '10000000-0000-0000-0000-0000000000c1'),
  ('20000000-0000-0000-0000-0000000000c2', 'Outsider group', 'P', 'UPDMT2', '10000000-0000-0000-0000-0000000000c2');

INSERT INTO public.group_members (group_id, user_id, role)
VALUES
  ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'member'),
  ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c3', 'member'),
  ('20000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c2', 'member');

INSERT INTO public.players (id, name, emoji, group_id)
VALUES
  ('50000000-0000-0000-0000-0000000000c1', 'Ana', 'A', '20000000-0000-0000-0000-0000000000c1'),
  ('50000000-0000-0000-0000-0000000000c2', 'Pablo', 'P', '20000000-0000-0000-0000-0000000000c1'),
  ('50000000-0000-0000-0000-0000000000c3', 'Lucia', 'L', '20000000-0000-0000-0000-0000000000c1'),
  ('50000000-0000-0000-0000-0000000000c4', 'Marta', 'M', '20000000-0000-0000-0000-0000000000c1'),
  ('50000000-0000-0000-0000-0000000000c5', 'Jose', 'J', '20000000-0000-0000-0000-0000000000c1'),
  ('50000000-0000-0000-0000-0000000000c6', 'Oscar', 'O', '20000000-0000-0000-0000-0000000000c2'),
  ('50000000-0000-0000-0000-0000000000c7', 'Rosa', 'R', '20000000-0000-0000-0000-0000000000c2'),
  ('50000000-0000-0000-0000-0000000000c8', 'Sara', 'S', '20000000-0000-0000-0000-0000000000c2'),
  ('50000000-0000-0000-0000-0000000000c9', 'Tomas', 'T', '20000000-0000-0000-0000-0000000000c2');

INSERT INTO public.matches (id, group_id, created_by, date, court_number, team1, team2, sets)
VALUES
  (
    '60000000-0000-0000-0000-0000000000c1',
    '20000000-0000-0000-0000-0000000000c1',
    '10000000-0000-0000-0000-0000000000c1',
    now() - interval '1 day',
    2,
    ARRAY['50000000-0000-0000-0000-0000000000c1', '50000000-0000-0000-0000-0000000000c2']::uuid[],
    ARRAY['50000000-0000-0000-0000-0000000000c3', '50000000-0000-0000-0000-0000000000c4']::uuid[],
    '[{"team1Score": 6, "team2Score": 3}]'
  ),
  (
    '60000000-0000-0000-0000-0000000000c2',
    '20000000-0000-0000-0000-0000000000c2',
    '10000000-0000-0000-0000-0000000000c2',
    now() - interval '1 day',
    NULL,
    ARRAY['50000000-0000-0000-0000-0000000000c6', '50000000-0000-0000-0000-0000000000c7']::uuid[],
    ARRAY['50000000-0000-0000-0000-0000000000c8', '50000000-0000-0000-0000-0000000000c9']::uuid[],
    '[{"team1Score": 6, "team2Score": 0}]'
  );

INSERT INTO public.match_events (id, match_id, player_id, type, created_by)
VALUES
  ('70000000-0000-0000-0000-0000000000c1', '60000000-0000-0000-0000-0000000000c1',
   '50000000-0000-0000-0000-0000000000c3', 'ace', '10000000-0000-0000-0000-0000000000c1');

-- Security definer so authenticated callers can read it too.
CREATE FUNCTION pg_temp.version()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $function$
  SELECT revision FROM native_private.match_state WHERE match_id = '60000000-0000-0000-0000-0000000000c1';
$function$;

-- A valid request at the match's current version, with p_fields merged over it.
-- Security definer so authenticated callers can read the version for it.
CREATE FUNCTION pg_temp.request(p_fields jsonb DEFAULT '{}')
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $function$
  SELECT jsonb_build_object(
    'groupId', '20000000-0000-0000-0000-0000000000c1',
    'matchId', '60000000-0000-0000-0000-0000000000c1',
    'expectedVersion', (SELECT revision FROM native_private.match_state
                        WHERE match_id = '60000000-0000-0000-0000-0000000000c1'),
    'patch', '{"sets": [{"team1Score": 6, "team2Score": 4}, {"team1Score": 6, "team2Score": 2}]}'::jsonb,
    'idempotencyKey', 'update-key-0001'
  ) || p_fields;
$function$;

-- A request with only its patch replaced.
CREATE FUNCTION pg_temp.patch(p_patch jsonb, p_fields jsonb DEFAULT '{}')
RETURNS jsonb
LANGUAGE sql
AS $function$
  SELECT pg_temp.request(jsonb_build_object('patch', p_patch) || p_fields);
$function$;

CREATE FUNCTION pg_temp.match_row()
RETURNS public.matches
LANGUAGE sql
AS $function$
  SELECT * FROM public.matches WHERE id = '60000000-0000-0000-0000-0000000000c1';
$function$;

CREATE TEMP TABLE saved (name text PRIMARY KEY, result jsonb);
GRANT ALL ON saved TO authenticated;
INSERT INTO saved VALUES ('before', to_jsonb(pg_temp.match_row()) || jsonb_build_object('version', pg_temp.version()));

-- ------------------------------------------------------------
-- Privileges
-- ------------------------------------------------------------
SELECT ok(
  has_function_privilege('authenticated', 'public.update_match(jsonb)', 'execute'),
  'signed-in users can call update_match'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.update_match(jsonb)', 'execute'),
  'anonymous callers cannot call update_match'
);

SELECT ok(
  (SELECT prosecdef AND proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'public.update_match(jsonb)'::regprocedure),
  'update_match is a security definer with an empty search_path'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'match_private.update_receipts', 'select'),
  'signed-in users cannot read receipts'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.update_match('{}'::jsonb) $$,
  '42501',
  NULL,
  'the anon role is refused'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '';

SELECT is(
  public.update_match(pg_temp.request()) ->> 'code',
  'AUTH_REQUIRED',
  'a request without a user is refused'
);

-- ------------------------------------------------------------
-- Authorization
-- ------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000c2';

SELECT is(
  public.update_match(pg_temp.request()) - 'message',
  '{"status": "rejected", "code": "MATCH_NOT_FOUND"}'::jsonb,
  'a non-member cannot change the group''s match'
);

SELECT is(
  public.update_match(pg_temp.request('{"groupId": "20000000-0000-0000-0000-0000000000c2"}')) ->> 'code',
  'MATCH_NOT_FOUND',
  'naming one''s own group does not reach another group''s match'
);

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000c1';

SELECT is(
  public.update_match(pg_temp.request('{"matchId": "60000000-0000-0000-0000-0000000000ff"}')) ->> 'code',
  'MATCH_NOT_FOUND',
  'a missing match looks the same as a forbidden one'
);

SELECT is(
  public.update_match(pg_temp.request('{"matchId": "60000000-0000-0000-0000-0000000000c2"}')) ->> 'code',
  'MATCH_NOT_FOUND',
  'a match of another group is not found through the caller''s group'
);

-- ------------------------------------------------------------
-- Validation
-- ------------------------------------------------------------
SELECT is(public.update_match(pg_temp.request('{"events": []}')) ->> 'code', 'INVALID_REQUEST', 'unknown fields are refused');
SELECT is(public.update_match(pg_temp.patch('{"groupId": "20000000-0000-0000-0000-0000000000c2"}')) ->> 'code', 'INVALID_REQUEST', 'the group cannot be patched');
SELECT is(public.update_match(pg_temp.patch('{}')) ->> 'code', 'INVALID_REQUEST', 'an empty patch is refused');
SELECT is(public.update_match(pg_temp.request() - 'patch') ->> 'code', 'INVALID_REQUEST', 'the patch is required');
SELECT is(public.update_match(pg_temp.request() - 'expectedVersion') ->> 'code', 'INVALID_REQUEST', 'the expected version is required');
SELECT is(public.update_match(pg_temp.request('{"expectedVersion": 1.5}')) ->> 'code', 'INVALID_REQUEST', 'a fractional version is refused');
SELECT is(public.update_match(pg_temp.request('{"expectedVersion": "3"}')) ->> 'code', 'INVALID_REQUEST', 'a version as text is refused');
SELECT is(public.update_match(pg_temp.request() - 'idempotencyKey') ->> 'code', 'INVALID_REQUEST', 'the idempotency key is required');
SELECT is(public.update_match(pg_temp.request('{"idempotencyKey": "short"}')) ->> 'code', 'INVALID_REQUEST', 'a malformed idempotency key is refused');
SELECT is(
  public.update_match(pg_temp.patch('{"team1": ["50000000-0000-0000-0000-0000000000c1", "50000000-0000-0000-0000-0000000000c5"]}')) ->> 'code',
  'INVALID_TEAMS',
  'one team alone is refused: teams change together'
);
SELECT is(
  public.update_match(pg_temp.patch('{"team1": ["50000000-0000-0000-0000-0000000000c1", "50000000-0000-0000-0000-0000000000c3"],
                                      "team2": ["50000000-0000-0000-0000-0000000000c3", "50000000-0000-0000-0000-0000000000c4"]}')) ->> 'code',
  'INVALID_TEAMS',
  'a player on both teams is refused'
);
SELECT is(
  public.update_match(pg_temp.patch('{"team1": ["50000000-0000-0000-0000-0000000000c1", "50000000-0000-0000-0000-0000000000c6"],
                                      "team2": ["50000000-0000-0000-0000-0000000000c3", "50000000-0000-0000-0000-0000000000c4"]}')) - 'message',
  '{"status": "rejected", "code": "PLAYER_NOT_IN_GROUP", "playerIds": ["50000000-0000-0000-0000-0000000000c6"]}'::jsonb,
  'a player of another group is refused and named'
);
SELECT is(
  public.update_match(pg_temp.patch('{"team1": ["50000000-0000-0000-0000-0000000000c1", "50000000-0000-0000-0000-0000000000c2"],
                                      "team2": ["50000000-0000-0000-0000-0000000000c5", "50000000-0000-0000-0000-0000000000c4"]}')) - 'message',
  '{"status": "rejected", "code": "PLAYER_HAS_EVENTS", "playerIds": ["50000000-0000-0000-0000-0000000000c3"]}'::jsonb,
  'dropping a player who has events is refused and names them'
);
SELECT is(public.update_match(pg_temp.patch('{"sets": []}')) ->> 'code', 'INVALID_SETS', 'no sets is refused');
SELECT is(public.update_match(pg_temp.patch('{"sets": [{"team1Score": 0, "team2Score": 0}]}')) ->> 'code', 'INVALID_SETS', 'an unplayed set is refused');
SELECT is(public.update_match(pg_temp.patch('{"sets": [{"team1Score": 100, "team2Score": 2}]}')) ->> 'code', 'INVALID_SETS', 'a score above 99 is refused');
SELECT is(public.update_match(pg_temp.patch('{"date": null}')) ->> 'code', 'INVALID_DATE', 'the date cannot be cleared');
SELECT is(public.update_match(pg_temp.patch('{"date": "2026-11-16T19:00:00"}')) ->> 'code', 'INVALID_DATE', 'a date without a UTC offset is refused');
SELECT is(
  public.update_match(pg_temp.patch(jsonb_build_object('date', to_char((now() + interval '1 day') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))) ->> 'code',
  'INVALID_DATE',
  'a future date is refused'
);
SELECT is(
  public.update_match(pg_temp.patch(jsonb_build_object('date', to_char((now() - interval '2 years') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))) ->> 'code',
  'INVALID_DATE',
  'a date more than a year ago is refused'
);
SELECT is(public.update_match(pg_temp.patch('{"courtNumber": 0}')) ->> 'code', 'INVALID_REQUEST', 'court 0 is refused');
SELECT is(public.update_match(pg_temp.patch('{"courtNumber": 2.5}')) ->> 'code', 'INVALID_REQUEST', 'a fractional court is refused');

SELECT is(
  public.update_match(pg_temp.request('{"expectedVersion": 999}')) - 'message',
  jsonb_build_object('status', 'rejected', 'code', 'STALE_VERSION', 'version', pg_temp.version()),
  'a stale version is refused with the current one'
);

RESET ROLE;
SELECT is(
  to_jsonb(pg_temp.match_row()) || jsonb_build_object('version', pg_temp.version()),
  (SELECT result FROM saved WHERE name = 'before'),
  'no refused request changed the match or its version'
);
SELECT is((SELECT count(*) FROM match_private.update_receipts), 0::bigint, 'no refused request saved a receipt');
SET LOCAL ROLE authenticated;

-- ------------------------------------------------------------
-- Correcting the score only
-- ------------------------------------------------------------
INSERT INTO saved VALUES ('score', public.update_match(pg_temp.request()));

SELECT is((SELECT result ->> 'status' FROM saved WHERE name = 'score'), 'updated', 'the score is corrected');
SELECT is((SELECT result -> 'changed' FROM saved WHERE name = 'score'), '["sets"]'::jsonb, 'only the sets changed');
SELECT is(
  (SELECT result #> '{match,sets}' FROM saved WHERE name = 'score'),
  '[{"team1Score": 6, "team2Score": 4}, {"team1Score": 6, "team2Score": 2}]'::jsonb,
  'the snapshot has the new sets'
);

RESET ROLE;
SELECT is(
  to_jsonb(pg_temp.match_row()) - 'sets',
  (SELECT result - 'sets' - 'version' FROM saved WHERE name = 'before'),
  'teams, date, court and the rest of the match are unchanged'
);
SELECT is(
  (SELECT array_agg(id) FROM public.match_events WHERE match_id = '60000000-0000-0000-0000-0000000000c1'),
  ARRAY['70000000-0000-0000-0000-0000000000c1']::uuid[],
  'events are kept'
);
SELECT is(
  pg_temp.version(),
  (SELECT (result ->> 'version')::bigint + 1 FROM saved WHERE name = 'before'),
  'the version moved by one'
);
SELECT is(
  (SELECT (result ->> 'version')::bigint FROM saved WHERE name = 'score'),
  pg_temp.version(),
  'the returned version is the match''s current one'
);
SET LOCAL ROLE authenticated;

-- ------------------------------------------------------------
-- Retries
-- ------------------------------------------------------------
-- The retry still carries the version it read before the first call.
INSERT INTO saved VALUES ('replay', public.update_match(pg_temp.request(jsonb_build_object(
  'expectedVersion', (SELECT (result ->> 'version')::bigint FROM saved WHERE name = 'before')
))));

SELECT is((SELECT result ->> 'status' FROM saved WHERE name = 'replay'), 'replayed', 'the same key and request replays');
SELECT is((SELECT result -> 'changed' FROM saved WHERE name = 'replay'), '["sets"]'::jsonb, 'a replay reports what the first call changed');
SELECT is(
  (SELECT (result ->> 'version')::bigint FROM saved WHERE name = 'replay'),
  (SELECT (result ->> 'version')::bigint FROM saved WHERE name = 'score'),
  'a replay changes nothing'
);
SELECT is(
  public.update_match(pg_temp.patch('{"courtNumber": 5}')) ->> 'code',
  'IDEMPOTENCY_KEY_REUSED',
  'the same key with a different request is refused'
);
SELECT is(
  public.update_match(pg_temp.patch('{"courtNumber": 5}', jsonb_build_object(
    'idempotencyKey', 'update-key-stale',
    'expectedVersion', (SELECT (result ->> 'version')::bigint FROM saved WHERE name = 'before')
  ))) ->> 'code',
  'STALE_VERSION',
  'a new request based on the old version is refused'
);

-- ------------------------------------------------------------
-- Date, court and teams
-- ------------------------------------------------------------
INSERT INTO saved VALUES ('date and court', public.update_match(pg_temp.patch(
  jsonb_build_object('date', to_char((now() - interval '3 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"'), 'courtNumber', 7),
  '{"idempotencyKey": "update-key-0002"}'
)));
SELECT is(
  (SELECT result -> 'changed' FROM saved WHERE name = 'date and court'),
  '["date", "courtNumber"]'::jsonb,
  'date and court change together'
);
SELECT is(
  (SELECT jsonb_build_object('date', result #> '{match,date}', 'court', result #> '{match,courtNumber}') FROM saved WHERE name = 'date and court'),
  jsonb_build_object('date', to_char((now() - interval '3 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS".000Z"'), 'court', 7),
  'the snapshot has the new date and court'
);

SELECT is(
  public.update_match(pg_temp.patch('{"courtNumber": null}', '{"idempotencyKey": "update-key-0003"}')) #> '{match,courtNumber}',
  'null'::jsonb,
  'null clears the court'
);

-- Pablo has no events and leaves; Lucia keeps her place and her event.
INSERT INTO saved VALUES ('teams', public.update_match(pg_temp.patch(
  '{"team1": ["50000000-0000-0000-0000-0000000000c1", "50000000-0000-0000-0000-0000000000c5"],
    "team2": ["50000000-0000-0000-0000-0000000000c4", "50000000-0000-0000-0000-0000000000c3"]}',
  '{"idempotencyKey": "update-key-0004"}'
)));
SELECT is((SELECT result -> 'changed' FROM saved WHERE name = 'teams'), '["team1"]'::jsonb,
  'only team1 changed: the same pair in another order is the same team');
SELECT is(
  (SELECT result #> '{match,team2}' FROM saved WHERE name = 'teams'),
  '["50000000-0000-0000-0000-0000000000c3", "50000000-0000-0000-0000-0000000000c4"]'::jsonb,
  'an unchanged team keeps its stored order'
);

INSERT INTO saved VALUES ('same', public.update_match(pg_temp.patch('{"courtNumber": null}', '{"idempotencyKey": "update-key-0005"}')));
SELECT is(
  (SELECT jsonb_build_object('status', result -> 'status', 'changed', result -> 'changed') FROM saved WHERE name = 'same'),
  '{"status": "unchanged", "changed": []}'::jsonb,
  'a patch with the current values changes nothing'
);
SELECT is(
  (SELECT (result ->> 'version')::bigint FROM saved WHERE name = 'same'),
  (SELECT (result ->> 'version')::bigint FROM saved WHERE name = 'teams'),
  'nor the version'
);

-- Keys are per user: another member's identical key is a new request.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000c3';
SELECT is(
  public.update_match(pg_temp.patch('{"courtNumber": 4}')) ->> 'status',
  'updated',
  'another user''s identical key makes its own change'
);

-- An OAuth client token (MAR-144) reaches the function too.
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '10000000-0000-0000-0000-0000000000c3', 'role', 'authenticated', 'client_id', 'oauth-client'
)::text, true);
SELECT is(
  public.update_match(pg_temp.patch('{"courtNumber": 6}', '{"idempotencyKey": "update-key-oauth"}')) ->> 'status',
  'updated',
  'an OAuth client token can update a match'
);
SELECT set_config('request.jwt.claims', '', true);

-- A member who leaves can't replay their earlier call.
RESET ROLE;
DELETE FROM public.group_members
WHERE group_id = '20000000-0000-0000-0000-0000000000c1' AND user_id = '10000000-0000-0000-0000-0000000000c3';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000c3';
SELECT is(
  public.update_match(pg_temp.patch('{"courtNumber": 6}', '{"idempotencyKey": "update-key-oauth"}')) - 'message',
  '{"status": "rejected", "code": "MATCH_NOT_FOUND"}'::jsonb,
  'a former member''s replay is refused without the match'
);

-- ------------------------------------------------------------
-- Concurrency: two different corrections from the same version keep one; two
-- identical calls with one key update once and replay once.
-- ------------------------------------------------------------
RESET ROLE;

CREATE FUNCTION pg_temp.local_db_connection_string()
RETURNS text
LANGUAGE sql
AS $function$
  SELECT format(
    'hostaddr=%s port=%s dbname=%L user=postgres password=postgres options=-csearch_path=',
    inet_server_addr(),
    inet_server_port(),
    current_database()
  );
$function$;

DO $setup$
BEGIN
  PERFORM extensions.dblink_connect('upd_setup', pg_temp.local_db_connection_string());
  PERFORM extensions.dblink_exec(
    'upd_setup',
    $sql$
      INSERT INTO auth.users (id, email)
      VALUES ('10000000-0000-0000-0000-0000000000c4', 'update-concurrent@example.com');
      INSERT INTO public.groups (id, name, emoji, invite_code)
      VALUES ('20000000-0000-0000-0000-0000000000c3', 'Concurrent update', 'P', 'UPDMT3');
      INSERT INTO public.group_members (group_id, user_id, role)
      VALUES ('20000000-0000-0000-0000-0000000000c3', '10000000-0000-0000-0000-0000000000c4', 'member');
      INSERT INTO public.players (id, name, emoji, group_id)
      VALUES
        ('50000000-0000-0000-0000-0000000000d1', 'A', 'A', '20000000-0000-0000-0000-0000000000c3'),
        ('50000000-0000-0000-0000-0000000000d2', 'B', 'B', '20000000-0000-0000-0000-0000000000c3'),
        ('50000000-0000-0000-0000-0000000000d3', 'C', 'C', '20000000-0000-0000-0000-0000000000c3'),
        ('50000000-0000-0000-0000-0000000000d4', 'D', 'D', '20000000-0000-0000-0000-0000000000c3');
      INSERT INTO public.matches (id, group_id, team1, team2, sets)
      VALUES (
        '60000000-0000-0000-0000-0000000000c3',
        '20000000-0000-0000-0000-0000000000c3',
        ARRAY['50000000-0000-0000-0000-0000000000d1', '50000000-0000-0000-0000-0000000000d2']::uuid[],
        ARRAY['50000000-0000-0000-0000-0000000000d3', '50000000-0000-0000-0000-0000000000d4']::uuid[],
        '[{"team1Score": 6, "team2Score": 2}]'
      );
    $sql$
  );
  PERFORM extensions.dblink_connect('upd_one', pg_temp.local_db_connection_string());
  PERFORM extensions.dblink_connect('upd_two', pg_temp.local_db_connection_string());
  PERFORM extensions.dblink_exec(
    connection,
    $sql$
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000c4';
    $sql$
  )
  FROM unnest(ARRAY['upd_one', 'upd_two']) AS connection;
END;
$setup$;

CREATE TEMP TABLE concurrent_results (race text, result jsonb);

-- The first call keeps its transaction open for a second after updating. The
-- second waits for the match's row lock, then sees what the first committed.
CREATE FUNCTION pg_temp.race(p_race text, p_first jsonb, p_second jsonb)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM extensions.dblink_send_query(
    'upd_one',
    format(
      $query$
        WITH updated AS MATERIALIZED (SELECT public.update_match(%L::jsonb) AS result)
        SELECT updated.result FROM updated CROSS JOIN LATERAL (SELECT pg_sleep(1)) AS held
      $query$,
      p_first::text
    )
  );
  PERFORM pg_sleep(0.2);
  PERFORM extensions.dblink_send_query('upd_two', format('SELECT public.update_match(%L::jsonb)', p_second::text));
  INSERT INTO concurrent_results SELECT p_race, r.result FROM extensions.dblink_get_result('upd_one') AS r(result jsonb);
  PERFORM * FROM extensions.dblink_get_result('upd_one') AS r(result jsonb);
  INSERT INTO concurrent_results SELECT p_race, r.result FROM extensions.dblink_get_result('upd_two') AS r(result jsonb);
  PERFORM * FROM extensions.dblink_get_result('upd_two') AS r(result jsonb);
END;
$function$;

CREATE FUNCTION pg_temp.race_request(p_version bigint, p_court integer, p_key text)
RETURNS jsonb
LANGUAGE sql
AS $function$
  SELECT jsonb_build_object(
    'groupId', '20000000-0000-0000-0000-0000000000c3',
    'matchId', '60000000-0000-0000-0000-0000000000c3',
    'expectedVersion', p_version,
    'patch', jsonb_build_object('courtNumber', p_court),
    'idempotencyKey', p_key
  );
$function$;

CREATE FUNCTION pg_temp.race_version()
RETURNS bigint
LANGUAGE sql
AS $function$
  SELECT version FROM extensions.dblink(
    'upd_setup',
    $sql$ SELECT revision FROM native_private.match_state WHERE match_id = '60000000-0000-0000-0000-0000000000c3' $sql$
  ) AS r(version bigint);
$function$;

INSERT INTO saved VALUES ('race version', to_jsonb(pg_temp.race_version()));

SELECT pg_temp.race(
  'lost update',
  pg_temp.race_request(pg_temp.race_version(), 3, 'race-update-one'),
  pg_temp.race_request(pg_temp.race_version(), 4, 'race-update-two')
);

SELECT is(
  (SELECT array_agg(coalesce(result ->> 'code', result ->> 'status') ORDER BY result ->> 'status' DESC)
   FROM concurrent_results WHERE race = 'lost update'),
  ARRAY['updated', 'STALE_VERSION'],
  'of two corrections from the same version, the second is refused as stale'
);

SELECT pg_temp.race(
  'retry',
  pg_temp.race_request(pg_temp.race_version(), 9, 'race-update-retry'),
  pg_temp.race_request(pg_temp.race_version(), 9, 'race-update-retry')
);

SELECT is(
  (SELECT array_agg(result ->> 'status' ORDER BY result ->> 'status') FROM concurrent_results WHERE race = 'retry'),
  ARRAY['replayed', 'updated'],
  'concurrent identical calls update once and replay once'
);

SELECT is(
  (SELECT court FROM extensions.dblink(
    'upd_setup',
    $sql$ SELECT court_number FROM public.matches WHERE id = '60000000-0000-0000-0000-0000000000c3' $sql$
  ) AS r(court integer)),
  9,
  'the committed court is the last accepted correction'
);
SELECT is(
  pg_temp.race_version(),
  (SELECT (result #>> '{}')::bigint + 2 FROM saved WHERE name = 'race version'),
  'two accepted corrections moved the version twice'
);

DO $cleanup$
BEGIN
  PERFORM extensions.dblink_disconnect('upd_one');
  PERFORM extensions.dblink_disconnect('upd_two');
  PERFORM extensions.dblink_exec(
    'upd_setup',
    $sql$
      DELETE FROM public.matches WHERE group_id = '20000000-0000-0000-0000-0000000000c3';
      DELETE FROM public.players WHERE group_id = '20000000-0000-0000-0000-0000000000c3';
      DELETE FROM public.groups WHERE id = '20000000-0000-0000-0000-0000000000c3';
      DELETE FROM auth.users WHERE id = '10000000-0000-0000-0000-0000000000c4';
    $sql$
  );
  PERFORM extensions.dblink_disconnect('upd_setup');
END;
$cleanup$;

SELECT * FROM finish();

ROLLBACK;
