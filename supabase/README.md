# Supabase migration package

These migrations implement the approved Words Connect one-classroom-per-group architecture. They are **drafts and have not been applied**. The repository has no Supabase project configuration. No credentials or project identifiers belong in this directory.

## Order

1. `202611160001_identity_and_classrooms.sql` — Auth-linked profiles, classrooms, staff, memberships, invitations, access helpers, invitation consumption.
2. `202611160002_activities_quizzes_and_exercises.sql` — Activity instances, unique Appreciation Wall, versioned quizzes/exercises, protected keys, formative quiz attempts and scoring operations.
3. `202611160003_progress_and_activity_submissions.sql` — Progress, immutable submissions/revisions, provenance validation, student submission operations.
4. `202611160004_assessment_audit_and_rankings.sql` — Automated results, official teacher grades, archived write guard, immutable grade audit, deterministic exact-three ranking function.
5. `202611160005_rls_invites_archive_and_realtime.sql` — RLS, grants, invitation/admin/archive functions, default wall provisioning, realtime publication.

Review [the architecture document](../documentation/SUPABASE_DATABASE_ARCHITECTURE.md) before applying. These depend on Supabase Auth roles/schema and `auth.uid()`; they are not plain PostgreSQL migrations.

## Safety and rollback

The scripts do not drop existing application data. They create schema objects and security rules but are not idempotent re-runs; apply through Supabase migration tooling exactly once and in order after review. No migration has been executed or tested against a database. For a pre-data deployment, rollback can be prepared as a reviewed reverse migration. Once data exists, prefer a tested backup restore or forward corrective migration over dropping tables; deleting classroom history is intentionally restricted.

The SQL regression scripts in `tests/` cover deterministic Top 3 ties and archived grade read/write behavior. They require disposable-database fixtures described in `tests/README.md`; neither tests nor migrations have been run. Static checks do not establish PostgreSQL correctness.

Before a real project is connected, test these scripts and RLS in a disposable Supabase project, verify the configured database owner can create triggers/publication entries, and run the authorization matrix in the architecture document.
