BEGIN;

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

SELECT plan(45);

-- ------------------------------------------------------------
-- Fixtures: two members of one group, an outsider with their own group, a
-- match in each, and a fifth player of the first group who didn't play.
-- ------------------------------------------------------------
INSERT INTO auth.users (id, email)
VALUES
  ('10000000-0000-0000-0000-000000000081', 'add-member@example.com'),
  ('10000000-0000-0000-0000-000000000082', 'add-outsider@example.com'),
  ('10000000-0000-0000-0000-000000000083', 'add-second-member@example.com');

INSERT INTO public.groups (id, name, emoji, invite_code, created_by)
VALUES
  ('20000000-0000-0000-0000-000000000081', 'Add group', 'P', 'ADDEV1', '10000000-0000-0000-0000-000000000081'),
  ('20000000-0000-0000-0000-000000000082', 'Outsider group', 'P', 'ADDEV2', '10000000-0000-0000-0000-000000000082');

INSERT INTO public.group_members (group_id, user_id, role)
VALUES
  ('20000000-0000-0000-0000-000000000081', '10000000-0000-0000-0000-000000000081', 'member'),
  ('20000000-0000-0000-0000-000000000081', '10000000-0000-0000-0000-000000000083', 'member'),
  ('20000000-0000-0000-0000-000000000082', '10000000-0000-0000-0000-000000000082', 'member');

INSERT INTO public.players (id, name, emoji, group_id)
VALUES
  ('50000000-0000-0000-0000-000000000081', 'Ana', 'A', '20000000-0000-0000-0000-000000000081'),
  ('50000000-0000-0000-0000-000000000082', 'Pablo', 'P', '20000000-0000-0000-0000-000000000081'),
  ('50000000-0000-0000-0000-000000000083', 'Lucia', 'L', '20000000-0000-0000-0000-000000000081'),
  ('50000000-0000-0000-0000-000000000084', 'Marta', 'M', '20000000-0000-0000-0000-000000000081'),
  ('50000000-0000-0000-0000-000000000085', 'Jose', 'J', '20000000-0000-0000-0000-000000000081'),
  ('50000000-0000-0000-0000-000000000086', 'Oscar', 'O', '20000000-0000-0000-0000-000000000082'),
  ('50000000-0000-0000-0000-000000000087', 'Rosa', 'R', '20000000-0000-0000-0000-000000000082'),
  ('50000000-0000-0000-0000-000000000088', 'Sara', 'S', '20000000-0000-0000-0000-000000000082'),
  ('50000000-0000-0000-0000-000000000089', 'Tomas', 'T', '20000000-0000-0000-0000-000000000082');

INSERT INTO public.matches (id, group_id, created_by, date, team1, team2, sets)
VALUES
  (
    '60000000-0000-0000-0000-000000000081',
    '20000000-0000-0000-0000-000000000081',
    '10000000-0000-0000-0000-000000000081',
    '2026-11-16T19:00:00Z',
    ARRAY['50000000-0000-0000-0000-000000000081', '50000000-0000-0000-0000-000000000082']::uuid[],
    ARRAY['50000000-0000-0000-0000-000000000083', '50000000-0000-0000-0000-000000000084']::uuid[],
    '[{"team1Score": 6, "team2Score": 3}]'
  ),
  (
    '60000000-0000-0000-0000-000000000082',
    '20000000-0000-0000-0000-000000000082',
    '10000000-0000-0000-0000-000000000082',
    '2026-11-16T19:00:00Z',
    ARRAY['50000000-0000-0000-0000-000000000086', '50000000-0000-0000-0000-000000000087']::uuid[],
    ARRAY['50000000-0000-0000-0000-000000000088', '50000000-0000-0000-0000-000000000089']::uuid[],
    '[{"team1Score": 6, "team2Score": 0}]'
  );

-- An event recorded earlier, of a type since retired: it stays.
INSERT INTO public.match_events (id, match_id, player_id, type, created_by)
VALUES
  ('70000000-0000-0000-0000-000000000081', '60000000-0000-0000-0000-000000000081',
   '50000000-0000-0000-0000-000000000083', 'vibora', '10000000-0000-0000-0000-000000000081');

-- A valid request, with p_fields merged over it.
CREATE FUNCTION pg_temp.request(p_fields jsonb DEFAULT '{}')
RETURNS jsonb
LANGUAGE sql
AS $function$
  SELECT jsonb_build_object(
    'groupId', '20000000-0000-0000-0000-000000000081',
    'matchId', '60000000-0000-0000-0000-000000000081',
    'events', jsonb_build_array(
      jsonb_build_object('playerId', '50000000-0000-0000-0000-000000000081', 'type', 'ace'),
      jsonb_build_object('playerId', '50000000-0000-0000-0000-000000000081', 'type', 'ace')
    ),
    'idempotencyKey', 'add-key-0001'
  ) || p_fields;
