BEGIN;

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

SELECT plan(63);

-- ------------------------------------------------------------
-- Fixtures
-- ------------------------------------------------------------
INSERT INTO auth.users (id, email)
VALUES
  ('10000000-0000-0000-0000-000000000031', 'create-member@example.com'),
  ('10000000-0000-0000-0000-000000000032', 'create-outsider@example.com');

INSERT INTO public.groups (id, name, emoji, invite_code, created_by)
VALUES
  ('20000000-0000-0000-0000-000000000031', 'Create group', 'P', 'CREAT1', '10000000-0000-0000-0000-000000000031'),
  ('20000000-0000-0000-0000-000000000032', 'Other group', 'P', 'CREAT2', '10000000-0000-0000-0000-000000000032');

INSERT INTO public.group_members (group_id, user_id, role)
VALUES
  ('20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000031', 'member'),
  ('20000000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000032', 'member');

INSERT INTO public.players (id, name, emoji, group_id)
VALUES
  ('50000000-0000-0000-0000-000000000031', 'Ana', 'A', '20000000-0000-0000-0000-000000000031'),
  ('50000000-0000-0000-0000-000000000032', 'Pablo', 'P', '20000000-0000-0000-0000-000000000031'),
  ('50000000-0000-0000-0000-000000000033', 'Lucia', 'L', '20000000-0000-0000-0000-000000000031'),
  ('50000000-0000-0000-0000-000000000034', 'Marta', 'M', '20000000-0000-0000-0000-000000000031'),
  ('50000000-0000-0000-0000-000000000035', 'Jose', 'J', '20000000-0000-0000-0000-000000000031'),
  ('50000000-0000-0000-0000-000000000039', 'Elsewhere', 'E', '20000000-0000-0000-0000-000000000032');

-- A valid request, with p_fields merged over it.
CREATE FUNCTION pg_temp.request(p_fields jsonb DEFAULT '{}')
RETURNS jsonb
LANGUAGE sql
AS $function$
  SELECT jsonb_build_object(
    'groupId', '20000000-0000-0000-0000-000000000031',
    'team1', jsonb_build_array('50000000-0000-0000-0000-000000000031', '50000000-0000-0000-0000-000000000032'),
    'team2', jsonb_build_array('50000000-0000-0000-0000-000000000033', '50000000-0000-0000-0000-000000000034'),
    'sets', '[{"team1Score": 6, "team2Score": 4}, {"team1Score": 7, "team2Score": 5}]'::jsonb
  ) || p_fields;
$function$;

CREATE FUNCTION pg_temp.group_matches()
RETURNS bigint
LANGUAGE sql
AS $function$
  SELECT count(*) FROM public.matches WHERE group_id = '20000000-0000-0000-0000-000000000031';
$function$;

CREATE FUNCTION pg_temp.group_events()
RETURNS bigint
LANGUAGE sql
AS $function$
  SELECT count(*) FROM public.match_events AS event
  JOIN public.matches AS m ON m.id = event.match_id
  WHERE m.group_id = '20000000-0000-0000-0000-000000000031';
$function$;

CREATE TEMP TABLE saved (name text PRIMARY KEY, match_id uuid);
GRANT ALL ON saved TO authenticated;

-- ------------------------------------------------------------
-- Privileges
-- ------------------------------------------------------------
SELECT ok(
  has_function_privilege('authenticated', 'public.create_match(jsonb)', 'execute'),
  'signed-in users can call create_match'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.create_match(jsonb)', 'execute'),
  'anonymous callers cannot call create_match'
);

SELECT ok(
  NOT has_schema_privilege('authenticated', 'match_private', 'usage')
    AND NOT has_schema_privilege('anon', 'match_private', 'usage'),
  'API roles cannot reach the receipts schema'
);

