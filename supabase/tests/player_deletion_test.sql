BEGIN;

SELECT plan(22);

INSERT INTO auth.users (id, email)
VALUES
  ('10000000-0000-0000-0000-000000000011', 'player-creator@example.com'),
  ('10000000-0000-0000-0000-000000000012', 'group-member@example.com');

INSERT INTO public.groups (id, name, emoji, invite_code, created_by)
VALUES (
  '20000000-0000-0000-0000-000000000011',
  'Deletion test group',
  'P',
  'DEL001',
  '10000000-0000-0000-0000-000000000011'
);

INSERT INTO public.group_members (group_id, user_id, role)
VALUES
  (
    '20000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000011',
    'admin'
  ),
  (
    '20000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000012',
    'member'
  );

INSERT INTO public.players (id, name, emoji, created_by, group_id)
VALUES
  (
    '30000000-0000-0000-0000-000000000011',
    'Target player',
    'T',
    '10000000-0000-0000-0000-000000000011',
    '20000000-0000-0000-0000-000000000011'
  ),
  (
    '30000000-0000-0000-0000-000000000012',
    'Partner',
    'P',
    '10000000-0000-0000-0000-000000000012',
    '20000000-0000-0000-0000-000000000011'
  ),
  (
    '30000000-0000-0000-0000-000000000013',
    'Opponent one',
    '1',
    '10000000-0000-0000-0000-000000000012',
    '20000000-0000-0000-0000-000000000011'
  ),
  (
    '30000000-0000-0000-0000-000000000014',
    'Opponent two',
    '2',
    '10000000-0000-0000-0000-000000000012',
    '20000000-0000-0000-0000-000000000011'
  );

INSERT INTO public.matches (id, team1, team2, sets, created_by, group_id)
VALUES (
  '40000000-0000-0000-0000-000000000011',
  ARRAY[
    '30000000-0000-0000-0000-000000000011',
    '30000000-0000-0000-0000-000000000012'
  ]::uuid[],
  ARRAY[
    '30000000-0000-0000-0000-000000000013',
    '30000000-0000-0000-0000-000000000014'
  ]::uuid[],
  '[{"team1Score": 6, "team2Score": 4}]'::jsonb,
  '10000000-0000-0000-0000-000000000012',
  '20000000-0000-0000-0000-000000000011'
);

INSERT INTO public.match_events (id, match_id, player_id, type, created_by)
VALUES
  (
    '50000000-0000-0000-0000-000000000011',
    '40000000-0000-0000-0000-000000000011',
    '30000000-0000-0000-0000-000000000011',
    'ace',
    '10000000-0000-0000-0000-000000000011'
  ),
  (
    '50000000-0000-0000-0000-000000000012',
    '40000000-0000-0000-0000-000000000011',
    '30000000-0000-0000-0000-000000000012',
    'magic',
    '10000000-0000-0000-0000-000000000012'
  );

INSERT INTO public.match_votes (
  id,
  match_id,
  voter_player_id,
  voted_for_player_id,
  vote_type
)
VALUES
  (
    '60000000-0000-0000-0000-000000000011',
    '40000000-0000-0000-0000-000000000011',
    '30000000-0000-0000-0000-000000000011',
    '30000000-0000-0000-0000-000000000013',
    'mvp'
  ),
  (
    '60000000-0000-0000-0000-000000000012',
    '40000000-0000-0000-0000-000000000011',
    '30000000-0000-0000-0000-000000000012',
    '30000000-0000-0000-0000-000000000011',
    'mvp'
  ),
  (
    '60000000-0000-0000-0000-000000000013',
    '40000000-0000-0000-0000-000000000011',
    '30000000-0000-0000-0000-000000000012',
    '30000000-0000-0000-0000-000000000013',
    'jugada_del_partido'
  );

CREATE FUNCTION pg_temp.block_test_player_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.id = '30000000-0000-0000-0000-000000000011'::uuid THEN
    RAISE EXCEPTION 'forced player delete failure' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER block_test_player_delete
