BEGIN;

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

SELECT plan(42);

-- ------------------------------------------------------------
-- Fixtures: two members of one group with two matches, and an outsider with
-- their own group and match. The first match has two identical aces for Ana,
-- a double fault for Pablo and an event of a since-retired type.
-- ------------------------------------------------------------
INSERT INTO auth.users (id, email)
VALUES
  ('10000000-0000-0000-0000-0000000000b1', 'remove-member@example.com'),
  ('10000000-0000-0000-0000-0000000000b2', 'remove-outsider@example.com'),
  ('10000000-0000-0000-0000-0000000000b3', 'remove-second-member@example.com');

INSERT INTO public.groups (id, name, emoji, invite_code, created_by)
VALUES
  ('20000000-0000-0000-0000-0000000000b1', 'Remove group', 'P', 'RMEV01', '10000000-0000-0000-0000-0000000000b1'),
  ('20000000-0000-0000-0000-0000000000b2', 'Outsider group', 'P', 'RMEV02', '10000000-0000-0000-0000-0000000000b2');

INSERT INTO public.group_members (group_id, user_id, role)
VALUES
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 'member'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b3', 'member'),
  ('20000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-0000000000b2', 'member');

INSERT INTO public.players (id, name, emoji, group_id)
VALUES
  ('50000000-0000-0000-0000-0000000000b1', 'Ana', 'A', '20000000-0000-0000-0000-0000000000b1'),
  ('50000000-0000-0000-0000-0000000000b2', 'Pablo', 'P', '20000000-0000-0000-0000-0000000000b1'),
  ('50000000-0000-0000-0000-0000000000b3', 'Lucia', 'L', '20000000-0000-0000-0000-0000000000b1'),
  ('50000000-0000-0000-0000-0000000000b4', 'Marta', 'M', '20000000-0000-0000-0000-0000000000b1'),
  ('50000000-0000-0000-0000-0000000000b6', 'Oscar', 'O', '20000000-0000-0000-0000-0000000000b2'),
  ('50000000-0000-0000-0000-0000000000b7', 'Rosa', 'R', '20000000-0000-0000-0000-0000000000b2'),
  ('50000000-0000-0000-0000-0000000000b8', 'Sara', 'S', '20000000-0000-0000-0000-0000000000b2'),
  ('50000000-0000-0000-0000-0000000000b9', 'Tomas', 'T', '20000000-0000-0000-0000-0000000000b2');

INSERT INTO public.matches (id, group_id, created_by, date, team1, team2, sets)
VALUES
  (
    '60000000-0000-0000-0000-0000000000b1',
    '20000000-0000-0000-0000-0000000000b1',
    '10000000-0000-0000-0000-0000000000b1',
    '2026-11-16T19:00:00Z',
    ARRAY['50000000-0000-0000-0000-0000000000b1', '50000000-0000-0000-0000-0000000000b2']::uuid[],
    ARRAY['50000000-0000-0000-0000-0000000000b3', '50000000-0000-0000-0000-0000000000b4']::uuid[],
    '[{"team1Score": 6, "team2Score": 3}]'
  ),
  (
    '60000000-0000-0000-0000-0000000000b3',
    '20000000-0000-0000-0000-0000000000b1',
    '10000000-0000-0000-0000-0000000000b1',
    '2026-11-17T19:00:00Z',
    ARRAY['50000000-0000-0000-0000-0000000000b1', '50000000-0000-0000-0000-0000000000b3']::uuid[],
    ARRAY['50000000-0000-0000-0000-0000000000b2', '50000000-0000-0000-0000-0000000000b4']::uuid[],
    '[{"team1Score": 6, "team2Score": 1}]'
  ),
  (
    '60000000-0000-0000-0000-0000000000b2',
    '20000000-0000-0000-0000-0000000000b2',
    '10000000-0000-0000-0000-0000000000b2',
    '2026-11-16T19:00:00Z',
    ARRAY['50000000-0000-0000-0000-0000000000b6', '50000000-0000-0000-0000-0000000000b7']::uuid[],
    ARRAY['50000000-0000-0000-0000-0000000000b8', '50000000-0000-0000-0000-0000000000b9']::uuid[],
    '[{"team1Score": 6, "team2Score": 0}]'
  );

