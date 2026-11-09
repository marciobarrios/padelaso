BEGIN;

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

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

-- Builds a valid command that merges p_fields over the common envelope.
CREATE FUNCTION pg_temp.command(
  p_command_id text,
  p_sequence integer,
  p_revision bigint,
  p_fields jsonb,
  p_match_id text DEFAULT '30000000-0000-0000-0000-000000000021',
  p_session_id text DEFAULT '40000000-0000-0000-0000-000000000021'
)
RETURNS jsonb
LANGUAGE sql
AS $function$
  SELECT jsonb_build_object(
    'version', 1,
    'matchId', p_match_id,
    'sessionId', p_session_id,
    'commandId', p_command_id,
    'clientId', 'watch-a',
    'sequence', p_sequence,
    'expectedRevision', p_revision,
    'createdAt', to_char((clock_timestamp() - interval '1 second') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'expiresAt', to_char((clock_timestamp() + interval '1 hour') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ) || p_fields;
$function$;

-- Runs a command once and remembers it for a byte-identical retry.
CREATE TEMP TABLE sent (name text PRIMARY KEY, command jsonb);
GRANT ALL ON sent TO authenticated;

CREATE FUNCTION pg_temp.send(p_name text, p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO pg_temp.sent VALUES (p_name, p_command);
  RETURN public.native_apply_command(p_command);
END;
$function$;

CREATE FUNCTION pg_temp.resend(p_name text)
RETURNS jsonb
LANGUAGE sql
AS $function$
  SELECT public.native_apply_command(command) FROM pg_temp.sent WHERE name = p_name;
$function$;

SELECT plan(57);

INSERT INTO auth.users (id, email)
VALUES
  ('10000000-0000-0000-0000-000000000021', 'native-scorer@example.com'),
  ('10000000-0000-0000-0000-000000000022', 'native-outsider@example.com'),
  ('10000000-0000-0000-0000-000000000023', 'native-removed@example.com');

INSERT INTO public.groups (id, name, emoji, invite_code, created_by)
VALUES (
  '20000000-0000-0000-0000-000000000021', 'Native group', 'P', 'NATIV1',
  '10000000-0000-0000-0000-000000000021'
);

INSERT INTO public.group_members (group_id, user_id, role)
VALUES
  ('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000021', 'member'),
  ('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000023', 'member');

INSERT INTO public.players (id, name, emoji, group_id)
VALUES
  ('50000000-0000-0000-0000-000000000021', 'Ana', 'A', '20000000-0000-0000-0000-000000000021'),
  ('50000000-0000-0000-0000-000000000022', 'Pablo', 'P', '20000000-0000-0000-0000-000000000021'),
  ('50000000-0000-0000-0000-000000000023', 'Sustituto', 'S', '20000000-0000-0000-0000-000000000021');

INSERT INTO public.matches (id, team1, team2, sets, created_by, group_id)
VALUES (
  '30000000-0000-0000-0000-000000000021',
  ARRAY['50000000-0000-0000-0000-000000000021']::uuid[],
  ARRAY['50000000-0000-0000-0000-000000000022']::uuid[],
  '[{"team1Score": 6, "team2Score": 4}, {"team1Score": 0, "team2Score": 0}]',
  '10000000-0000-0000-0000-000000000021',
  '20000000-0000-0000-0000-000000000021'
);

SELECT is(
  (SELECT cardinality(set_ids) FROM public.native_match_state WHERE match_id = '30000000-0000-0000-0000-000000000021'),
  2,
  'a new match gets one stable ID per existing set'
);

-- Fixed identities keep the assertions below readable.
UPDATE public.native_match_state
SET session_id = '40000000-0000-0000-0000-000000000021', set_ids = ARRAY['set-1', 'set-2']
WHERE match_id = '30000000-0000-0000-0000-000000000021';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000021';

-- ------------------------------------------------------------
-- Snapshots
-- ------------------------------------------------------------
SELECT is(
  public.native_match_snapshot('30000000-0000-0000-0000-000000000021') - 'generatedAt' - 'date' - 'events' - 'roster',
  jsonb_build_object(
    'version', 1,
    'matchId', '30000000-0000-0000-0000-000000000021',
    'sessionId', '40000000-0000-0000-0000-000000000021',
    'groupId', '20000000-0000-0000-0000-000000000021',
    'revision', 0,
    'authorizationExpiresAt', null,
    'courtNumber', null,
    'team1', jsonb_build_array('50000000-0000-0000-0000-000000000021'),
    'team2', jsonb_build_array('50000000-0000-0000-0000-000000000022'),
    'sets', '[{"id": "set-1", "team1Score": 6, "team2Score": 4}, {"id": "set-2", "team1Score": 0, "team2Score": 0}]'::jsonb,
    'activeSetId', 'set-2'
  ),
  'a member reads the canonical snapshot with stable set identity'
);

SELECT is(
  jsonb_array_length(public.native_match_snapshot('30000000-0000-0000-0000-000000000021') -> 'roster'),
  2,
  'the snapshot carries the match roster'
);

SELECT is(
  public.native_match_snapshot('not-a-uuid') ->> 'code',
  'NOT_FOUND',
  'a malformed match ID is not found'
);

-- ------------------------------------------------------------
-- Apply, replay and command ID reuse
-- ------------------------------------------------------------
SELECT is(
  (pg_temp.send('first', pg_temp.command(
    'a0000000-0000-0000-0000-000000000001', 1, 0,
    '{"kind": "score.delta", "setId": "set-2", "team": 1, "delta": 1}'
  )) - 'acknowledgedAt' - 'snapshot'),
  jsonb_build_object(
    'version', 1,
    'matchId', '30000000-0000-0000-0000-000000000021',
    'sessionId', '40000000-0000-0000-0000-000000000021',
    'commandId', 'a0000000-0000-0000-0000-000000000001',
    'status', 'applied',
    'appliedRevision', 1
  ),
  'a score command applies and acknowledges the new revision'
);

SELECT is(
  (SELECT sets FROM public.matches WHERE id = '30000000-0000-0000-0000-000000000021'),
  '[{"team1Score": 6, "team2Score": 4}, {"team1Score": 1, "team2Score": 0}]'::jsonb,
  'the score changes in the set the web reads'
);

SELECT is(
  pg_temp.resend('first') ->> 'status',
  'replayed',
  'an identical retry is a replay'
);

SELECT is(
  (pg_temp.resend('first') ->> 'appliedRevision')::integer,
  1,
  'a replay returns the original applied revision'
);

SELECT is(
  (SELECT sets FROM public.matches WHERE id = '30000000-0000-0000-0000-000000000021'),
  '[{"team1Score": 6, "team2Score": 4}, {"team1Score": 1, "team2Score": 0}]'::jsonb,
  'a replay does not score twice'
);

SELECT is(
  public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000001', 2, 1,
    '{"kind": "score.delta", "setId": "set-2", "team": 2, "delta": 1}'
  )) ->> 'code',
  'COMMAND_ID_REUSED',
  'the same ID with a different payload is rejected'
);

SELECT is(
  public.native_apply_command(pg_temp.command(
    'A0000000-0000-0000-0000-00000000000A', 2, 1,
    '{"kind": "score.delta", "setId": "set-2", "team": 2, "delta": 1}'
  )) ->> 'commandId',
  'A0000000-0000-0000-0000-00000000000A',
  'an uppercase Swift command ID is echoed as sent'
);

-- ------------------------------------------------------------
-- Stale checks
-- ------------------------------------------------------------
SELECT is(
  public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000002', 9, 0,
    '{"kind": "score.delta", "setId": "set-2", "team": 1, "delta": 1}'
  )) ->> 'code',
  'STALE_REVISION',
  'an older expected revision is rejected rather than rebased'
);