$function$;

-- p_count aces for Ana.
CREATE FUNCTION pg_temp.aces(p_count integer)
RETURNS jsonb
LANGUAGE sql
AS $function$
  SELECT jsonb_build_object('events', coalesce(jsonb_agg(
    jsonb_build_object('playerId', '50000000-0000-0000-0000-000000000081', 'type', 'ace')
  ), '[]'::jsonb))
  FROM generate_series(1, p_count);
$function$;

CREATE FUNCTION pg_temp.match_events()
RETURNS bigint
LANGUAGE sql
AS $function$
  SELECT count(*) FROM public.match_events WHERE match_id = '60000000-0000-0000-0000-000000000081';
$function$;

CREATE FUNCTION pg_temp.version()
RETURNS bigint
LANGUAGE sql
AS $function$
  SELECT revision FROM native_private.match_state WHERE match_id = '60000000-0000-0000-0000-000000000081';
$function$;

CREATE TEMP TABLE saved (name text PRIMARY KEY, result jsonb);
GRANT ALL ON saved TO authenticated;
INSERT INTO saved VALUES ('version before', to_jsonb(pg_temp.version()));

-- ------------------------------------------------------------
-- Privileges
-- ------------------------------------------------------------
SELECT ok(
  has_function_privilege('authenticated', 'public.add_match_events(jsonb)', 'execute'),
  'signed-in users can call add_match_events'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.add_match_events(jsonb)', 'execute'),
  'anonymous callers cannot call add_match_events'
);

SELECT ok(
  (SELECT prosecdef AND proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'public.add_match_events(jsonb)'::regprocedure),
  'add_match_events is a security definer with an empty search_path'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'match_private.event_receipts', 'select'),
  'signed-in users cannot read receipts'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.add_match_events(pg_temp.request()) $$,
  '42501',
  NULL,
  'the anon role is refused'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '';

SELECT is(
  public.add_match_events(pg_temp.request()) ->> 'code',
  'AUTH_REQUIRED',
  'a request without a user is refused'
);

-- ------------------------------------------------------------
-- Authorization
-- ------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000082';

SELECT is(
  public.add_match_events(pg_temp.request()) - 'message',
  '{"status": "rejected", "code": "MATCH_NOT_FOUND"}'::jsonb,
  'a non-member cannot add events to the group''s match'
);

SELECT is(
  public.add_match_events(pg_temp.request('{"groupId": "20000000-0000-0000-0000-000000000082"}')) ->> 'code',
  'MATCH_NOT_FOUND',
  'naming one''s own group does not reach another group''s match'
);

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000081';

SELECT is(
  public.add_match_events(pg_temp.request('{"matchId": "60000000-0000-0000-0000-000000000099"}')) ->> 'code',
  'MATCH_NOT_FOUND',
  'a missing match looks the same as a forbidden one'
);

SELECT is(
  public.add_match_events(pg_temp.request(
    '{"groupId": "20000000-0000-0000-0000-000000000081", "matchId": "60000000-0000-0000-0000-000000000082"}'
  )) ->> 'code',
  'MATCH_NOT_FOUND',
  'a match of another group is not found through the caller''s group'
);

