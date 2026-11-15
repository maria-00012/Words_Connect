# Security Audit: Legacy Pages

## Scope and evidence

This is a static source review of root `index.html` and `teacher.html`, plus a read-only GET of the hardcoded Firebase database path `rooms/class1.json`. The GET returned HTTP 200 with JSON data and permissive CORS. This confirms unauthenticated read access to that path at the time of review. No writes, deletes, or configuration changes were made. Database rules were not changed or independently retrieved; public write access is strongly indicated by the files' setup instructions, but the live write rule was not tested.

## Findings

### Critical: exposed classroom data and unrestricted rules are designed into setup

Both pages hardcode the same Firebase project URL. The teacher setup instructions tell the operator to publish `{ ".read": true, ".write": true }` rules (within a rules object). The live read confirmed that unauthenticated callers could retrieve class data. The database response included names, wall messages, submissions, and presence records. With the instructed public-write policy, outside callers could modify controls, impersonate names, inject records, or delete data.

**Action:** Immediately secure Firebase with authenticated server-side rules or disable public access; review exposure and audit logs, rotate/revoke any credentials if present, and decide whether to preserve or remove exposed content. Do not rely on hiding the URL or UI.

### Critical: teacher PIN is client-only, weak, and not authorization

The client hashes `wc` plus the PIN using a 32-bit rolling polynomial hash and stores the result at the public `ctl/ph` path. Verification occurs entirely in browser code. First initialization accepts any PIN of four characters, and a persisted `wc_t=1` flag opens teacher mode on the same browser. Firebase REST writes have no authenticated user context. Under permissive rules, the PIN can be bypassed and `ctl` changed directly.

**Action:** Replace with server-validated identity and per-request authorization. Remove PIN hash as an access mechanism; use secure password hashing only on the server if password auth is selected.

### High: no user identity, role, or per-class authorization

Student identity is an unverified name plus a random browser-local `wc_d` key. Teacher identity is local state. Class and session keys are not secrets. No server checks that a user belongs to a room or owns a classroom. `FORCE`, hidden sections, and route/UI visibility are all mutable client-side behavior.

**Action:** Implement authenticated users, backend-validated roles, classroom membership, and object-level authorization on every private API operation. Frontend guards are usability only.

### High: broad access to student writing and activity

Wall messages, recipients, names, academic writing, revisions, reports, scores, and activity/presence are collected. Teacher mode reads all session data; students also request shared submissions/results at Stage 5. With public reads, any visitor can read these records. No privacy, consent, retention, export controls, or individual deletion flow is disclosed.

**Action:** Decide data minimization, student/guardian notices and consent where applicable, access audience, retention and deletion rules before deployment. Limit response visibility to authorized class members and teachers.

### High: no backend validation or trusted data boundaries

Most checks run in JavaScript: name length, wall sentence count, submission open state, score, awards, stage, and role. Direct REST callers can bypass them. User-controlled values may be malformed or oversized if direct database writes are allowed. Several dynamic UI regions use `innerHTML`; most text values are escaped in reviewed result and wall renderers, but the broader trust assumption is unsafe when records can be tampered with. `L()` mutates objects by attaching keys; malformed/null records may break rendering.

**Action:** Enforce schemas, size limits, access rules, and business constraints on the backend. Render user data as text or use a framework's safe interpolation; sanitize any intentional rich text. Treat every legacy record as untrusted.

### High: section erase is destructive and section data has no lifecycle controls

The teacher erase action issues `DELETE` against the active session. New sections retain old records in the database. There is no backend confirmation, role authorization, recovery/backup, retention expiry, or per-student deletion. Under public write access, deletion is not limited to the visible button.

**Action:** Authorize destructive actions server-side, require clear confirmation, record audit events, and define retention/backup/recovery behavior.

### Medium: offline queue can misrepresent persistence

Offline writes are queued in local storage and optimistically displayed. On a non-2xx response, `flush()` shifts and discards the operation rather than surfacing a durable failure; only network/timeout status keeps the queue. No conflict resolution or queue cap exists.

**Action:** For the new app, define offline support explicitly. Show pending/failed states, retry only safe operations, constrain queue growth, and make server acknowledgement visible.

### Medium: external script supply chain and privacy

The QR feature dynamically loads `qrcode.min.js` from cdnjs without a pinned integrity attribute or local bundle. The script is requested only when QR generation is needed. CDN requests reveal network metadata to that provider.

**Action:** Prefer a pinned, reviewed package bundled at build time or set integrity/cross-origin policy if a CDN remains necessary.

### Medium: no server trust for score/report

The heuristic and resulting JSON are fully client-controlled. The report includes caveats, but teacher dashboards and awards can treat submitted score fields as if authoritative.

**Action:** Recompute versioned rubric outputs on server or label them as client-supplied formative suggestions and never use them as high-stakes grades.

### Low/maintenance: text encoding and duplicated source

Visible mojibake harms usability. Student and teacher documents duplicate nearly all markup and code, so fixes can drift. Current architecture has no CSP, module boundaries, automated tests, dependency management, or accessibility audit evidence.

**Action:** Rebuild from shared components, normalize source to UTF-8, add security headers at hosting, and introduce automated checks in later phases.

## Target controls

- Server-managed sessions or short-lived access tokens with secure storage/rotation decisions; HTTPS everywhere.
- Password hashing with a modern adaptive server-side algorithm if passwords are used; rate limits and recovery flow.
- Roles and memberships read from persisted server data, never accepted from request bodies.
- Single-use, high-entropy, expiring, hashed invitation tokens; atomic consume operations.
- Input validation and authorization at route/service layers; resource ownership checks for every classroom, section, post, and submission.
- Audit logging for invitations, membership changes, exports, stage controls, and deletion.
- CORS allowlist, security headers/CSP, request size limits, rate limiting, secret management, backups, monitoring, and dependency scanning.
- Privacy and retention policy appropriate to the student population and operating jurisdiction.

This audit is not a penetration test, full Firebase rules review, legal review, or deployment assessment. Re-run security review against the actual backend and production configuration before release.