SELECT is(
  (public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000002', 9, 0,
    '{"kind": "score.delta", "setId": "set-2", "team": 1, "delta": 1}'
  )) ->> 'canonicalRevision')::integer,
  2,
  'a stale revision error reports the canonical revision'
);

SELECT is(
  public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000003', 2, 2,
    '{"kind": "score.delta", "setId": "set-2", "team": 1, "delta": 1}'
  )) ->> 'code',
  'OUT_OF_ORDER',
  'a sequence that is not newer is rejected'
);

SELECT is(
  public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000004', 3, 2,
    '{"kind": "score.delta", "setId": "set-2", "team": 1, "delta": 1}',
    '30000000-0000-0000-0000-000000000021',
    '40000000-0000-0000-0000-000000000099'
  )) ->> 'code',
  'STALE_SESSION',
  'a command for another session is rejected'
);

SELECT is(
  public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000005', 3, 2,
    '{"kind": "score.delta", "setId": "set-1", "team": 1, "delta": 1}'
  )) ->> 'code',
  'STALE_SET',
  'a score delta cannot target a set that is no longer active'
);

SELECT is(
  public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000006', 3, 2,
    '{"kind": "score.correct", "setId": "missing", "score": {"team1Score": 1, "team2Score": 1}}'
  )) ->> 'code',
  'STALE_SET',
  'a correction cannot target an unknown set'
);

