# SQL regression tests

These are manual `psql` regression scripts for a **disposable Supabase database** after migrations 001–005 have been applied. They are not migrations and have not been executed. Run with an authorized test connection and the required `-v name=uuid` variables shown at each script's top. The scripts open a transaction and roll back their changes.

## Ranking fixture contract

`ranking_tiebreaks.sql` expects:

- One revealed classroom with seven eligible students and the listed deterministic ordering.
- Expected order: `ranking_expected_1` through `_7`. Student 1 has a strictly higher official average. Students 2–7 tie on official average; student 2 wins the reviewed-instance-count tie-break. Students 3–7 tie on count; student 3 wins the Academic Transfer average tie-break. Students 4–6 then tie on official and Academic Transfer averages plus reviewed-instance count; student 4 wins by having the earlier timestamp for their latest qualifying reviewed submission. Students 5 and 6 tie through timestamp; UUID ascending orders them. Student 7 has no reviewed Academic Transfer mark and sorts after students with numeric Academic Transfer averages.
- `ranking_student_id` is an active member of that classroom and awards are revealed. The student query must return exactly expected students 1–3.
- A second classroom has exactly two students with reviewed eligible marks and a third student with only pending work. The teacher query must return only the two eligible students.
- A third classroom has at least one student with pending-only work and no reviewed eligible marks. The query must return no students.
- `ranking_teacher_id` is an active owner or authorized staff member in all three classrooms.

The fixtures should use multiple Remix/Academic Transfer instances as needed to create different reviewed-instance counts and Academic Transfer averages. Each activity's selected mark must obey the approved latest-reviewed-version/attempt rule.

## Archived-grade fixture contract

`archived_grade_access.sql` expects an already archived classroom, an active owner/manager teacher, an active viewer-level teacher in that same classroom, and a submission with an existing reviewed mark plus at least one grade audit event. `archive_new_mark` must be a valid 0–100 value different from the stored mark. The script verifies historical reads by both teacher levels, RPC rejection for reviewed and pending states, direct-write rejection, preserved mark/feedback/audit rows, audit immutability, and successful grading after reopening. It rolls back the reopen and grading changes.

These scripts validate behavior only when actually run in a disposable Supabase environment. Static inspection of the scripts or migrations is not proof of PostgreSQL correctness.