INSERT INTO public.match_events (id, match_id, player_id, type, created_by)
VALUES
  ('70000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b1',
   '50000000-0000-0000-0000-0000000000b1', 'ace', '10000000-0000-0000-0000-0000000000b1'),
  ('70000000-0000-0000-0000-0000000000b2', '60000000-0000-0000-0000-0000000000b1',
   '50000000-0000-0000-0000-0000000000b1', 'ace', '10000000-0000-0000-0000-0000000000b1'),
  ('70000000-0000-0000-0000-0000000000b3', '60000000-0000-0000-0000-0000000000b1',
   '50000000-0000-0000-0000-0000000000b2', 'doble_falta', '10000000-0000-0000-0000-0000000000b1'),
  ('70000000-0000-0000-0000-0000000000b4', '60000000-0000-0000-0000-0000000000b1',
   '50000000-0000-0000-0000-0000000000b3', 'vibora', '10000000-0000-0000-0000-0000000000b1'),
  ('70000000-0000-0000-0000-0000000000b5', '60000000-0000-0000-0000-0000000000b3',
   '50000000-0000-0000-0000-0000000000b1', 'ace', '10000000-0000-0000-0000-0000000000b1'),
  ('70000000-0000-0000-0000-0000000000b6', '60000000-0000-0000-0000-0000000000b2',
   '50000000-0000-0000-0000-0000000000b6', 'ace', '10000000-0000-0000-0000-0000000000b2');

CREATE FUNCTION pg_temp.version(p_match_id uuid DEFAULT '60000000-0000-0000-0000-0000000000b1')
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $function$
  SELECT revision FROM native_private.match_state WHERE match_id = p_match_id;
$function$;

-- A valid request for the first ace at the current version, with p_fields merged over it.
CREATE FUNCTION pg_temp.request(p_fields jsonb DEFAULT '{}')
RETURNS jsonb
LANGUAGE sql
AS $function$
  SELECT jsonb_build_object(
    'groupId', '20000000-0000-0000-0000-0000000000b1',
    'matchId', '60000000-0000-0000-0000-0000000000b1',
    'eventId', '70000000-0000-0000-0000-0000000000b1',
    'expectedVersion', pg_temp.version()
  ) || p_fields;
$function$;

CREATE FUNCTION pg_temp.event_ids(p_match_id uuid DEFAULT '60000000-0000-0000-0000-0000000000b1')
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
AS $function$
  SELECT coalesce(array_agg(id ORDER BY sequence), '{}') FROM public.match_events WHERE match_id = p_match_id;
$function$;

-- The helpers read as the test owner, whatever role the test has switched to.
CREATE TEMP TABLE saved (name text PRIMARY KEY, result jsonb);
GRANT ALL ON saved TO authenticated;

-- ------------------------------------------------------------
-- Privileges
-- ------------------------------------------------------------
SELECT ok(
  has_function_privilege('authenticated', 'public.remove_match_event(jsonb)', 'execute'),
  'signed-in users can call remove_match_event'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.remove_match_event(jsonb)', 'execute'),
  'anonymous callers cannot call remove_match_event'
);

SELECT ok(
  (SELECT prosecdef AND proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'public.remove_match_event(jsonb)'::regprocedure),
  'remove_match_event is a security definer with an empty search_path'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'match_private.removed_events', 'select'),
  'signed-in users cannot read removal records'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.remove_match_event('{}'::jsonb) $$,
  '42501',
  NULL,
  'the anon role is refused'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '';

SELECT is(
  public.remove_match_event(pg_temp.request()) ->> 'code',
  'AUTH_REQUIRED',
  'a request without a user is refused'
);

-- ------------------------------------------------------------
-- Authorization and targeting
-- ------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000b2';

SELECT is(
  public.remove_match_event(pg_temp.request()) - 'message',
  '{"status": "rejected", "code": "MATCH_NOT_FOUND"}'::jsonb,
  'a non-member cannot remove an event of the group''s match'
);