-- ------------------------------------------------------------
-- Validation
-- ------------------------------------------------------------
SELECT is(public.add_match_events(pg_temp.request('{"version": 3}')) ->> 'code', 'INVALID_REQUEST', 'unknown fields are refused');
SELECT is(public.add_match_events(pg_temp.request('{"matchId": "nope"}')) ->> 'code', 'INVALID_REQUEST', 'a malformed match ID is refused');
SELECT is(public.add_match_events(pg_temp.request() - 'idempotencyKey') ->> 'code', 'INVALID_REQUEST', 'the idempotency key is required');
SELECT is(public.add_match_events(pg_temp.request('{"idempotencyKey": "short"}')) ->> 'code', 'INVALID_REQUEST', 'a malformed idempotency key is refused');
SELECT is(public.add_match_events(pg_temp.request('{"events": []}')) ->> 'code', 'INVALID_EVENTS', 'a request without events is refused');
SELECT is(public.add_match_events(pg_temp.request(pg_temp.aces(51))) ->> 'code', 'INVALID_EVENTS', 'more than 50 events in one call are refused');
SELECT is(
  public.add_match_events(pg_temp.request(
    '{"events": [{"playerId": "50000000-0000-0000-0000-000000000081", "type": "vibora"}]}'
  )) ->> 'code',
  'INVALID_EVENTS',
  'a retired event type is refused'
);
SELECT is(
  public.add_match_events(pg_temp.request(
    '{"events": [{"playerId": "50000000-0000-0000-0000-000000000081", "type": "ace", "sequence": 1}]}'
  )) ->> 'code',
  'INVALID_EVENTS',
  'extra event fields are refused'
);
SELECT is(
  public.add_match_events(pg_temp.request(
    '{"events": [{"playerId": "Ana", "type": "ace"}]}'
  )) ->> 'code',
  'INVALID_EVENTS',
  'a player name instead of an ID is refused'
);
SELECT is(
  public.add_match_events(pg_temp.request(
    '{"events": [{"playerId": "50000000-0000-0000-0000-000000000081", "type": "ace"},
                 {"playerId": "50000000-0000-0000-0000-000000000085", "type": "ace"}]}'
  )) - 'message',
  '{"status": "rejected", "code": "INVALID_EVENTS", "playerIds": ["50000000-0000-0000-0000-000000000085"]}'::jsonb,
  'a group player who did not play the match is refused and named'
);

RESET ROLE;
SELECT is(pg_temp.match_events(), 1::bigint, 'no refused request saved an event');
SELECT is((SELECT count(*) FROM match_private.event_receipts), 0::bigint, 'no refused request saved a receipt');
SET LOCAL ROLE authenticated;

-- ------------------------------------------------------------
-- Adding
-- ------------------------------------------------------------
INSERT INTO saved VALUES ('first', public.add_match_events(pg_temp.request(
  '{"events": [{"playerId": "50000000-0000-0000-0000-000000000081", "type": "ace"},
               {"playerId": "50000000-0000-0000-0000-000000000084", "type": "doble_falta"},
               {"playerId": "50000000-0000-0000-0000-000000000081", "type": "ace"}]}'
)));

SELECT is((SELECT result ->> 'status' FROM saved WHERE name = 'first'), 'added', 'the events are added');

SELECT is(
  (SELECT jsonb_path_query_array(result, '$.events[*].type') FROM saved WHERE name = 'first'),
  '["vibora", "ace", "doble_falta", "ace"]'::jsonb,
  'the snapshot keeps the earlier event and lists the new ones in request order'
);

SELECT is(
  (SELECT result -> 'addedEventIds' FROM saved WHERE name = 'first'),
  (SELECT jsonb_path_query_array(result, '$.events[1 to 3].id') FROM saved WHERE name = 'first'),
  'addedEventIds names exactly the new events, in order'
);

SELECT is(
  (SELECT result #>> '{match,id}' FROM saved WHERE name = 'first'),
  '60000000-0000-0000-0000-000000000081',
  'the snapshot is of the existing match'
);

RESET ROLE;
SELECT is(pg_temp.match_events(), 4::bigint, 'three events were saved');
SELECT ok(
  (SELECT bool_and(created_by = '10000000-0000-0000-0000-000000000081') FROM public.match_events
   WHERE id IN (SELECT jsonb_array_elements_text(result -> 'addedEventIds')::uuid FROM saved WHERE name = 'first')),
  'the new events are created by the caller'
);
SELECT is(
  (SELECT (result ->> 'version')::bigint FROM saved WHERE name = 'first'),
  pg_temp.version(),
  'the returned version is the match''s current one'
);
SELECT ok(
  pg_temp.version() > (SELECT (result #>> '{}')::bigint FROM saved WHERE name = 'version before'),
  'adding events changes the version'
);
SET LOCAL ROLE authenticated;

-- ------------------------------------------------------------
-- Retries
-- ------------------------------------------------------------
INSERT INTO saved VALUES ('replay', public.add_match_events(pg_temp.request(
  '{"events": [{"playerId": "50000000-0000-0000-0000-000000000081", "type": "ace"},
               {"playerId": "50000000-0000-0000-0000-000000000084", "type": "doble_falta"},
               {"playerId": "50000000-0000-0000-0000-000000000081", "type": "ace"}]}'
)));

SELECT is((SELECT result ->> 'status' FROM saved WHERE name = 'replay'), 'replayed', 'the same key and request replays');
SELECT is(
  (SELECT result -> 'addedEventIds' FROM saved WHERE name = 'replay'),
  (SELECT result -> 'addedEventIds' FROM saved WHERE name = 'first'),
  'a replay reports the events the first call added'
);

SELECT is(
  public.add_match_events(pg_temp.request()) ->> 'code',
  'IDEMPOTENCY_KEY_REUSED',
  'the same key with a different request is refused'
);

RESET ROLE;
SELECT is(pg_temp.match_events(), 4::bigint, 'retries saved nothing');
SET LOCAL ROLE authenticated;

-- Keys are per user: another member's identical key is a new request.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000083';
SELECT is(
  public.add_match_events(pg_temp.request()) ->> 'status',
  'added',
  'another user''s identical key adds its own events'
);

-- An OAuth client token (MAR-144) reaches the function too.
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '10000000-0000-0000-0000-000000000083', 'role', 'authenticated', 'client_id', 'oauth-client'
)::text, true);
SELECT is(
  public.add_match_events(pg_temp.request('{"idempotencyKey": "add-key-oauth"}'::jsonb || pg_temp.aces(1))) ->> 'status',
  'added',
  'an OAuth client token can add events'
);
SELECT set_config('request.jwt.claims', '', true);

