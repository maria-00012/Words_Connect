# Proposed Architecture

> **Backend decision update (2026-11-16):** The earlier Express/MongoDB backend recommendation in this planning document is superseded. The approved backend direction is Supabase Auth and PostgreSQL with Row Level Security. The complete, current database architecture and ordered SQL migration package are documented in [SUPABASE_DATABASE_ARCHITECTURE.md](SUPABASE_DATABASE_ARCHITECTURE.md). Frontend organization and visual-application guidance below remains relevant; do not use the MongoDB-specific backend sections as the implementation plan.

## Recommendation

The preferred React/Vite/Tailwind/React Router and Node/Express/Mongoose stack is suitable for this project and its team direction. Keep the browser as presentation and interaction layer; place identity, invitations, classroom ownership, validation, scoring policy, and data authorization in the Express API. MongoDB is a reasonable fit for a modest classroom product with clear document ownership, provided schemas, indexes, backups, and access patterns are designed deliberately.

Necessary adjustments to the proposed stack are operational rather than a replacement: choose a maintained Node LTS version; pin dependencies; add API schema validation (for example Zod/Joi/express-validator), centralized error handling, security middleware, structured logging, tests, environment validation, and deployment/backup decisions. Do not put MongoDB credentials, email keys, or database URLs in Vite client variables.

## Frontend design

- One React application with public auth pages and role-scoped student, teacher, and admin layouts.
- React Router route groups, with an auth/session provider and role-aware navigation as a UX layer. API remains the security boundary.
- Shared visual components for legacy tokens and patterns; distinct student and teacher page compositions.
- Feature modules: `auth`, `student`, `teacher`, `admin`, `classrooms`, and `profile`; services isolate HTTP/API calls; schemas and utilities contain presentation-safe validation and formatting.
- Use mock fixtures/local feature state for the initial frontend-only milestone. Keep mock adapters behind service interfaces so backend integration does not require rewriting pages.
- Prefer an established query/cache layer only if app needs justify it; otherwise typed service hooks/context are sufficient. No state library is mandated yet.

## Backend layers

Express routes should remain thin and call controllers/services. Middleware handles request IDs, authentication, role checks, validation, rate limits, and error conversion. Services own use cases and transaction boundaries; Mongoose models define constraints and indexes. Central configuration validates environment variables at startup. Never trust a client-sent `role`, `ownerId`, score, or membership claim.

Suggested API namespaces (versioned):

- `/api/v1/auth`: login, logout, current user, password reset/verification as selected.
- `/api/v1/invitations`: admin teacher invite/create/revoke; teacher-issued classroom invitation create/revoke.
- `/api/v1/classrooms`: teacher-owned classroom CRUD, memberships, sections, stage and controls.
- `/api/v1/student`: current student's dashboard/progress and eligible classroom content.
- `/api/v1/wall`: list/create/moderate classroom posts, spotlight feed.
- `/api/v1/activities`: lesson progress and practice attempts.
- `/api/v1/submissions`: create/update/revision; teacher-authorized class listing and review.
- `/api/v1/admin`: user/teacher management, invitation status, audit and platform health operations.
- `/api/v1/profile`: safe profile read/update.

Use request/response schemas and a consistent error envelope. Paginate potentially growing lists. Consider server-sent events or WebSockets for live presence/activity only after polling requirements and scale are understood. A first backend can use bounded polling with authenticated endpoints and timestamps, then evolve.

## Roles and authorization

Roles: `admin`, `teacher`, `student`. Persist role on user and validate it on the server. Define capabilities centrally. Teachers have explicit classroom ownership or membership; students have explicit classroom membership. Every classroom-scoped operation checks that relationship, and every submission operation checks student ownership or teacher membership in its classroom. Admin operations require admin role and should be auditable. Avoid a user-supplied role field in registration. Bootstrap the first admin through a controlled deployment/CLI process or manually provisioned one-time setup, not public self-registration.

## Authentication

Recommended baseline: verified email/password for teachers/admins, adaptive password hash (Argon2id or bcrypt with appropriate cost), generic login errors, rate limiting, email verification, reset flow, and secure HttpOnly/Secure/SameSite cookie sessions or a carefully designed short-lived token plus rotating refresh mechanism. Choose one after deployment topology and cross-origin requirements are known; cookie sessions are a good default for a same-site web app. Add CSRF protection when cookie-based state-changing requests are used. Student credential model requires a product/privacy decision: verified email account, teacher-issued username/password, or another age-appropriate method. Do not expose student registration through an open form.

## Invitations

### Teacher invite