SELECT is(
  public.remove_match_event(pg_temp.request('{"groupId": "20000000-0000-0000-0000-0000000000b2"}')) ->> 'code',
  'MATCH_NOT_FOUND',
  'naming one''s own group does not reach another group''s match'
);

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000b1';

SELECT is(
  public.remove_match_event(pg_temp.request('{"matchId": "60000000-0000-0000-0000-0000000000b9"}')) ->> 'code',
  'MATCH_NOT_FOUND',
  'a missing match looks the same as a forbidden one'
);

SELECT is(
  public.remove_match_event(pg_temp.request(jsonb_build_object(
    'matchId', '60000000-0000-0000-0000-0000000000b2',
    'eventId', '70000000-0000-0000-0000-0000000000b6',
    'expectedVersion', pg_temp.version('60000000-0000-0000-0000-0000000000b2')))) ->> 'code',
  'MATCH_NOT_FOUND',
  'another group''s match is not found under one''s own group'
);

SELECT is(
  public.remove_match_event(pg_temp.request(jsonb_build_object(
    'matchId', '60000000-0000-0000-0000-0000000000b3',
    'expectedVersion', pg_temp.version('60000000-0000-0000-0000-0000000000b3')))) - 'message',
  '{"status": "rejected", "code": "EVENT_NOT_FOUND"}'::jsonb,
  'an event of another match is not found in this one'
);

SELECT is(
  public.remove_match_event(pg_temp.request('{"eventId": "70000000-0000-0000-0000-0000000000b6"}')) ->> 'code',
  'EVENT_NOT_FOUND',
  'another group''s event is not found in this match'
);

SELECT is(
  public.remove_match_event(pg_temp.request('{"eventId": "70000000-0000-0000-0000-0000000000b9"}')) ->> 'code',
  'EVENT_NOT_FOUND',
  'a missing event is not found'
);

-- ------------------------------------------------------------
-- Validation
-- ------------------------------------------------------------
SELECT is(
  public.remove_match_event('[]'::jsonb) ->> 'code',
  'INVALID_REQUEST',
  'a request that is not an object is refused'
);

SELECT is(
  public.remove_match_event(pg_temp.request('{"force": true}')) ->> 'code',
  'INVALID_REQUEST',
  'unknown fields are refused'
);

SELECT is(
  public.remove_match_event(pg_temp.request('{"eventId": "ace"}')) ->> 'code',
  'INVALID_REQUEST',
  'an event ID that is not a UUID is refused'
);

SELECT is(
  public.remove_match_event(pg_temp.request() - 'expectedVersion') ->> 'code',
  'INVALID_REQUEST',
  'a missing version is refused'
);

SELECT is(
  public.remove_match_event(pg_temp.request('{"expectedVersion": "3"}')) ->> 'code',
  'INVALID_REQUEST',
  'a version given as text is refused'
);

SELECT is(
  public.remove_match_event(pg_temp.request('{"expectedVersion": -1}')) ->> 'code',
  'INVALID_REQUEST',
  'a negative version is refused'
);

SELECT is(
  public.remove_match_event(pg_temp.request(jsonb_build_object('expectedVersion', pg_temp.version() + 0.5))) ->> 'code',
  'INVALID_REQUEST',
  'a fractional version is refused'
);

-- ------------------------------------------------------------
-- A stale read removes nothing.
-- ------------------------------------------------------------
INSERT INTO saved VALUES ('version before', to_jsonb(pg_temp.version()));

SELECT is(
  public.remove_match_event(pg_temp.request(jsonb_build_object('expectedVersion', pg_temp.version() - 1))) - 'message',
  '{"status": "rejected", "code": "STALE_VERSION"}'::jsonb,
  'an older version is refused'
);

SELECT is(
  public.remove_match_event(pg_temp.request(jsonb_build_object('expectedVersion', pg_temp.version() + 1))) ->> 'code',
  'STALE_VERSION',
  'a version from the future is refused'
);