-- ------------------------------------------------------------
-- Per-match limit: 7 events so far.
-- ------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000081';
SELECT is(
  public.add_match_events(pg_temp.request('{"idempotencyKey": "add-key-limit-1"}'::jsonb || pg_temp.aces(44))) ->> 'code',
  'TOO_MANY_EVENTS',
  'a call that would take the match past 50 events is refused'
);
SELECT is(
  public.add_match_events(pg_temp.request('{"idempotencyKey": "add-key-limit-2"}'::jsonb || pg_temp.aces(43))) ->> 'status',
  'added',
  'a call that fills the match up to 50 events is accepted'
);
SELECT is(
  public.add_match_events(pg_temp.request('{"idempotencyKey": "add-key-limit-3"}'::jsonb || pg_temp.aces(1))) ->> 'code',
  'TOO_MANY_EVENTS',
  'a full match accepts no more events'
);

-- ------------------------------------------------------------
-- A member who leaves can't replay their earlier call.
-- ------------------------------------------------------------
RESET ROLE;
DELETE FROM public.group_members
WHERE group_id = '20000000-0000-0000-0000-000000000081' AND user_id = '10000000-0000-0000-0000-000000000083';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000083';
SELECT is(
  public.add_match_events(pg_temp.request()) - 'message',
  '{"status": "rejected", "code": "MATCH_NOT_FOUND"}'::jsonb,
  'a former member''s replay is refused without the match'
);

-- ------------------------------------------------------------
-- Atomicity: a failing event insert leaves nothing behind.
-- ------------------------------------------------------------
RESET ROLE;
DELETE FROM public.match_events
WHERE match_id = '60000000-0000-0000-0000-000000000081' AND id <> '70000000-0000-0000-0000-000000000081';

CREATE FUNCTION pg_temp.fail_on_cinta()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF new.type = 'cinta' THEN
    RAISE EXCEPTION 'event insert failed';
  END IF;
  RETURN new;
END;
$function$;

