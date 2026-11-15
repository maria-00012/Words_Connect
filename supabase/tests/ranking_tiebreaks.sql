-- Manual regression assertions for deterministic Top 3 ranking.
-- Run with psql -v variables documented below; see tests/README.md for fixtures.
-- Required variables: ranking_teacher_id, ranking_student_id,
-- ranking_tie_classroom_id, ranking_expected_1..ranking_expected_7,
-- ranking_fewer_classroom_id, ranking_pending_only_student_id,
-- ranking_fewer_expected_1, ranking_fewer_expected_2,
-- ranking_no_reviewed_classroom_id.
\set ON_ERROR_STOP on
BEGIN;

SELECT set_config('request.jwt.claim.sub', :'ranking_teacher_id', true);
CREATE TEMP TABLE _ranking_all AS
  SELECT * FROM public.get_classroom_rankings(:'ranking_tie_classroom_id'::uuid);
CREATE TEMP TABLE _ranking_expected (rank_position bigint PRIMARY KEY, student_id uuid UNIQUE);
INSERT INTO _ranking_expected VALUES
  (1, :'ranking_expected_1'::uuid),
  (2, :'ranking_expected_2'::uuid),
  (3, :'ranking_expected_3'::uuid),
  (4, :'ranking_expected_4'::uuid),
  (5, :'ranking_expected_5'::uuid),
  (6, :'ranking_expected_6'::uuid),
  (7, :'ranking_expected_7'::uuid);

DO $$
BEGIN
  IF (SELECT count(*) FROM _ranking_all) <> 7 THEN
    RAISE EXCEPTION 'Expected seven eligible fixture students, got %',
      (SELECT count(*) FROM _ranking_all);
  END IF;
  IF EXISTS (
    SELECT 1 FROM _ranking_expected e
    LEFT JOIN _ranking_all r USING (rank_position, student_id)
    WHERE r.student_id IS NULL
  ) THEN
    RAISE EXCEPTION 'The exact average/count/Academic Transfer/timestamp/UUID order was not respected';
  END IF;
END;
$$;

-- Student-facing call: exactly three awardees despite the official-average tie.
SELECT set_config('request.jwt.claim.sub', :'ranking_student_id', true);
SELECT set_config('wc.test.ranking_tie_classroom_id', :'ranking_tie_classroom_id', true);
GRANT SELECT ON _ranking_expected TO authenticated;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.get_classroom_rankings(
      current_setting('wc.test.ranking_tie_classroom_id')::uuid)) <> 3 THEN
    RAISE EXCEPTION 'Student Top 3 must contain exactly three rows';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _ranking_expected e
    WHERE e.rank_position <= 3 AND NOT EXISTS (
      SELECT 1 FROM public.get_classroom_rankings(
        current_setting('wc.test.ranking_tie_classroom_id')::uuid) r
      WHERE r.rank_position = e.rank_position AND r.student_id = e.student_id
    )
  ) THEN
    RAISE EXCEPTION 'Student Top 3 differs from the deterministic winners';
  END IF;
END;
$$;
RESET ROLE;

-- Fewer than three reviewed students: include both, excluding the pending-only student.
SELECT set_config('request.jwt.claim.sub', :'ranking_teacher_id', true);
SELECT set_config('wc.test.pending_only_student_id', :'ranking_pending_only_student_id', true);
CREATE TEMP TABLE _ranking_fewer AS
  SELECT * FROM public.get_classroom_rankings(:'ranking_fewer_classroom_id'::uuid);
CREATE TEMP TABLE _ranking_fewer_expected (student_id uuid PRIMARY KEY);
INSERT INTO _ranking_fewer_expected VALUES
  (:'ranking_fewer_expected_1'::uuid),
  (:'ranking_fewer_expected_2'::uuid);
DO $$
BEGIN
  IF (SELECT count(*) FROM _ranking_fewer) <> 2 THEN
    RAISE EXCEPTION 'Expected both eligible students when fewer than three qualify';
  END IF;
  IF EXISTS (SELECT 1 FROM _ranking_fewer
             WHERE student_id = current_setting('wc.test.pending_only_student_id', true)::uuid) THEN
    RAISE EXCEPTION 'A pending-only student must not appear in rankings';
  END IF;
  IF EXISTS (SELECT student_id FROM _ranking_fewer_expected
             EXCEPT SELECT student_id FROM _ranking_fewer)
     OR EXISTS (SELECT student_id FROM _ranking_fewer
                EXCEPT SELECT student_id FROM _ranking_fewer_expected) THEN
    RAISE EXCEPTION 'The fewer-than-three case did not return exactly all eligible students';
  END IF;
END;
$$;

CREATE TEMP TABLE _ranking_none AS
  SELECT * FROM public.get_classroom_rankings(:'ranking_no_reviewed_classroom_id'::uuid);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _ranking_none) THEN
    RAISE EXCEPTION 'Students without reviewed eligible assessments must be excluded';
  END IF;
END;
$$;

ROLLBACK;
