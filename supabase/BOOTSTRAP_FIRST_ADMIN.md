# First administrator bootstrap

The bootstrap provisions one pre-authorized Supabase Auth account as the first Words Connect administrator. It does not accept a role or account ID from the browser, does not use a service-role key, and does not change the existing RLS policies. The UUID authorization is configured by the project owner in SQL Editor; the application only sends the signed-in account's session to the RPC.

## Apply the migration

For `words-connect-test`, migrations 001–005 were already applied. Apply `migrations/202611160006_first_admin_bootstrap.sql` once using the Supabase Dashboard SQL Editor (or your normal migration pipeline). Do not run it against a different project by mistake. It creates the private `wc_private.first_admin_bootstrap` state and the `public.bootstrap_first_admin()` RPC.

If an administrator profile already exists at migration time, migration 006 marks bootstrap as claimed and does not open a new claim.

## Prepare your Auth account

1. In the Supabase Dashboard, open **Authentication → Users → Add user**. Choose the dashboard option to create a user, enter your own email and a password, and confirm your email if the dialog offers that option. If your dashboard only offers **Send invitation**, send it to your own address and complete the email confirmation/link flow before continuing. Supabase documents dashboard invitations under Authentication → Users → Add user. [Supabase Auth user management](https://supabase.com/docs/guides/auth/users)
2. Ensure the account's email is confirmed. The bootstrap RPC requires `auth.users.email_confirmed_at` to be set; the confirmed timestamp is visible on the Auth user. [Supabase Auth user attributes](https://supabase.com/docs/guides/auth/users)
3. In **Table Editor → profiles**, verify that the Auth user's UUID has a profile row. The existing Auth trigger normally creates it with `role = 'student'` and `status = 'pending'`. The bootstrap accepts a matching student profile in `pending` or `active` status; it rejects suspended, teacher, or admin profiles.
4. Copy the Auth user's UUID from **Authentication → Users**. Do not use an email address or user metadata as the authorization value.

## Authorize that UUID

In **SQL Editor**, replace the placeholder with the copied UUID and run this statement:

```sql
update wc_private.first_admin_bootstrap b
set authorized_user_id = 'YOUR-AUTH-USER-UUID'::uuid
where b.singleton = true
  and b.authorized_user_id is null
  and b.claimed_at is null
  and not exists (
    select 1 from public.profiles p where p.role = 'admin'
  )
returning b.authorized_user_id;
```

It should return exactly your UUID. If it returns no row, stop and inspect the state instead of editing the profile. The database trigger also checks that the UUID has an eligible profile and that no administrator exists. Before bootstrap is claimed, a project owner can correct an incorrectly entered UUID through SQL Editor; authenticated clients cannot read or change this private record.

If you entered the wrong UUID before any successful claim, replace it from SQL Editor with:

```sql
update wc_private.first_admin_bootstrap b
set authorized_user_id = 'CORRECT-AUTH-USER-UUID'::uuid
where b.singleton = true
  and b.claimed_at is null
  and not exists (
    select 1 from public.profiles p where p.role = 'admin'
  )
returning b.authorized_user_id;
```

This owner-only correction is unavailable after the bootstrap is claimed.

## Complete bootstrap and sign in

1. Start the frontend and open `http://localhost:5173/bootstrap-admin`.
2. Enter the email and password for the same Auth account whose UUID you authorized, then choose **Provision administrator**.
3. On success, the app redirects to `/admin`. The profile should now have `role = 'admin'` and `status = 'active'`.
4. Sign out, then verify ordinary sign-in at `http://localhost:5173/login` with that same email and password.

The Auth account must have a confirmed email. No role selector is used. The RPC compares the authenticated JWT's `auth.uid()` to the private authorized UUID and performs the profile change and permanent claim atomically.

## Retry behavior and verification

If the browser closes or a response is lost before the transaction commits, sign in again at `/bootstrap-admin` with the same account and retry. If the transaction committed but the response was lost, the same account's retry returns its existing active administrator ID without changing or duplicating the claim. Any other UUID is rejected. The claimed state cannot be cleared or replaced through the RPC, frontend table access, or ordinary authenticated database grants.

As project owner, you can inspect the private state in SQL Editor:

```sql
select authorized_user_id, claimed_by, claimed_at
from wc_private.first_admin_bootstrap
where singleton = true;
```

After success, `claimed_by` and `claimed_at` must be populated and remain unchanged. Never add `wc_private` to the frontend's exposed schemas or grant its table to `anon` or `authenticated`.

The SQL regression script `tests/first_admin_bootstrap.sql` covers unauthorized callers, private-table denial, first provisioning, idempotent retry, and refusal when an administrator already exists. It must be run as the database owner against a disposable database with the fixture UUIDs described at the top of the script. It rolls back test changes.

## Scope note

This provisions the first administrator only. The current admin/teacher invitation UI remains mock-based; connecting invitation creation to the database is a separate integration step.
