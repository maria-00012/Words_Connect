# Words Connect frontend

React + Vite classroom frontend. Supabase Auth and the `profiles` table provide account authentication and role/status lookup. Classroom activities, student progress, submissions, grades, dashboard user lists, and invitation creation remain browser-local mock data in this phase.

## Configure Supabase

Copy `.env.example` to `.env.local` in this directory and set:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
```

These are public frontend values; never place a Supabase service-role or secret key in a `VITE_` variable. Restart Vite after changing environment variables. Configure the Supabase Auth URL allow-list to include the local app URL (for example `http://localhost:5173/**`) and your deployed frontend URLs.

Auth registration requires a valid invitation whose token hash is present in `public.invitations`. The invitation is consumed through the database RPC after authentication; the database assigns the role. The current mock teacher/admin invitation management does not create database invitations, and mock QR links will not work with Supabase Auth.

The one-time first-administrator flow is documented in [`../supabase/BOOTSTRAP_FIRST_ADMIN.md`](../supabase/BOOTSTRAP_FIRST_ADMIN.md). After applying migration 006 and authorizing your Auth UUID in SQL Editor, use `/bootstrap-admin`; ordinary login and all other account role checks remain unchanged.

## Run locally

```sh
npm install
npm run dev
```

If environment variables are not configured, the app still opens but Supabase login and registration report that configuration is missing. There is no demo-password authentication fallback.

## Verification

```sh
npm run build
npm run test:e2e
```

Playwright tests use a local mocked Supabase endpoint and do not connect to the project.