SELECT is(
  public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000007', 3, 2,
    '{"kind": "set.create", "afterSetId": "set-1", "setId": "set-3"}'
  )) ->> 'code',
  'STALE_SET',
  'a new set must follow the latest set'
);

-- ------------------------------------------------------------
-- Corrections and new sets
-- ------------------------------------------------------------
SELECT is(
  (public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000008', 3, 2,
    '{"kind": "score.correct", "setId": "set-1", "score": {"team1Score": 7, "team2Score": 5}}'
  )) ->> 'appliedRevision')::integer,
  3,
  'a correction may target an earlier set'
);

SELECT is(
  (SELECT sets -> 0 FROM public.matches WHERE id = '30000000-0000-0000-0000-000000000021'),
  '{"team1Score": 7, "team2Score": 5}'::jsonb,
  'the correction replaces only that set'
);

SELECT is(
  public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000009', 4, 3,
    '{"kind": "set.create", "afterSetId": "set-2", "setId": "set-3"}'
  )) #>> '{snapshot,activeSetId}',
  'set-3',
  'a new set keeps its client-generated ID and becomes active'
);

SELECT is(
  public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000010', 5, 4,
    '{"kind": "set.create", "afterSetId": "set-3", "setId": "set-1"}'
  )) ->> 'code',
  'INVALID_REQUEST',
  'a set ID cannot be used twice in a match'
);

-- ------------------------------------------------------------
-- Events
-- ------------------------------------------------------------
SELECT is(
  (pg_temp.send('event', pg_temp.command(
    'a0000000-0000-0000-0000-000000000011', 5, 4,
    '{"kind": "event.create", "eventId": "e0000000-0000-0000-0000-000000000001", "playerId": "50000000-0000-0000-0000-000000000021", "type": "ace"}'
  )) ->> 'appliedRevision')::integer,
  5,
  'an event command applies and advances the revision'
);

SELECT is(
  pg_temp.resend('event') #>> '{snapshot,events,0,id}',
  'e0000000-0000-0000-0000-000000000001',
  'an event replay returns the event in its snapshot'
);

SELECT is(
  (SELECT count(*)::integer FROM public.match_events WHERE match_id = '30000000-0000-0000-0000-000000000021'),
  1,
  'an event replay does not create a duplicate'
);

SELECT is(
  public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000012', 6, 5,
    '{"kind": "event.create", "eventId": "e0000000-0000-0000-0000-000000000002", "playerId": "50000000-0000-0000-0000-000000000023", "type": "ace"}'
  )) ->> 'code',
  'INVALID_REQUEST',
  'an event cannot name a player outside the match'
);

SELECT is(
  public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000013', 6, 5,
    '{"kind": "event.undo", "eventId": "e0000000-0000-0000-0000-000000000099"}'
  )) ->> 'code',
  'NOT_FOUND',
  'undo targets one exact event'
);

SELECT is(
  (public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000014', 6, 5,
    '{"kind": "event.undo", "eventId": "e0000000-0000-0000-0000-000000000001"}'
  )) ->> 'appliedRevision')::integer,
  6,
  'undo applies and advances the revision'
);

SELECT is(
  (SELECT count(*)::integer FROM public.match_events WHERE match_id = '30000000-0000-0000-0000-000000000021'),
  0,
  'undo removes the event'
);

-- ------------------------------------------------------------
-- Clamped commands
-- ------------------------------------------------------------
SELECT is(
  (pg_temp.send('clamped', pg_temp.command(
    'a0000000-0000-0000-0000-000000000015', 7, 6,
    '{"kind": "score.delta", "setId": "set-3", "team": 2, "delta": -1}'
  )) ->> 'appliedRevision')::integer,
  6,
  'a decrement at zero is acknowledged at the unchanged revision'
);

SELECT is(
  public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000016', 7, 6,
    '{"kind": "score.delta", "setId": "set-3", "team": 2, "delta": -1}'
  )) ->> 'code',
  'OUT_OF_ORDER',
  'a clamped command still consumes its sequence'
);

