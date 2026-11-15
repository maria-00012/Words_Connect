-- Manual regression assertions for archived grade read-only behavior.
-- Run with psql -v archive_teacher_id=... -v archive_classroom_id=...
-- -v archive_submission_id=... -v archive_audit_event_id=...
-- -v archive_new_mark=... -v archive_viewer_id=...; see tests/README.md for fixture contract.
\set ON_ERROR_STOP on
BEGIN;

SELECT set_config('request.jwt.claim.sub', :'archive_teacher_id', true);
SELECT set_config('wc.test.archive_classroom_id', :'archive_classroom_id', true);
SELECT set_config('wc.test.archive_submission_id', :'archive_submission_id', true);
SELECT set_config('wc.test.archive_audit_event_id', :'archive_audit_event_id', true);
SELECT set_config('wc.test.archive_new_mark', :'archive_new_mark', true);

CREATE TEMP TABLE _grade_before AS
SELECT ta.official_mark, ta.feedback, ta.status, ta.reviewed_by, ta.reviewed_at,
       (SELECT count(*) FROM public.grade_audit_events e
        WHERE e.classroom_id = ta.classroom_id AND e.submission_id = ta.submission_id) AS audit_count
FROM public.teacher_assessments ta
WHERE ta.classroom_id = :'archive_classroom_id'::uuid
  AND ta.submission_id = :'archive_submission_id'::uuid;
DO $$
BEGIN
  IF (SELECT count(*) FROM _grade_before) <> 1
     OR (SELECT status FROM _grade_before) <> 'reviewed'
     OR (SELECT official_mark FROM _grade_before) IS NULL
     OR (SELECT audit_count FROM _grade_before) < 1 THEN
    RAISE EXCEPTION 'Fixture needs a reviewed mark and audit history';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.classrooms
                 WHERE id = current_setting('wc.test.archive_classroom_id')::uuid
                   AND status = 'archived') THEN
    RAISE EXCEPTION 'Fixture classroom must already be archived';
  END IF;
  IF (SELECT official_mark FROM _grade_before)
       = current_setting('wc.test.archive_new_mark')::numeric THEN
    RAISE EXCEPTION 'archive_new_mark must differ from the existing mark';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_classroom uuid := current_setting('wc.test.archive_classroom_id')::uuid;
  v_submission uuid := current_setting('wc.test.archive_submission_id')::uuid;
  v_rejected boolean := false;
  v_status text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.teacher_assessments
                 WHERE classroom_id = v_classroom AND submission_id = v_submission) THEN
    RAISE EXCEPTION 'Teacher must retain historical assessment read access';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.grade_audit_events
                 WHERE id = current_setting('wc.test.archive_audit_event_id')::uuid) THEN
    RAISE EXCEPTION 'Teacher must retain historical grade audit read access';
  END IF;
  FOREACH v_status IN ARRAY ARRAY['reviewed', 'pending'] LOOP
    v_rejected := false;
    BEGIN
      PERFORM public.set_teacher_assessment(v_submission, 73, 'must be rejected', v_status);
    EXCEPTION WHEN SQLSTATE '55000' THEN
      v_rejected := true;
    END;
    IF NOT v_rejected THEN
      RAISE EXCEPTION 'Grade RPC accepted archived-classroom status %', v_status;
    END IF;
  END LOOP;
  BEGIN
    UPDATE public.teacher_assessments SET feedback = 'must be rejected'
      WHERE classroom_id = v_classroom AND submission_id = v_submission;
    RAISE EXCEPTION 'Direct authenticated grade update unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.teacher_assessments
      WHERE classroom_id = v_classroom AND submission_id = v_submission;
    RAISE EXCEPTION 'Direct authenticated grade deletion unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
SELECT set_config('request.jwt.claim.sub', :'archive_viewer_id', true);
DO $$
DECLARE
  v_classroom uuid := current_setting('wc.test.archive_classroom_id')::uuid;
BEGIN
  IF public.can_grade_classroom(v_classroom) THEN
    RAISE EXCEPTION 'archive_viewer_id fixture must be viewer-level staff';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.grade_audit_events
    WHERE id = current_setting('wc.test.archive_audit_event_id')::uuid
      AND classroom_id = v_classroom
  ) THEN
    RAISE EXCEPTION 'Viewer-level teacher must retain archived grade audit read access';
  END IF;
