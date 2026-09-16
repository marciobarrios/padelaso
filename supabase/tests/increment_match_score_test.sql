BEGIN;

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

SELECT plan(7);

INSERT INTO auth.users (id, email)
VALUES
  ('10000000-0000-0000-0000-000000000011', 'scorer@example.com'),
  ('10000000-0000-0000-0000-000000000012', 'score-outsider@example.com');

INSERT INTO public.groups (id, name, emoji, invite_code, created_by)
VALUES (
  '20000000-0000-0000-0000-000000000011',
  'Score group',
  'P',
  'SCORE1',
  '10000000-0000-0000-0000-000000000011'
);

INSERT INTO public.group_members (group_id, user_id, role)
VALUES (
  '20000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000011',
  'member'
);

INSERT INTO public.matches (id, team1, team2, sets, created_by, group_id)
VALUES (
  '30000000-0000-0000-0000-000000000011',
  ARRAY[]::uuid[],
  ARRAY[]::uuid[],
  '[{"team1Score": 6, "team2Score": 4}, {"team1Score": 0, "team2Score": 0}]',
  '10000000-0000-0000-0000-000000000011',
  '20000000-0000-0000-0000-000000000011'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000011';

SELECT is(
  public.increment_match_score(
    '30000000-0000-0000-0000-000000000011',
    2,
    2
  ),
  '[{"team1Score": 6, "team2Score": 4}, {"team1Score": 0, "team2Score": 2}]'::jsonb,
  'a group member increments only the latest set'
);

SELECT is(
  public.increment_match_score(
    '30000000-0000-0000-0000-000000000011',
    1,
    1,
    true
  ),
  '[{"team1Score": 6, "team2Score": 4}, {"team1Score": 0, "team2Score": 2}, {"team1Score": 1, "team2Score": 0}]'::jsonb,
  'starting a set appends it before applying the score'
);

SELECT is(
  public.increment_match_score(
    '30000000-0000-0000-0000-000000000011',
    2,
    -1
  ),
  '[{"team1Score": 6, "team2Score": 4}, {"team1Score": 0, "team2Score": 2}, {"team1Score": 1, "team2Score": 0}]'::jsonb,
  'a decrement cannot take a score below zero'
);

SELECT throws_ok(
  $$
    SELECT public.increment_match_score(
      '30000000-0000-0000-0000-000000000011',
      3,
      1
    )
  $$,
  '22023',
  'team must be 1 or 2',
  'an invalid team is rejected'
);

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000012';

SELECT throws_ok(
  $$
    SELECT public.increment_match_score(
      '30000000-0000-0000-0000-000000000011',
      1,
      1
    )
  $$,
  'P0002',
  'match 30000000-0000-0000-0000-000000000011 not found',
  'a non-member cannot update a group score'
);

RESET ROLE;

DO $setup$
BEGIN
  PERFORM extensions.dblink_connect(
    'score_setup',
    'dbname=' || current_database()
  );
  PERFORM extensions.dblink_exec(
    'score_setup',
    $sql$
      INSERT INTO public.groups (id, name, emoji, invite_code)
      VALUES (
        '20000000-0000-0000-0000-000000000012',
        'Concurrent score group',
        'P',
        'SCORE2'
      );
      INSERT INTO public.matches (id, team1, team2, sets, group_id)
      VALUES (
        '30000000-0000-0000-0000-000000000012',
        ARRAY[]::uuid[],
        ARRAY[]::uuid[],
        '[{"team1Score": 0, "team2Score": 0}]',
        '20000000-0000-0000-0000-000000000012'
      );
    $sql$
  );
  PERFORM extensions.dblink_disconnect('score_setup');
  PERFORM extensions.dblink_connect(
    'score_one',
    'dbname=' || current_database()
  );
  PERFORM extensions.dblink_connect(
    'score_two',
    'dbname=' || current_database()
  );
END;
$setup$;

SELECT ok(
  extensions.dblink_send_query(
    'score_one',
    $query$
      WITH updated AS MATERIALIZED (
        SELECT public.increment_match_score(
          '30000000-0000-0000-0000-000000000012',
          1,
          1
        ) AS sets
      )
      SELECT updated.sets
      FROM updated
      CROSS JOIN LATERAL (
        SELECT pg_sleep(jsonb_array_length(updated.sets) * 0 + 1)
      ) AS delay
    $query$
  ) = 1,
  'the first score update starts asynchronously'
);

DO $concurrent$
BEGIN
  PERFORM extensions.dblink_send_query(
    'score_two',
    $query$
      SELECT public.increment_match_score(
        '30000000-0000-0000-0000-000000000012',
        1,
        1
      )
    $query$
  );

  PERFORM *
  FROM extensions.dblink_get_result('score_one') AS result(sets jsonb);
  PERFORM *
  FROM extensions.dblink_get_result('score_one') AS result(sets jsonb);
  PERFORM *
  FROM extensions.dblink_get_result('score_two') AS result(sets jsonb);
  PERFORM *
  FROM extensions.dblink_get_result('score_two') AS result(sets jsonb);
END;
$concurrent$;

SELECT is(
  (
    SELECT sets
    FROM extensions.dblink(
      'dbname=' || current_database(),
      $query$
        SELECT sets
        FROM public.matches
        WHERE id = '30000000-0000-0000-0000-000000000012'
      $query$
    ) AS result(sets jsonb)
  ),
  '[{"team1Score": 2, "team2Score": 0}]'::jsonb,
  'concurrent score increments are both preserved'
);

DO $cleanup$
BEGIN
  PERFORM extensions.dblink_disconnect('score_one');
  PERFORM extensions.dblink_disconnect('score_two');
  PERFORM extensions.dblink_connect(
    'score_cleanup',
    'dbname=' || current_database()
  );
  PERFORM extensions.dblink_exec(
    'score_cleanup',
    $sql$
      DELETE FROM public.matches
      WHERE id = '30000000-0000-0000-0000-000000000012';
      DELETE FROM public.groups
      WHERE id = '20000000-0000-0000-0000-000000000012';
    $sql$
  );
  PERFORM extensions.dblink_disconnect('score_cleanup');
END;
$cleanup$;

SELECT * FROM finish();
ROLLBACK;