CREATE TRIGGER fail_on_cinta BEFORE INSERT ON public.match_events
  FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_on_cinta();

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000081';
SELECT throws_ok(
  $$ SELECT public.add_match_events(pg_temp.request('{"idempotencyKey": "add-key-atomic",
       "events": [{"playerId": "50000000-0000-0000-0000-000000000081", "type": "ace"},
                  {"playerId": "50000000-0000-0000-0000-000000000082", "type": "cinta"}]}')) $$,
  'P0001',
  'event insert failed',
  'a failing event insert fails the whole call'
);

RESET ROLE;
DROP TRIGGER fail_on_cinta ON public.match_events;
SELECT is(pg_temp.match_events(), 1::bigint, 'none of the call''s events were kept');
SELECT is(
  (SELECT count(*) FROM match_private.event_receipts WHERE idempotency_key = 'add-key-atomic'),
  0::bigint,
  'nor its receipt'
);

-- ------------------------------------------------------------
-- Concurrency: two identical calls at once add the events once.
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
  PERFORM extensions.dblink_connect('add_setup', pg_temp.local_db_connection_string());
  PERFORM extensions.dblink_exec(
    'add_setup',
    $sql$
      INSERT INTO auth.users (id, email)
      VALUES ('10000000-0000-0000-0000-000000000084', 'add-concurrent@example.com');
      INSERT INTO public.groups (id, name, emoji, invite_code)
      VALUES ('20000000-0000-0000-0000-000000000083', 'Concurrent add', 'P', 'ADDEV3');
      INSERT INTO public.group_members (group_id, user_id, role)
      VALUES ('20000000-0000-0000-0000-000000000083', '10000000-0000-0000-0000-000000000084', 'member');
      INSERT INTO public.players (id, name, emoji, group_id)
      VALUES
        ('50000000-0000-0000-0000-000000000091', 'A', 'A', '20000000-0000-0000-0000-000000000083'),
        ('50000000-0000-0000-0000-000000000092', 'B', 'B', '20000000-0000-0000-0000-000000000083'),
        ('50000000-0000-0000-0000-000000000093', 'C', 'C', '20000000-0000-0000-0000-000000000083'),
        ('50000000-0000-0000-0000-000000000094', 'D', 'D', '20000000-0000-0000-0000-000000000083');
      INSERT INTO public.matches (id, group_id, team1, team2, sets)
      VALUES (
        '60000000-0000-0000-0000-000000000083',
        '20000000-0000-0000-0000-000000000083',
        ARRAY['50000000-0000-0000-0000-000000000091', '50000000-0000-0000-0000-000000000092']::uuid[],
        ARRAY['50000000-0000-0000-0000-000000000093', '50000000-0000-0000-0000-000000000094']::uuid[],
        '[{"team1Score": 6, "team2Score": 2}]'
      );
    $sql$
  );
  PERFORM extensions.dblink_connect('add_one', pg_temp.local_db_connection_string());
  PERFORM extensions.dblink_connect('add_two', pg_temp.local_db_connection_string());
  PERFORM extensions.dblink_exec(
    connection,
    $sql$
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000084';
    $sql$
  )
  FROM unnest(ARRAY['add_one', 'add_two']) AS connection;
END;
$setup$;

CREATE TEMP TABLE concurrent_results (result jsonb);

-- The first call keeps its transaction open for a second after adding. The
-- second waits for the match lock, then finds the first call's receipt.
DO $race$
DECLARE
  request text := jsonb_build_object(
    'groupId', '20000000-0000-0000-0000-000000000083',
    'matchId', '60000000-0000-0000-0000-000000000083',
    'events', jsonb_build_array(
      jsonb_build_object('playerId', '50000000-0000-0000-0000-000000000091', 'type', 'ace'),
      jsonb_build_object('playerId', '50000000-0000-0000-0000-000000000091', 'type', 'ace')
    ),
    'idempotencyKey', 'race-add-key'
  )::text;
BEGIN
  PERFORM extensions.dblink_send_query(
    'add_one',
    format(
      $query$
        WITH added AS MATERIALIZED (SELECT public.add_match_events(%L::jsonb) AS result)
        SELECT added.result FROM added CROSS JOIN LATERAL (SELECT pg_sleep(1)) AS held
      $query$,
      request
    )
  );
  PERFORM pg_sleep(0.2);
  PERFORM extensions.dblink_send_query('add_two', format('SELECT public.add_match_events(%L::jsonb)', request));
  INSERT INTO concurrent_results SELECT r.result FROM extensions.dblink_get_result('add_one') AS r(result jsonb);
  PERFORM * FROM extensions.dblink_get_result('add_one') AS r(result jsonb);
  INSERT INTO concurrent_results SELECT r.result FROM extensions.dblink_get_result('add_two') AS r(result jsonb);
  PERFORM * FROM extensions.dblink_get_result('add_two') AS r(result jsonb);
END;
$race$;

SELECT is(
  (SELECT array_agg(result ->> 'status' ORDER BY result ->> 'status') FROM concurrent_results),
  ARRAY['added', 'replayed'],
  'concurrent identical calls add once and replay once'
);

SELECT is(
  (SELECT count FROM extensions.dblink(
    'add_setup',
    $sql$ SELECT count(*) FROM public.match_events WHERE match_id = '60000000-0000-0000-0000-000000000083' $sql$
  ) AS r(count bigint)),
  2::bigint,
  'only the first call''s two events were committed'
);

DO $cleanup$
BEGIN
  PERFORM extensions.dblink_disconnect('add_one');
  PERFORM extensions.dblink_disconnect('add_two');
  PERFORM extensions.dblink_exec(
    'add_setup',
    $sql$
      DELETE FROM public.matches WHERE group_id = '20000000-0000-0000-0000-000000000083';
      DELETE FROM public.players WHERE group_id = '20000000-0000-0000-0000-000000000083';
      DELETE FROM public.groups WHERE id = '20000000-0000-0000-0000-000000000083';
      DELETE FROM auth.users WHERE id = '10000000-0000-0000-0000-000000000084';
    $sql$
  );
  PERFORM extensions.dblink_disconnect('add_setup');
END;
$cleanup$;

SELECT * FROM finish();

ROLLBACK;