BEFORE DELETE ON public.players
FOR EACH ROW
EXECUTE FUNCTION pg_temp.block_test_player_delete();

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.players', 'DELETE'),
  'authenticated callers cannot bypass the atomic deletion function'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'players'
      AND cmd = 'DELETE'
  ),
  0,
  'players has no direct DELETE policy'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.delete_player_atomic(uuid)',
    'EXECUTE'
  ),
  'authenticated callers can execute delete_player_atomic'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.delete_player_atomic(uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot execute delete_player_atomic'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000012';

SELECT throws_ok(
  $$
    SELECT public.delete_player_atomic(
      '30000000-0000-0000-0000-000000000011'
    )
  $$,
  '42501',
  'Player deletion is not allowed',
  'a group member who did not create the player is rejected'
);

SELECT is(
  (SELECT count(*) FROM public.players WHERE id = '30000000-0000-0000-0000-000000000011'),
  1::bigint,
  'an unauthorized attempt leaves the player intact'
);

SELECT is(
  (SELECT team1 FROM public.matches WHERE id = '40000000-0000-0000-0000-000000000011'),
  ARRAY[
    '30000000-0000-0000-0000-000000000011',
    '30000000-0000-0000-0000-000000000012'
  ]::uuid[],
  'an unauthorized attempt leaves match history intact'
);

SELECT is(
  (SELECT count(*) FROM public.match_events WHERE player_id = '30000000-0000-0000-0000-000000000011'),
  1::bigint,
  'an unauthorized attempt leaves events intact'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.match_votes
    WHERE voter_player_id = '30000000-0000-0000-0000-000000000011'
       OR voted_for_player_id = '30000000-0000-0000-0000-000000000011'
  ),
  2::bigint,
  'an unauthorized attempt leaves votes intact'
);

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000011';

SELECT throws_ok(
  $$
    SELECT public.delete_player_atomic(
      '30000000-0000-0000-0000-000000000011'
    )
  $$,
  'P0001',
  'forced player delete failure',
  'a deletion failure is returned to the caller'
);

SELECT is(
  (SELECT count(*) FROM public.players WHERE id = '30000000-0000-0000-0000-000000000011'),
  1::bigint,
  'a failed transaction leaves the player intact'
);

SELECT is(
  (SELECT team1 FROM public.matches WHERE id = '40000000-0000-0000-0000-000000000011'),
  ARRAY[
    '30000000-0000-0000-0000-000000000011',
    '30000000-0000-0000-0000-000000000012'
  ]::uuid[],
  'a failed transaction rolls back match cleanup'
);

SELECT is(
  (SELECT count(*) FROM public.match_events WHERE player_id = '30000000-0000-0000-0000-000000000011'),
  1::bigint,
  'a failed transaction leaves events intact'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.match_votes
    WHERE voter_player_id = '30000000-0000-0000-0000-000000000011'
       OR voted_for_player_id = '30000000-0000-0000-0000-000000000011'
  ),
  2::bigint,
  'a failed transaction leaves votes intact'
);

RESET ROLE;
DROP TRIGGER block_test_player_delete ON public.players;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000011';

SELECT results_eq(
  $$
    SELECT
      outcome ->> 'player_id',
      (outcome ->> 'updated_matches')::integer
    FROM (
      SELECT public.delete_player_atomic(
        '30000000-0000-0000-0000-000000000011'
      ) AS outcome
    ) AS deletion
  $$,
  $$ VALUES ('30000000-0000-0000-0000-000000000011'::text, 1::integer) $$,
  'an authorized deletion returns its explicit outcome'
);

SELECT is(
  (SELECT count(*) FROM public.players WHERE id = '30000000-0000-0000-0000-000000000011'),
  0::bigint,
  'an authorized deletion removes the player'
);

SELECT is(
  (SELECT team1 FROM public.matches WHERE id = '40000000-0000-0000-0000-000000000011'),
  ARRAY['30000000-0000-0000-0000-000000000012']::uuid[],
  'an authorized deletion removes the player from match history'
);

SELECT is(
  (SELECT team2 FROM public.matches WHERE id = '40000000-0000-0000-0000-000000000011'),
  ARRAY[
    '30000000-0000-0000-0000-000000000013',
    '30000000-0000-0000-0000-000000000014'
  ]::uuid[],
  'match participants unrelated to the deletion are unchanged'
);

SELECT is(
  (SELECT count(*) FROM public.match_events WHERE player_id = '30000000-0000-0000-0000-000000000011'),
  0::bigint,
  'the deleted player events are removed by cascade'
);

SELECT is(
  (SELECT count(*) FROM public.match_events WHERE id = '50000000-0000-0000-0000-000000000012'),
  1::bigint,
  'unrelated match events are preserved'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.match_votes
    WHERE voter_player_id = '30000000-0000-0000-0000-000000000011'
       OR voted_for_player_id = '30000000-0000-0000-0000-000000000011'
  ),
  0::bigint,
  'votes related to the deleted player are removed by cascade'
);

SELECT is(
  (SELECT count(*) FROM public.match_votes WHERE id = '60000000-0000-0000-0000-000000000013'),
  1::bigint,
  'unrelated match votes are preserved'
);

SELECT * FROM finish();
ROLLBACK;