-- ------------------------------------------------------------
-- Legacy writers advance the same revision
-- ------------------------------------------------------------
SELECT is(
  public.increment_match_score('30000000-0000-0000-0000-000000000021', 1, 1) -> 2,
  '{"team1Score": 1, "team2Score": 0}'::jsonb,
  'the legacy RPC still increments the latest set'
);

SELECT is(
  (public.native_match_snapshot('30000000-0000-0000-0000-000000000021') ->> 'revision')::integer,
  7,
  'a legacy score write advances the revision'
);

SELECT is(
  public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000017', 8, 6,
    '{"kind": "score.delta", "setId": "set-3", "team": 1, "delta": 1}'
  )) ->> 'code',
  'STALE_REVISION',
  'a command queued before a legacy write must resynchronize'
);

INSERT INTO public.match_events (match_id, player_id, type, created_by)
VALUES (
  '30000000-0000-0000-0000-000000000021',
  '50000000-0000-0000-0000-000000000022',
  'ace',
  '10000000-0000-0000-0000-000000000021'
);

SELECT is(
  (public.native_match_snapshot('30000000-0000-0000-0000-000000000021') ->> 'revision')::integer,
  8,
  'a direct event insert advances the revision'
);

SELECT public.increment_match_score('30000000-0000-0000-0000-000000000021', 1, 1, true);

SELECT is(
  public.native_match_snapshot('30000000-0000-0000-0000-000000000021') -> 'sets' -> 2 ->> 'id',
  'set-3',
  'a legacy new set keeps earlier set IDs'
);

SELECT is(
  jsonb_array_length(public.native_match_snapshot('30000000-0000-0000-0000-000000000021') -> 'sets'),
  4,
  'a legacy new set receives its own ID'
);

SELECT throws_ok(
  $$ INSERT INTO public.match_events (match_id, player_id, type, created_by, sequence)
     VALUES (
       '30000000-0000-0000-0000-000000000021',
       '50000000-0000-0000-0000-000000000022',
       'ace',
       '10000000-0000-0000-0000-000000000021',
       1
     ) $$,
  '428C9',
  NULL,
  'clients cannot choose an event sequence'
);

-- ------------------------------------------------------------
-- Shape and lifetime
-- ------------------------------------------------------------
SELECT is(
  public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000018', 20, 9,
    '{"kind": "score.delta", "setId": "x", "team": 1, "delta": 1, "extra": true}'
  )) ->> 'code',
  'INVALID_REQUEST',
  'unknown fields are rejected'
);

SELECT is(
  public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000018', 20, 9,
    '{"kind": "score.delta", "setId": "x", "team": 1, "delta": 1, "version": 2}'
  )) ->> 'code',
  'UNSUPPORTED_VERSION',
  'an unknown version fails before anything applies'
);

SELECT is(
  public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000001', 1, 0,
    '{"kind": "score.delta", "setId": "set-2", "team": 1, "delta": 1, "createdAt": "2020-01-01T00:00:00Z", "expiresAt": "2020-01-01T01:00:00Z"}'
  )) ->> 'code',
  'COMMAND_EXPIRED',
  'expiry is checked before the receipt, so it survives receipt eviction'
);

SELECT is(
  public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000019', 20, 9,
    '{"kind": "score.delta", "setId": "x", "team": 1, "delta": 1, "createdAt": "2099-01-01T00:00:00Z", "expiresAt": "2099-01-01T01:00:00Z"}'
  )) ->> 'code',
  'INVALID_REQUEST',
  'a future-dated command cannot outlive its receipt'
);

-- ------------------------------------------------------------
-- Authorization
-- ------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT * FROM public.native_command_receipts $$,
  '42501',
  NULL,
  'receipts cannot be read directly'
);

SELECT throws_ok(
  $$ UPDATE public.native_match_state SET revision = 0 $$,
  '42501',
  NULL,
  'scoring state cannot be written directly'
);

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000022';

SELECT is(
  public.native_match_snapshot('30000000-0000-0000-0000-000000000021') ->> 'code',
  'FORBIDDEN',
  'a non-member cannot read a snapshot'
);

SELECT is(
  public.native_apply_command(pg_temp.command(
    'b0000000-0000-0000-0000-000000000001', 1, 9,
    '{"kind": "score.delta", "setId": "set-3", "team": 1, "delta": 1}'
  )) ->> 'code',
  'FORBIDDEN',
  'a non-member cannot apply a command'
);

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000023';