END;
$$;
RESET ROLE;

-- Verify the table trigger also blocks privileged direct mutations, and that
-- audit rows cannot be rewritten even by a database owner session.
DO $$
DECLARE
  v_classroom uuid := current_setting('wc.test.archive_classroom_id')::uuid;
  v_submission uuid := current_setting('wc.test.archive_submission_id')::uuid;
  v_rejected boolean := false;
BEGIN
  BEGIN
    UPDATE public.teacher_assessments SET feedback = 'must be rejected'
      WHERE classroom_id = v_classroom AND submission_id = v_submission;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Table trigger allowed an archived grade update'; END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO public.teacher_assessments (classroom_id, submission_id)
      VALUES (v_classroom, v_submission);
  EXCEPTION WHEN SQLSTATE '55000' THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Table trigger allowed an archived grade insert'; END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.grade_audit_events SET new_values = new_values || '{"test":true}'::jsonb
      WHERE id = current_setting('wc.test.archive_audit_event_id')::uuid;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Grade audit history was mutable'; END IF;

  v_rejected := false;
  BEGIN
    DELETE FROM public.teacher_assessments
      WHERE classroom_id = v_classroom AND submission_id = v_submission;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Teacher assessment deletion was allowed'; END IF;

  v_rejected := false;
  BEGIN
    TRUNCATE TABLE public.teacher_assessments;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Teacher assessment truncation was allowed'; END IF;

  v_rejected := false;
  BEGIN
    TRUNCATE TABLE public.grade_audit_events;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Grade audit truncation was allowed'; END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.teacher_assessments ta
    JOIN _grade_before b ON true
    WHERE ta.classroom_id = current_setting('wc.test.archive_classroom_id')::uuid
      AND ta.submission_id = current_setting('wc.test.archive_submission_id')::uuid
      AND ta.official_mark IS NOT DISTINCT FROM b.official_mark
      AND ta.feedback = b.feedback AND ta.status = b.status
      AND ta.reviewed_by IS NOT DISTINCT FROM b.reviewed_by
      AND ta.reviewed_at IS NOT DISTINCT FROM b.reviewed_at
      AND (SELECT count(*) FROM public.grade_audit_events e
           WHERE e.classroom_id = ta.classroom_id AND e.submission_id = ta.submission_id) = b.audit_count
  ) THEN RAISE EXCEPTION 'Archived mark, feedback, or audit history changed'; END IF;
END;
$$;

-- Reopening the same classroom restores the normal grading RPC. A new audit
-- event is appended; the existing audit event and grade history remain intact.
SELECT set_config('request.jwt.claim.sub', :'archive_teacher_id', true);
SET LOCAL ROLE authenticated;
SELECT public.reopen_classroom(:'archive_classroom_id'::uuid);
SELECT (public.set_teacher_assessment(
  :'archive_submission_id'::uuid,
  :'archive_new_mark'::numeric,
  'reopened classroom regression test',
  'reviewed'
)).official_mark;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.classrooms
    WHERE id = current_setting('wc.test.archive_classroom_id')::uuid AND status = 'open'
  ) THEN RAISE EXCEPTION 'Reopening did not restore the classroom'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.teacher_assessments
    WHERE submission_id = current_setting('wc.test.archive_submission_id')::uuid
      AND official_mark = current_setting('wc.test.archive_new_mark')::numeric
      AND status = 'reviewed'
  ) THEN RAISE EXCEPTION 'Grading RPC failed after reopening'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.grade_audit_events
    WHERE id = current_setting('wc.test.archive_audit_event_id')::uuid
  ) THEN RAISE EXCEPTION 'Reopening or grading lost existing audit history'; END IF;
  IF (SELECT count(*) FROM public.grade_audit_events
      WHERE classroom_id = current_setting('wc.test.archive_classroom_id')::uuid
        AND submission_id = current_setting('wc.test.archive_submission_id')::uuid)
       <> (SELECT audit_count + 1 FROM _grade_before) THEN
    RAISE EXCEPTION 'Successful post-reopen grading should append exactly one audit event';
  END IF;
END;
$$;

ROLLBACK;