SELECT ok(
  (SELECT prosecdef AND proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'public.create_match(jsonb)'::regprocedure),
  'create_match is a security definer with an empty search_path'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.create_match(pg_temp.request()) $$,
  '42501',
  NULL,
  'the anon role is refused'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '';

SELECT is(
  public.create_match(pg_temp.request()) ->> 'code',
  'AUTH_REQUIRED',
  'a request without a user is refused'
);

-- ------------------------------------------------------------
-- Authorization
-- ------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000032';

SELECT is(
  public.create_match(pg_temp.request()) ->> 'code',
  'GROUP_NOT_FOUND',
  'a non-member cannot record a match in the group'
);

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000031';

SELECT is(
  public.create_match(pg_temp.request('{"groupId": "20000000-0000-0000-0000-000000000099"}')) ->> 'code',
  'GROUP_NOT_FOUND',
  'a missing group looks the same as a forbidden one'
);

SELECT is(
  public.create_match(pg_temp.request(
    '{"team2": ["50000000-0000-0000-0000-000000000033", "50000000-0000-0000-0000-000000000039"]}'
  )) - 'message',
  '{"status": "rejected", "code": "PLAYER_NOT_IN_GROUP", "playerIds": ["50000000-0000-0000-0000-000000000039"]}'::jsonb,
  'a player from another group is refused and named'
);

SELECT is(
  public.create_match(pg_temp.request(
    '{"team1": ["50000000-0000-0000-0000-000000000031", "50000000-0000-0000-0000-000000000098"]}'
  )) -> 'playerIds',
  '["50000000-0000-0000-0000-000000000098"]'::jsonb,
  'an unknown player is refused and named'
);

-- ------------------------------------------------------------
-- Validation
-- ------------------------------------------------------------
SELECT is(public.create_match('[]') ->> 'code', 'INVALID_REQUEST', 'a non-object request is refused');
SELECT is(public.create_match(pg_temp.request('{"winner": 1}')) ->> 'code', 'INVALID_REQUEST', 'unknown fields are refused');
SELECT is(public.create_match(pg_temp.request('{"groupId": "nope"}')) ->> 'code', 'INVALID_REQUEST', 'a malformed group ID is refused');
SELECT is(public.create_match(pg_temp.request() - 'team2') ->> 'code', 'INVALID_TEAMS', 'a missing team is refused');
SELECT is(
  public.create_match(pg_temp.request('{"team1": ["50000000-0000-0000-0000-000000000031"]}')) ->> 'code',
  'INVALID_TEAMS',
  'a one-player team is refused'
);
SELECT is(
  public.create_match(pg_temp.request(
    '{"team2": ["50000000-0000-0000-0000-000000000031", "50000000-0000-0000-0000-000000000034"]}'
  )) ->> 'code',
  'INVALID_TEAMS',
  'a player on both teams is refused'
);
SELECT is(public.create_match(pg_temp.request('{"sets": []}')) ->> 'code', 'INVALID_SETS', 'a match without sets is refused');
SELECT is(
  public.create_match(pg_temp.request(jsonb_build_object('sets', (
    SELECT jsonb_agg('{"team1Score": 6, "team2Score": 4}'::jsonb) FROM generate_series(1, 6)
  )))) ->> 'code',
  'INVALID_SETS',
  'more than five sets are refused'
);
SELECT is(public.create_match(pg_temp.request('{"sets": [{"team1Score": -1, "team2Score": 6}]}')) ->> 'code', 'INVALID_SETS', 'negative scores are refused');
SELECT is(public.create_match(pg_temp.request('{"sets": [{"team1Score": 100, "team2Score": 6}]}')) ->> 'code', 'INVALID_SETS', 'scores above 99 are refused');
SELECT is(public.create_match(pg_temp.request('{"sets": [{"team1Score": 6.5, "team2Score": 4}]}')) ->> 'code', 'INVALID_SETS', 'fractional scores are refused');
SELECT is(public.create_match(pg_temp.request('{"sets": [{"team1Score": "6", "team2Score": 4}]}')) ->> 'code', 'INVALID_SETS', 'text scores are refused');
SELECT is(public.create_match(pg_temp.request('{"sets": [{"team1Score": 6, "team2Score": 4, "tiebreak": 7}]}')) ->> 'code', 'INVALID_SETS', 'extra set fields are refused');
SELECT is(
  public.create_match(pg_temp.request('{"sets": [{"team1Score": 6, "team2Score": 4}, {"team1Score": 0, "team2Score": 0}]}')) ->> 'message',
  'Set 2 has no score. Remove sets that were not played.',
  'an unplayed set is refused'
);
SELECT is(
  public.create_match(pg_temp.request(jsonb_build_object('date', to_char((now() + interval '1 day') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))) ->> 'code',
  'INVALID_DATE',
  'a future date is refused'
);
SELECT is(
  public.create_match(pg_temp.request(jsonb_build_object('date', to_char((now() - interval '400 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))) ->> 'code',
  'INVALID_DATE',
  'a date more than a year ago is refused'
);
SELECT is(public.create_match(pg_temp.request('{"date": "2026-11-10T19:00:00"}')) ->> 'code', 'INVALID_DATE', 'a date without a UTC offset is refused');
SELECT is(public.create_match(pg_temp.request('{"date": "yesterday"}')) ->> 'code', 'INVALID_DATE', 'free-form dates are refused');
SELECT is(public.create_match(pg_temp.request('{"courtNumber": 0}')) ->> 'code', 'INVALID_REQUEST', 'court 0 is refused');
SELECT is(public.create_match(pg_temp.request('{"courtNumber": "2"}')) ->> 'code', 'INVALID_REQUEST', 'a text court number is refused');
SELECT is(
  public.create_match(pg_temp.request('{"events": [{"playerId": "50000000-0000-0000-0000-000000000035", "type": "ace"}]}')) ->> 'code',
  'INVALID_EVENTS',
  'an event for a player outside the match is refused'
);
SELECT is(
  public.create_match(pg_temp.request('{"events": [{"playerId": "50000000-0000-0000-0000-000000000031", "type": "Robert''); DROP"}]}')) ->> 'code',
  'INVALID_EVENTS',
  'a malformed event type is refused'
);
SELECT is(
  public.create_match(pg_temp.request('{"events": [{"playerId": "50000000-0000-0000-0000-000000000031"}]}')) ->> 'code',
  'INVALID_EVENTS',
  'an event without a type is refused'
);
SELECT is(public.create_match(pg_temp.request('{"idempotencyKey": "short"}')) ->> 'code', 'INVALID_REQUEST', 'a short idempotency key is refused');

SELECT is(pg_temp.group_matches(), 0::bigint, 'no refused request created a match');

-- ------------------------------------------------------------
-- Creation
-- ------------------------------------------------------------
WITH result AS (
  SELECT public.create_match(pg_temp.request(
    '{"courtNumber": 3, "idempotencyKey": "key-first-match", "events": [
      {"playerId": "50000000-0000-0000-0000-000000000031", "type": "ace"},
      {"playerId": "50000000-0000-0000-0000-000000000034", "type": "vibora"}
    ]}'
  )) AS value
)
INSERT INTO saved SELECT 'first', (value #>> '{match,id}')::uuid FROM result
WHERE value ->> 'status' = 'created';

SELECT isnt((SELECT match_id FROM saved WHERE name = 'first'), NULL, 'a valid request creates a match');

SELECT is(
  (SELECT jsonb_build_object('team1', team1, 'team2', team2, 'sets', sets, 'court', court_number, 'createdBy', created_by)
   FROM public.matches WHERE id = (SELECT match_id FROM saved WHERE name = 'first')),
  jsonb_build_object(
    'team1', jsonb_build_array('50000000-0000-0000-0000-000000000031', '50000000-0000-0000-0000-000000000032'),
    'team2', jsonb_build_array('50000000-0000-0000-0000-000000000033', '50000000-0000-0000-0000-000000000034'),
    'sets', '[{"team1Score": 6, "team2Score": 4}, {"team1Score": 7, "team2Score": 5}]'::jsonb,
    'court', 3,
    'createdBy', '10000000-0000-0000-0000-000000000031'
  ),
  'the match is stored as every other writer stores it, attributed to the caller'
);

SELECT is(
  (SELECT date FROM public.matches WHERE id = (SELECT match_id FROM saved WHERE name = 'first')),
  now(),
  'a match without a date is dated now'
);

SELECT is(
  (SELECT array_agg(type || ':' || (created_by = '10000000-0000-0000-0000-000000000031') ORDER BY sequence)
   FROM public.match_events WHERE match_id = (SELECT match_id FROM saved WHERE name = 'first')),
  ARRAY['ace:true', 'vibora:true'],
  'its events are stored in order, attributed to the caller'
);

RESET ROLE;
SELECT ok(
  EXISTS (SELECT 1 FROM native_private.match_state WHERE match_id = (SELECT match_id FROM saved WHERE name = 'first')),
  'native scoring state is initialized as for any new match'
);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000031';

SELECT is(
  (SELECT public.create_match(pg_temp.request('{"courtNumber": 3, "idempotencyKey": "key-first-match", "events": [
      {"playerId": "50000000-0000-0000-0000-000000000031", "type": "ace"},
      {"playerId": "50000000-0000-0000-0000-000000000034", "type": "vibora"}
    ]}')) -> 'events' -> 1 ->> 'type'),
  'vibora',
  'the summary lists the saved events'
);

-- ------------------------------------------------------------
-- Retries
-- ------------------------------------------------------------
SELECT is(
  (SELECT r - 'match' - 'events' || jsonb_build_object('id', r #>> '{match,id}')
   FROM public.create_match(pg_temp.request(
     '{"idempotencyKey": "key-first-match", "courtNumber": 3, "events": [
       {"playerId": "50000000-0000-0000-0000-000000000031", "type": "ace"},
       {"playerId": "50000000-0000-0000-0000-000000000034", "type": "vibora"}
     ]}'
   )) AS r),
  jsonb_build_object('status', 'replayed', 'id', (SELECT match_id FROM saved WHERE name = 'first')),
  'a retry with the same key replays the saved match'
);

SELECT is(
  public.create_match(pg_temp.request(
    '{"idempotencyKey": "key-first-match", "courtNumber": 3, "events": [
      {"playerId": "50000000-0000-0000-0000-000000000034", "type": "vibora"},
      {"playerId": "50000000-0000-0000-0000-000000000031", "type": "ace"}
    ]}'
  )) ->> 'code',
  'IDEMPOTENCY_KEY_REUSED',
  'the same key with a different request is refused'
);

SELECT is(
  (SELECT r - 'match' - 'events' || jsonb_build_object('id', r #>> '{match,id}')
   FROM public.create_match(pg_temp.request('{"idempotencyKey": "key-model-changed-it"}')) AS r),
  jsonb_build_object('status', 'duplicate', 'id', (SELECT match_id FROM saved WHERE name = 'first')),
  'an identical request with a new key returns the match created moments ago'
);

SELECT is(
  (SELECT r - 'match' - 'events' || jsonb_build_object('id', r #>> '{match,id}')
   FROM public.create_match(pg_temp.request('{"idempotencyKey": "key-model-changed-it"}')) AS r),
  jsonb_build_object('status', 'replayed', 'id', (SELECT match_id FROM saved WHERE name = 'first')),
  'the new key now replays that match too'
);

SELECT is(
  public.create_match(jsonb_build_object(
    'groupId', '20000000-0000-0000-0000-000000000031',
    'team1', jsonb_build_array('50000000-0000-0000-0000-000000000034', '50000000-0000-0000-0000-000000000033'),
    'team2', jsonb_build_array('50000000-0000-0000-0000-000000000032', '50000000-0000-0000-0000-000000000031'),
    'sets', '[{"team1Score": 4, "team2Score": 6}, {"team1Score": 5, "team2Score": 7}]'::jsonb
  )) #>> '{match,id}',
  (SELECT match_id::text FROM saved WHERE name = 'first'),
  'the same match with the teams swapped and no key is a duplicate'
);

SELECT is(pg_temp.group_matches(), 1::bigint, 'retries created no other match');
SELECT is(pg_temp.group_events(), 2::bigint, 'retries created no other events');

SELECT is(
  public.create_match(pg_temp.request('{"sets": [{"team1Score": 6, "team2Score": 4}, {"team1Score": 7, "team2Score": 6}]}')) ->> 'status',
  'created',
  'a different score is a different match'
);

SELECT is(
  public.create_match(pg_temp.request(jsonb_build_object(
    'date', to_char((now() - interval '3 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ))) ->> 'status',
  'created',
  'the same lineup and score played on another day is a different match'
);

SELECT is(public.create_match(pg_temp.request('{"idempotencyKey": "key-rejected-once", "sets": []}')) ->> 'code', 'INVALID_SETS', 'a refused request saves no receipt');
SELECT is(public.create_match(pg_temp.request('{"idempotencyKey": "key-rejected-once", "courtNumber": 9, "sets": [{"team1Score": 2, "team2Score": 6}]}')) ->> 'status', 'created', 'so its key still works once the request is fixed');
SELECT is(public.create_match(pg_temp.request('{"idempotencyKey": "key-rejected-once", "courtNumber": 9, "sets": [{"team1Score": 2, "team2Score": 6}]}')) ->> 'status', 'replayed', 'and then replays');

-- Outside the window, an identical match is a new match.
RESET ROLE;
UPDATE public.matches SET created_at = now() - interval '20 minutes'
WHERE group_id = '20000000-0000-0000-0000-000000000031';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000031';

SELECT is(
  public.create_match(pg_temp.request()) ->> 'status',
  'created',
  'an identical match recorded more than 15 minutes later is new'
);

SELECT is(
  public.create_match(pg_temp.request('{"idempotencyKey": "key-first-match"}')) ->> 'code',
  'IDEMPOTENCY_KEY_REUSED',
  'a key keeps its request after the duplicate window'
);

-- Receipts are per user: another member's identical key does not replay.
RESET ROLE;
INSERT INTO public.group_members (group_id, user_id, role)
VALUES ('20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000032', 'member');
UPDATE public.matches SET created_at = now() - interval '20 minutes'
WHERE group_id = '20000000-0000-0000-0000-000000000031';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000032';

SELECT is(
  public.create_match(pg_temp.request('{"idempotencyKey": "key-first-match", "courtNumber": 4}')) ->> 'status',
  'created',
  'idempotency keys are scoped to the user'
);

SELECT is(
  (SELECT created_by FROM public.matches WHERE court_number = 4 AND group_id = '20000000-0000-0000-0000-000000000031'),
  '10000000-0000-0000-0000-000000000032'::uuid,
  'each match is attributed to its own caller'
);

-- A removed member can no longer replay their receipts.
RESET ROLE;
DELETE FROM public.group_members
WHERE group_id = '20000000-0000-0000-0000-000000000031' AND user_id = '10000000-0000-0000-0000-000000000032';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000032';

SELECT is(
  public.create_match(pg_temp.request('{"idempotencyKey": "key-first-match", "courtNumber": 4}')) ->> 'code',
  'GROUP_NOT_FOUND',
  'a removed member cannot replay a receipt'
);

RESET ROLE;

-- ------------------------------------------------------------
-- Concurrency: two identical requests at once create one match.
-- Each request runs in its own connection and commits, so the
-- fixtures for this part are committed and removed at the end.
-- It must run before any DDL in this transaction: the other
-- connections cannot see that it waits for them, so a table lock
-- held here (CREATE or DROP TRIGGER) would block them forever.
-- ------------------------------------------------------------
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
  PERFORM extensions.dblink_connect('create_setup', pg_temp.local_db_connection_string());
  PERFORM extensions.dblink_exec(
    'create_setup',
    $sql$
      INSERT INTO auth.users (id, email)
      VALUES ('10000000-0000-0000-0000-000000000033', 'create-concurrent@example.com');
      INSERT INTO public.groups (id, name, emoji, invite_code)
      VALUES ('20000000-0000-0000-0000-000000000033', 'Concurrent create', 'P', 'CREAT3');
      INSERT INTO public.group_members (group_id, user_id, role)
      VALUES ('20000000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000033', 'member');
      INSERT INTO public.players (id, name, emoji, group_id)
      VALUES
        ('50000000-0000-0000-0000-000000000041', 'A', 'A', '20000000-0000-0000-0000-000000000033'),
        ('50000000-0000-0000-0000-000000000042', 'B', 'B', '20000000-0000-0000-0000-000000000033'),
        ('50000000-0000-0000-0000-000000000043', 'C', 'C', '20000000-0000-0000-0000-000000000033'),
        ('50000000-0000-0000-0000-000000000044', 'D', 'D', '20000000-0000-0000-0000-000000000033');
    $sql$
  );
  PERFORM extensions.dblink_connect('create_one', pg_temp.local_db_connection_string());
  PERFORM extensions.dblink_connect('create_two', pg_temp.local_db_connection_string());
  PERFORM extensions.dblink_exec(
    connection,
    $sql$
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000033';
    $sql$
  )
  FROM unnest(ARRAY['create_one', 'create_two']) AS connection;
END;
$setup$;

CREATE TEMP TABLE concurrent_results (result jsonb);

-- The first request keeps its transaction open for a second after creating the
-- match. The second waits for the group lock, then finds that match.
DO $race$
DECLARE
  request_one text := jsonb_build_object(
    'groupId', '20000000-0000-0000-0000-000000000033',
    'team1', jsonb_build_array('50000000-0000-0000-0000-000000000041', '50000000-0000-0000-0000-000000000042'),
    'team2', jsonb_build_array('50000000-0000-0000-0000-000000000043', '50000000-0000-0000-0000-000000000044'),
    'sets', '[{"team1Score": 6, "team2Score": 2}]'::jsonb,
    'idempotencyKey', 'race-key-one'
  )::text;
  request_two text := replace(request_one, 'race-key-one', 'race-key-two');
BEGIN
  PERFORM extensions.dblink_send_query(
    'create_one',
    format(
      $query$
        WITH created AS MATERIALIZED (SELECT public.create_match(%L::jsonb) AS result)
        SELECT created.result FROM created CROSS JOIN LATERAL (SELECT pg_sleep(1)) AS held
      $query$,
      request_one
    )
  );
  PERFORM pg_sleep(0.2);
  PERFORM extensions.dblink_send_query('create_two', format('SELECT public.create_match(%L::jsonb)', request_two));
  INSERT INTO concurrent_results SELECT r.result FROM extensions.dblink_get_result('create_one') AS r(result jsonb);
  PERFORM * FROM extensions.dblink_get_result('create_one') AS r(result jsonb);
  INSERT INTO concurrent_results SELECT r.result FROM extensions.dblink_get_result('create_two') AS r(result jsonb);
  PERFORM * FROM extensions.dblink_get_result('create_two') AS r(result jsonb);
END;
$race$;

SELECT is(
  (SELECT array_agg(result ->> 'status' ORDER BY result ->> 'status') FROM concurrent_results),
  ARRAY['created', 'duplicate'],
  'concurrent identical requests produce one match and one duplicate'
);

SELECT is(
  (SELECT count(DISTINCT result #>> '{match,id}') FROM concurrent_results),
  1::bigint,
  'both requests report the same match'
);

SELECT is(
  (SELECT count FROM extensions.dblink(
    'create_setup',
    $sql$ SELECT count(*) FROM public.matches WHERE group_id = '20000000-0000-0000-0000-000000000033' $sql$
  ) AS r(count bigint)),
  1::bigint,
  'only one match was committed'
);

DO $cleanup$
BEGIN
  PERFORM extensions.dblink_disconnect('create_one');
  PERFORM extensions.dblink_disconnect('create_two');
  PERFORM extensions.dblink_exec(
    'create_setup',
    $sql$
      DELETE FROM public.matches WHERE group_id = '20000000-0000-0000-0000-000000000033';
      DELETE FROM public.players WHERE group_id = '20000000-0000-0000-0000-000000000033';
      DELETE FROM public.groups WHERE id = '20000000-0000-0000-0000-000000000033';
      DELETE FROM auth.users WHERE id = '10000000-0000-0000-0000-000000000033';
    $sql$
  );
  PERFORM extensions.dblink_disconnect('create_setup');
END;
$cleanup$;

-- ------------------------------------------------------------
-- Atomicity: a failing event insert leaves no match behind.
-- ------------------------------------------------------------
RESET ROLE;
CREATE FUNCTION pg_temp.fail_on_cano()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF new.type = 'cano' THEN
    RAISE EXCEPTION 'event insert failed' USING errcode = 'P0001';
  END IF;
  RETURN new;
END;
$function$;
CREATE TRIGGER fail_on_cano BEFORE INSERT ON public.match_events
  FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_on_cano();

CREATE TEMP TABLE counts_before AS SELECT pg_temp.group_matches() AS matches, pg_temp.group_events() AS events;
GRANT SELECT ON counts_before TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000031';

SELECT throws_ok(
  $$ SELECT public.create_match(pg_temp.request('{"sets": [{"team1Score": 1, "team2Score": 6}], "events": [
       {"playerId": "50000000-0000-0000-0000-000000000031", "type": "ace"},
       {"playerId": "50000000-0000-0000-0000-000000000032", "type": "cano"}
     ]}')) $$,
  'P0001',
  'event insert failed',
  'a failing event insert fails the whole call'
);

SELECT is(
  pg_temp.group_matches() || '/' || pg_temp.group_events(),
  (SELECT matches || '/' || events FROM counts_before),
  'neither the match nor its other events were kept'
);

RESET ROLE;
DROP TRIGGER fail_on_cano ON public.match_events;

SELECT * FROM finish();

ROLLBACK;