SELECT is(
  (pg_temp.send('removed', pg_temp.command(
    'a0000000-0000-0000-0000-000000000001', 1, 9,
    '{"kind": "score.correct", "setId": "set-1", "score": {"team1Score": 7, "team2Score": 6}}'
  )) ->> 'status'),
  'applied',
  'command IDs and client sequences are scoped to the acting user'
);

RESET ROLE;
DELETE FROM public.group_members
WHERE user_id = '10000000-0000-0000-0000-000000000023';
SET LOCAL ROLE authenticated;

SELECT is(
  pg_temp.resend('removed') ->> 'code',
  'FORBIDDEN',
  'a removed member cannot replay a saved acknowledgement'
);

RESET request.jwt.claim.sub;
SET LOCAL request.jwt.claim.sub = '';

SELECT is(
  public.native_match_snapshot('30000000-0000-0000-0000-000000000021') ->> 'code',
  'AUTH_EXPIRED',
  'a request without a user must authenticate again'
);

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000021';

-- ------------------------------------------------------------
-- Session replacement
-- ------------------------------------------------------------
SELECT isnt(
  public.native_replace_scoring_session('30000000-0000-0000-0000-000000000021') ->> 'sessionId',
  '40000000-0000-0000-0000-000000000021',
  'replacing a session changes its identity'
);

SELECT is(
  public.native_apply_command(pg_temp.command(
    'a0000000-0000-0000-0000-000000000020', 30, 11,
    '{"kind": "score.delta", "setId": "set-3", "team": 1, "delta": 1}'
  )) ->> 'code',
  'STALE_SESSION',
  'a command queued for the old session cannot apply'
);

SELECT is(
  pg_temp.resend('first') ->> 'code',
  'STALE_SESSION',
  'an old acknowledgement cannot be replayed into a new session'
);

RESET ROLE;

-- ------------------------------------------------------------
-- Concurrency, over connections that commit independently
-- ------------------------------------------------------------
DO $setup$
BEGIN
  PERFORM extensions.dblink_connect('native_setup', pg_temp.local_db_connection_string());
  PERFORM extensions.dblink_exec(
    'native_setup',
    $sql$
      INSERT INTO auth.users (id, email)
      VALUES ('10000000-0000-0000-0000-000000000024', 'native-concurrent@example.com');
      INSERT INTO public.groups (id, name, emoji, invite_code)
      VALUES ('20000000-0000-0000-0000-000000000022', 'Concurrent native', 'P', 'NATIV2');
      INSERT INTO public.group_members (group_id, user_id, role)
      VALUES ('20000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000024', 'member');
      INSERT INTO public.matches (id, team1, team2, sets, group_id)
      VALUES (
        '30000000-0000-0000-0000-000000000022',
        ARRAY[]::uuid[], ARRAY[]::uuid[],
        '[{"team1Score": 0, "team2Score": 0}]',
        '20000000-0000-0000-0000-000000000022'
      );
      UPDATE public.native_match_state
      SET session_id = '40000000-0000-0000-0000-000000000022', set_ids = ARRAY['only']
      WHERE match_id = '30000000-0000-0000-0000-000000000022';
    $sql$
  );
  PERFORM extensions.dblink_connect('native_one', pg_temp.local_db_connection_string());
  PERFORM extensions.dblink_connect('native_two', pg_temp.local_db_connection_string());
  PERFORM extensions.dblink_exec(
    connection,
    $sql$
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000024';
    $sql$
  )
  FROM unnest(ARRAY['native_one', 'native_two']) AS connection;
END;
$setup$;

CREATE TEMP TABLE concurrent_results (scenario text, result jsonb);

-- Sends the commands so the first still holds its lock when the second arrives,
-- then collects both results.
CREATE FUNCTION pg_temp.race(p_scenario text, p_first jsonb, p_second jsonb)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM extensions.dblink_send_query(
    'native_one',
    format(
      $query$
        WITH applied AS MATERIALIZED (SELECT public.native_apply_command(%L::jsonb) AS result)
        SELECT applied.result FROM applied CROSS JOIN LATERAL (SELECT pg_sleep(1)) AS held
      $query$,
      p_first
    )
  );
  PERFORM pg_sleep(0.2);
  PERFORM extensions.dblink_send_query(
    'native_two',
    format('SELECT public.native_apply_command(%L::jsonb)', p_second)
  );
  INSERT INTO concurrent_results
  SELECT p_scenario, r.result
  FROM extensions.dblink_get_result('native_one') AS r(result jsonb);
  PERFORM * FROM extensions.dblink_get_result('native_one') AS r(result jsonb);
  INSERT INTO concurrent_results
  SELECT p_scenario, r.result
  FROM extensions.dblink_get_result('native_two') AS r(result jsonb);
  PERFORM * FROM extensions.dblink_get_result('native_two') AS r(result jsonb);