SELECT is(
  pg_temp.event_ids(),
  ARRAY['70000000-0000-0000-0000-0000000000b1', '70000000-0000-0000-0000-0000000000b2',
        '70000000-0000-0000-0000-0000000000b3', '70000000-0000-0000-0000-0000000000b4']::uuid[],
  'refused requests removed nothing'
);

SELECT is(
  to_jsonb(pg_temp.version()),
  (SELECT result FROM saved WHERE name = 'version before'),
  'nor changed the version'
);

-- ------------------------------------------------------------
-- Removing exactly one event
-- ------------------------------------------------------------
INSERT INTO saved VALUES ('removed', public.remove_match_event(pg_temp.request()));

SELECT is(
  (SELECT result ->> 'status' FROM saved WHERE name = 'removed'),
  'removed',
  'the targeted event is removed'
);

SELECT is(
  (SELECT result -> 'removedEvent' FROM saved WHERE name = 'removed'),
  '{"id": "70000000-0000-0000-0000-0000000000b1", "playerId": "50000000-0000-0000-0000-0000000000b1", "type": "ace"}'::jsonb,
  'the result names the removed event'
);

SELECT is(
  pg_temp.event_ids(),
  ARRAY['70000000-0000-0000-0000-0000000000b2', '70000000-0000-0000-0000-0000000000b3',
        '70000000-0000-0000-0000-0000000000b4']::uuid[],
  'only that event is gone: the identical ace and the other events stay'
);

SELECT is(
  pg_temp.event_ids('60000000-0000-0000-0000-0000000000b3'),
  ARRAY['70000000-0000-0000-0000-0000000000b5']::uuid[],
  'the group''s other match is untouched'
);

