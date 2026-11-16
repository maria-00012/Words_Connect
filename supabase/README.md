# Supabase migration package

These migrations implement the approved Words Connect one-classroom-per-group architecture. The repository contains the SQL migration files; migrations 001–005 have been applied to `words-connect-test` per the project owner. Migration 006 is new and remains pending. No project credentials or secret keys belong in this directory.

## Order

1. `migrations/202611160001_identity_and_classrooms.sql` — Auth-linked profiles, classrooms, staff, memberships, invitations, access helpers, and invitation consumption.
2. `migrations/202611160002_activities_quizzes_and_exercises.sql` — Activity instances, unique Appreciation Wall, versioned quizzes/exercises, protected keys, formative quiz attempts, and scoring operations.
3. `migrations/202611160003_progress_and_activity_submissions.sql` — Progress, immutable submissions/revisions, provenance validation, and student submission operations.
4. `migrations/202611160004_assessment_audit_and_rankings.sql` — Automated results, official teacher grades, archived write guard, immutable grade audit, and deterministic exact-three ranking function.
5. `migrations/202611160005_rls_invites_archive_and_realtime.sql` — RLS, grants, invitation/admin/archive functions, default wall provisioning, and realtime publication.
6. `migrations/202611160006_first_admin_bootstrap.sql` — Private UUID authorization, permanent one-time claim state, and authenticated first-admin bootstrap RPC.

Follow [the first-admin bootstrap instructions](BOOTSTRAP_FIRST_ADMIN.md) to apply migration 006 and securely authorize the existing Auth UUID before using `/bootstrap-admin`.

These scripts depend on Supabase Auth roles/schema and `auth.uid()`; they are not plain PostgreSQL migrations. Do not expose private schemas or service-role/secret keys to the frontend.

## Safety, tests, and rollback

The migrations do not drop classroom application data. Migration 006 creates a private state table with no `anon` or `authenticated` grants. Its bootstrap RPC uses the authenticated session identity, and the claim and profile promotion occur in one transaction. Existing RLS policies are not modified.

The SQL regression scripts in `tests/` cover deterministic Top 3 ties, archived grade read/write behavior, and first-admin bootstrap authorization. They require disposable-database fixtures described in `tests/README.md`; they are not executed by the frontend test suite. Static checks do not establish PostgreSQL correctness. Once data exists, prefer a tested backup restore or a reviewed forward correction over dropping tables.