END;
$function$;

CREATE FUNCTION pg_temp.concurrent_command(p_id text, p_sequence integer, p_revision bigint)
RETURNS jsonb
LANGUAGE sql
AS $function$
  SELECT pg_temp.command(
    p_id, p_sequence, p_revision,
    '{"kind": "score.delta", "setId": "only", "team": 1, "delta": 1}',
    '30000000-0000-0000-0000-000000000022',
    '40000000-0000-0000-0000-000000000022'
  );
$function$;

-- One generated command sent twice, so both carry identical timestamps.
SELECT pg_temp.race('identical', identical.command, identical.command)
FROM (
  SELECT pg_temp.concurrent_command('c0000000-0000-0000-0000-000000000001', 1, 0) AS command
  OFFSET 0
) AS identical;

CREATE FUNCTION pg_temp.remote_sets()
RETURNS jsonb
LANGUAGE sql
AS $function$
  SELECT sets
  FROM extensions.dblink(
    'native_setup',
    $sql$ SELECT sets FROM public.matches WHERE id = '30000000-0000-0000-0000-000000000022' $sql$
  ) AS r(sets jsonb);
$function$;

SELECT is(
  (SELECT array_agg(result ->> 'status' ORDER BY result ->> 'status') FROM concurrent_results WHERE scenario = 'identical'),
  ARRAY['applied', 'replayed'],
  'concurrent identical retries produce one application and one replay'
);

SELECT is(
  pg_temp.remote_sets(),
  '[{"team1Score": 1, "team2Score": 0}]'::jsonb,
  'concurrent identical retries score once'
);

SELECT pg_temp.race(
  'distinct',
  pg_temp.concurrent_command('c0000000-0000-0000-0000-000000000002', 2, 1),
  pg_temp.concurrent_command('c0000000-0000-0000-0000-000000000003', 3, 1)
);

SELECT is(
  (SELECT array_agg(coalesce(result ->> 'status', result ->> 'code') ORDER BY coalesce(result ->> 'status', result ->> 'code')) FROM concurrent_results WHERE scenario = 'distinct'),
  ARRAY['STALE_REVISION', 'applied'],
  'of two commands based on one revision, exactly one applies'
);

SELECT is(
  pg_temp.remote_sets(),
  '[{"team1Score": 2, "team2Score": 0}]'::jsonb,
  'the rejected concurrent command leaves no score change'
);

-- A held match lock surfaces as a retryable state rather than a hang.
DO $lock$
BEGIN
  PERFORM extensions.dblink_exec('native_setup', 'BEGIN');
  PERFORM extensions.dblink_exec(
    'native_setup',
    $sql$ UPDATE public.matches SET court_number = 1 WHERE id = '30000000-0000-0000-0000-000000000022' $sql$
  );
END;
$lock$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000024';

SELECT is(
  (public.native_apply_command(
    pg_temp.concurrent_command('c0000000-0000-0000-0000-000000000004', 4, 2)
  ) - 'occurredAt' - 'commandId' - 'message' - 'version'),
  '{"code": "IN_FLIGHT", "retryAfterMs": 1000, "canonicalRevision": null}'::jsonb,
  'a command that cannot get the match lock reports IN_FLIGHT'
);

RESET ROLE;

DO $cleanup$
BEGIN
  PERFORM extensions.dblink_exec('native_setup', 'ROLLBACK');
  PERFORM extensions.dblink_disconnect('native_one');
  PERFORM extensions.dblink_disconnect('native_two');
  PERFORM extensions.dblink_exec(
    'native_setup',
    $sql$
      DELETE FROM public.matches WHERE id = '30000000-0000-0000-0000-000000000022';
      DELETE FROM public.groups WHERE id = '20000000-0000-0000-0000-000000000022';
      DELETE FROM auth.users WHERE id = '10000000-0000-0000-0000-000000000024';
    $sql$
  );
  PERFORM extensions.dblink_disconnect('native_setup');
END;
$cleanup$;

SELECT * FROM finish();

ROLLBACK;