SELECT is(
  pg_temp.version(),
  (SELECT result #>> '{}' FROM saved WHERE name = 'version before')::bigint + 1,
  'the removal bumps the version once'
);

SELECT is(
  (SELECT jsonb_build_object('version', result -> 'version', 'events', jsonb_array_length(result -> 'events'))
   FROM saved WHERE name = 'removed'),
  jsonb_build_object('version', pg_temp.version(), 'events', 3),
  'the result is the match as it is now'
);

-- ------------------------------------------------------------
-- Retries
-- ------------------------------------------------------------
INSERT INTO saved VALUES ('replayed', public.remove_match_event(pg_temp.request(jsonb_build_object(
  'expectedVersion', (SELECT result #>> '{}' FROM saved WHERE name = 'version before')::bigint))));

SELECT is(
  (SELECT jsonb_build_object('status', result -> 'status', 'removedEvent', result -> 'removedEvent')
   FROM saved WHERE name = 'replayed'),
  jsonb_build_object('status', 'already_removed',
    'removedEvent', (SELECT result -> 'removedEvent' FROM saved WHERE name = 'removed')),
  'a retry with the original version reports the same event as already removed'
);

SELECT is(
  pg_temp.event_ids(),
  ARRAY['70000000-0000-0000-0000-0000000000b2', '70000000-0000-0000-0000-0000000000b3',
        '70000000-0000-0000-0000-0000000000b4']::uuid[],
  'the retry removed nothing more'
);

SELECT is(
  pg_temp.version(),
  (SELECT (result ->> 'version')::bigint FROM saved WHERE name = 'removed'),
  'nor changed the version'
);

SELECT is(
  public.remove_match_event(pg_temp.request(jsonb_build_object(
    'matchId', '60000000-0000-0000-0000-0000000000b3',
    'expectedVersion', pg_temp.version('60000000-0000-0000-0000-0000000000b3')))) ->> 'code',
  'EVENT_NOT_FOUND',
  'a retry naming another match does not find the removed event'
);

-- An event ID recorded again later (native clients choose IDs) is live again.
RESET ROLE;
INSERT INTO public.match_events (id, match_id, player_id, type, created_by)
VALUES ('70000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b1',
        '50000000-0000-0000-0000-0000000000b2', 'cinta', '10000000-0000-0000-0000-0000000000b1');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000b1';

SELECT is(
  public.remove_match_event(pg_temp.request()) -> 'removedEvent' ->> 'type',
  'cinta',
  'a re-recorded event ID is removed again, not reported as already removed'
);

-- An OAuth client token (MAR-144) reaches the function too.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000b3';
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '10000000-0000-0000-0000-0000000000b3', 'role', 'authenticated', 'client_id', 'oauth-client'
)::text, true);
SELECT is(
  public.remove_match_event(pg_temp.request('{"eventId": "70000000-0000-0000-0000-0000000000b3"}')) ->> 'status',
  'removed',
  'an OAuth client token can remove an event'
);
SELECT set_config('request.jwt.claims', '', true);

-- ------------------------------------------------------------
-- A member who leaves can't replay their earlier call.
-- ------------------------------------------------------------
RESET ROLE;
DELETE FROM public.group_members
WHERE group_id = '20000000-0000-0000-0000-0000000000b1' AND user_id = '10000000-0000-0000-0000-0000000000b3';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000b3';
SELECT is(
  public.remove_match_event(pg_temp.request('{"eventId": "70000000-0000-0000-0000-0000000000b3"}')) - 'message',
  '{"status": "rejected", "code": "MATCH_NOT_FOUND"}'::jsonb,
  'a former member''s replay is refused without the match'
);

-- ------------------------------------------------------------
-- Expired removal records are cleaned up.
-- ------------------------------------------------------------
RESET ROLE;
UPDATE match_private.removed_events
SET retain_until = now() - interval '1 second'
WHERE event_id = '70000000-0000-0000-0000-0000000000b3';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000b1';
SELECT is(
  public.remove_match_event(pg_temp.request('{"eventId": "70000000-0000-0000-0000-0000000000b3"}')) ->> 'code',
  'EVENT_NOT_FOUND',
  'after 48 hours a retry no longer finds the removal'
);
SELECT is(
  public.remove_match_event(pg_temp.request('{"eventId": "70000000-0000-0000-0000-0000000000b2"}')) ->> 'status',
  'removed',
  'the next removal succeeds'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM match_private.removed_events WHERE event_id = '70000000-0000-0000-0000-0000000000b3'),
  0::bigint,
  'and deletes the expired record'
);

-- ------------------------------------------------------------
-- Concurrency: two identical calls at once remove the event once.
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
  PERFORM extensions.dblink_connect('remove_setup', pg_temp.local_db_connection_string());
  PERFORM extensions.dblink_exec(
    'remove_setup',
    $sql$
      INSERT INTO auth.users (id, email)
      VALUES ('10000000-0000-0000-0000-0000000000b4', 'remove-concurrent@example.com');
      INSERT INTO public.groups (id, name, emoji, invite_code)
      VALUES ('20000000-0000-0000-0000-0000000000b3', 'Concurrent remove', 'P', 'RMEV03');
      INSERT INTO public.group_members (group_id, user_id, role)
      VALUES ('20000000-0000-0000-0000-0000000000b3', '10000000-0000-0000-0000-0000000000b4', 'member');
      INSERT INTO public.players (id, name, emoji, group_id)
      VALUES
        ('50000000-0000-0000-0000-0000000000c1', 'A', 'A', '20000000-0000-0000-0000-0000000000b3'),
        ('50000000-0000-0000-0000-0000000000c2', 'B', 'B', '20000000-0000-0000-0000-0000000000b3'),
        ('50000000-0000-0000-0000-0000000000c3', 'C', 'C', '20000000-0000-0000-0000-0000000000b3'),
        ('50000000-0000-0000-0000-0000000000c4', 'D', 'D', '20000000-0000-0000-0000-0000000000b3');
      INSERT INTO public.matches (id, group_id, team1, team2, sets)
      VALUES (
        '60000000-0000-0000-0000-0000000000b4',
        '20000000-0000-0000-0000-0000000000b3',
        ARRAY['50000000-0000-0000-0000-0000000000c1', '50000000-0000-0000-0000-0000000000c2']::uuid[],
        ARRAY['50000000-0000-0000-0000-0000000000c3', '50000000-0000-0000-0000-0000000000c4']::uuid[],
        '[{"team1Score": 6, "team2Score": 2}]'
      );
      INSERT INTO public.match_events (id, match_id, player_id, type)
      VALUES
        ('70000000-0000-0000-0000-0000000000c1', '60000000-0000-0000-0000-0000000000b4',
         '50000000-0000-0000-0000-0000000000c1', 'ace'),
        ('70000000-0000-0000-0000-0000000000c2', '60000000-0000-0000-0000-0000000000b4',
         '50000000-0000-0000-0000-0000000000c1', 'ace');
    $sql$
  );
  PERFORM extensions.dblink_connect('remove_one', pg_temp.local_db_connection_string());
  PERFORM extensions.dblink_connect('remove_two', pg_temp.local_db_connection_string());
  PERFORM extensions.dblink_exec(
    connection,
    $sql$
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '10000000-0000-0000-0000-0000000000b4';
    $sql$
  )
  FROM unnest(ARRAY['remove_one', 'remove_two']) AS connection;
END;
$setup$;

CREATE TEMP TABLE concurrent_results (result jsonb);

-- The first call keeps its transaction open for a second after removing. The
-- second waits for the match state lock, then finds the removal record.
DO $race$
DECLARE
  request text := jsonb_build_object(
    'groupId', '20000000-0000-0000-0000-0000000000b3',
    'matchId', '60000000-0000-0000-0000-0000000000b4',
    'eventId', '70000000-0000-0000-0000-0000000000c1',
    'expectedVersion', (SELECT version FROM extensions.dblink(
      'remove_setup',
      $sql$ SELECT revision FROM native_private.match_state WHERE match_id = '60000000-0000-0000-0000-0000000000b4' $sql$
    ) AS r(version bigint))
  )::text;
BEGIN
  PERFORM extensions.dblink_send_query(
    'remove_one',
    format(
      $query$
        WITH removed AS MATERIALIZED (SELECT public.remove_match_event(%L::jsonb) AS result)
        SELECT removed.result FROM removed CROSS JOIN LATERAL (SELECT pg_sleep(1)) AS held
      $query$,
      request
    )
  );
  PERFORM pg_sleep(0.2);
  PERFORM extensions.dblink_send_query('remove_two', format('SELECT public.remove_match_event(%L::jsonb)', request));
  INSERT INTO concurrent_results SELECT r.result FROM extensions.dblink_get_result('remove_one') AS r(result jsonb);
  PERFORM * FROM extensions.dblink_get_result('remove_one') AS r(result jsonb);
  INSERT INTO concurrent_results SELECT r.result FROM extensions.dblink_get_result('remove_two') AS r(result jsonb);
  PERFORM * FROM extensions.dblink_get_result('remove_two') AS r(result jsonb);
END;
$race$;

SELECT is(
  (SELECT array_agg(result ->> 'status' ORDER BY result ->> 'status') FROM concurrent_results),
  ARRAY['already_removed', 'removed'],
  'concurrent identical calls remove once and report it once'
);

SELECT is(
  (SELECT ids FROM extensions.dblink(
    'remove_setup',
    $sql$ SELECT array_agg(id) FROM public.match_events WHERE match_id = '60000000-0000-0000-0000-0000000000b4' $sql$
  ) AS r(ids uuid[])),
  ARRAY['70000000-0000-0000-0000-0000000000c2']::uuid[],
  'only the targeted event was removed, once'
);

DO $cleanup$
BEGIN
  PERFORM extensions.dblink_disconnect('remove_one');
  PERFORM extensions.dblink_disconnect('remove_two');
  PERFORM extensions.dblink_exec(
    'remove_setup',
    $sql$
      DELETE FROM public.matches WHERE group_id = '20000000-0000-0000-0000-0000000000b3';
      DELETE FROM public.players WHERE group_id = '20000000-0000-0000-0000-0000000000b3';
      DELETE FROM public.groups WHERE id = '20000000-0000-0000-0000-0000000000b3';
      DELETE FROM auth.users WHERE id = '10000000-0000-0000-0000-0000000000b4';
    $sql$
  );
  PERFORM extensions.dblink_disconnect('remove_setup');
END;
$cleanup$;

SELECT * FROM finish();

ROLLBACK;