1. An authenticated admin submits teacher email and optional name.
2. Backend validates role authority, normalizes email, applies rate limits, and creates a cryptographically random token. Persist only a hash, invitee email, intended role, creator, expiry, and status.
3. Send a single-use link by email through a selected transactional provider. The token is short-lived and not stored in logs.
4. Invitee validates token, sets credentials, verifies email according to policy, and consumes invitation atomically. Backend creates/activates teacher role; invite cannot be replayed.
5. Admin can revoke/resend and inspect status. Audit each action.

### Student classroom QR invite

1. An authorized teacher creates a classroom invitation for a specific classroom, with expiry and optional maximum uses or roster constraints.
2. Backend stores a hash of a high-entropy token, scope, expiry, use limit, and revocation status. QR contains an HTTPS frontend URL with opaque token only; no database URL, role, or classroom secret in query parameters.
3. Student scans, sees classroom context, authenticates or creates an account under the student policy, and submits a registration request.
4. Server validates token, expiry, classroom state, and use policy, then atomically consumes/records membership. A token may be reusable within a short event window only if explicitly designed; default is single-use per student with controlled capacity.
5. Teacher can revoke/rotate the invitation. Avoid showing private roster data to unauthenticated visitors.

## Initial MongoDB model sketch

- `User`: normalized unique email where applicable, password hash, verified/disabled state, role, profile fields, timestamps.
- `Classroom`: owner teacher, title/code/metadata, active state, settings; never use a guessable code as authorization.
- `Membership`: user, classroom, role/scope, status, joinedAt; unique compound `{classroomId,userId}`.
- `Invitation`: hashed token, type, target email/classroom, createdBy, expiresAt, consumedAt/revokedAt, use counters; TTL may clean expired records but must not replace validation.
- `Section`: classroom, label, active stage, open/closed controls, active status, timestamps.
- `WallPost`: classroom/section, author user, optional recipient, content, moderation/deletion state, timestamps.
- `Progress` or `ActivityAttempt`: user, classroom/section, activity key/version, answer/attempt data, completion, timestamps.
- `Submission`: user, section, source/task version, remix and academic text, revision history, rubric version/result, status, timestamps.
- `AuditEvent`: actor, action, resource type/id, safe metadata, timestamp; avoid secret/token or unnecessary student text in logs.

Use references for ownership and shared objects; embed only bounded values that are always read/updated together. Add indexes for login email, classroom membership, section chronology, submission per student/section/task, and invitation token hash/expiry. Decide unique submission semantics and revision history before implementing.

## Real-time behavior

Legacy uses four-second polling and 30-second presence refresh. Preserve the teacher's live teaching workflow, but initially use authenticated polling with server timestamps, appropriate intervals, visibility-aware requests, and pagination. Later consider SSE/WebSockets for presence and stage changes. Server is authoritative for active section/stage and writes. Do not accept client timestamps as authoritative presence or score evidence.

## Testing and quality strategy

- Unit tests for validators, invitation token lifecycle, scoring/versioning, and authorization policies.
- API integration tests using isolated database fixtures for role and classroom boundary cases, replay/expiry, validation, and destructive actions.
- Frontend component/route tests for student flows, teacher controls, loading/error/empty states, and accessibility.
- End-to-end tests for invite → registration → classroom join → lesson → submission → teacher review.
- Security checks: authorization matrix, rate limits, CSRF/session behavior, security headers, dependency audit, secret scan, and manual abuse cases.
- Test legacy parity against the feature inventory and visual specification. Do not call the frontend complete until flows and responsive states have been exercised.

## Proposed folder structure

This is a recommendation for approval, not a change made in this planning pass. It retains the requested separation and adds clear feature/service and shared backend boundaries:

```text
Words-Connect/
├── reference/                     # immutable legacy snapshots, if/when relocated
│   ├── index.html
│   └── teacher.html
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── app/                   # router, providers, app shell
│   │   ├── assets/
│   │   ├── components/            # shared design-system components
│   │   ├── features/
│   │   │   ├── auth/ profile/ student/ teacher/ admin/ classrooms/
│   │   ├── layouts/
│   │   ├── pages/                 # route composition, not business logic
│   │   ├── services/              # API client and mock adapters
│   │   ├── hooks/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── config/ middleware/ models/ routes/ controllers/ services/ validators/ utils/
│   │   ├── app.js
│   │   └── server.js
│   └── package.json
├── documentation/
├── .gitignore
└── README.md
```

The legacy files currently remain at the project root. Moving them to `reference/` should be a separately reviewed organization change that preserves the originals byte-for-byte.
