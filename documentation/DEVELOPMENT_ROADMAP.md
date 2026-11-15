# Development Roadmap

This roadmap preserves the requested priority and separates planning from implementation. No phase below has been implemented by this planning deliverable.

## Phase 0: review and decisions

- Review this source analysis and approve visual/feature scope.
- Decide account method for students, privacy/retention, deployment, email provider, invite policies, and legacy-data disposition.
- Decide whether root reference files will stay in place or be relocated byte-for-byte to `reference/`.
- Record unresolved choices in architecture decisions before code setup.

**Exit:** approved plan and product/security decisions.

## Phase 1: project foundation and frontend setup

- Establish approved frontend structure, React/Vite/Tailwind/Router, lint/format configuration, environment conventions, and README.
- Implement design tokens and shared components from the visual specification.
- Add mock service interfaces and representative fixtures; do not connect Firebase or build backend integration.
- Confirm responsive shell, routes, error/empty states, accessibility baseline, and source-reference immutability.

**Exit:** clean build, route shell, documented local setup, and visual primitives ready for feature work.

## Phase 2: authentication and account interfaces

- Create shared login, student invitation registration, teacher invitation acceptance, and password recovery/verification screens as approved.
- Use mock auth state only; enforce role-specific UI navigation while clearly treating it as temporary frontend state.
- Include invalid/expired invitation and loading/error states.

**Exit:** all auth UX routes reviewed with mocked states; no claim of secure authentication until backend exists.

## Phase 3: student frontend reconstruction

- Rebuild student dashboard/profile entry and five learning stages: Appreciation Wall, Studio/coach, Pit Stop, Remix, Academic Transfer, report, revision.
- Reuse shared components; retain lesson text and task content from source.
- Keep scoring caveat visible; implement mock scoring adapter only if needed to demonstrate UX.
- Cover navigation, empty data, text limits, and responsive states.

**Exit:** complete student workflow demonstrable using fixtures/mock service.

## Phase 4: teacher frontend reconstruction

- Rebuild Live, Students, Results, Controls, wall spotlight, section workflow, CSV export experience, and QR invitation UI using mocks.
- Display award suggestions and explain rubric basis; design fewer-than-three and ties states.
- Ensure destructive action confirmation and clear section context.

**Exit:** complete teacher classroom workflow demonstrable with mock data.

## Phase 5: profile and shared components

- Complete role-appropriate profile screens and shared empty/error/loading components.
- Consolidate accessibility, responsive layout, keyboard interaction, Unicode, and visual parity review.
- Revisit duplicated legacy workflows and confirm no feature was silently dropped.

**Exit:** approved frontend prototype with feature-inventory traceability.

## Phase 6: backend architecture and database

- Initialize Express/Mongoose structure, configuration validation, request logging, error envelope, schemas/indexes, and isolated test DB strategy.
- Implement domain services and API contracts before frontend integration.
- Configure secrets, deployment, backups, CORS, security headers, rate limits, and monitoring.
- Do not connect to the legacy public Firebase database from production code.

**Exit:** backend health endpoint and tested model/service foundations; no production data until security controls are verified.

## Phase 7: authentication and authorization

- Implement selected session/password strategy, verification and recovery, role provisioning, auth middleware, policy checks, and audit events.
- Establish admin bootstrap safely.
- Test authorization matrix and object-level boundaries for each role/classroom/section.

**Exit:** negative authorization tests pass; manually entering a route or changing client state cannot grant access.

## Phase 8: email invitations and QR registration

- Implement admin teacher invite lifecycle and email delivery.
- Implement teacher classroom invite lifecycle and secure QR deep link.
- Hash tokens at rest; enforce expiry, revocation, single-use/usage policy, and atomic consumption.
- Add abuse rate limits and audit events.

**Exit:** end-to-end invitation flows pass replay, expiry, revoke, wrong-role, and ownership tests.

## Phase 9: frontend/backend integration

- Replace mock adapters with API services feature by feature.
- Add authenticated polling/live updates, server validation feedback, pagination, and persistence states.
- Integrate submissions, class controls, export, and scoped data views.
- Handle network failure and retries without silent loss.

**Exit:** role-based end-to-end workflows pass in staging; no public Firebase dependency remains in the app.

## Phase 10: testing, security review, and deployment

- Run unit, integration, frontend, end-to-end, accessibility, and responsive checks.
- Conduct threat review and security assessment against actual deployed config; verify backups, monitoring, and incident response.
- Migrate or archive legacy data only under approved retention and security plan.
- Deploy staged environment, verify headers/configuration, then production release and rollback plan.

**Exit:** documented release sign-off with test evidence, security findings disposition, and operations ownership.

## Suggested adjustment to sequencing

The requested order is workable. Resolve student identity, privacy, deployment, and authorization policy in Phase 0 before creating the authentication UI in Phase 2; otherwise UX and API contracts are likely to be redone. Keep frontend-only work in Phases 1–5 isolated behind mock adapters, then establish the backend in Phase 6 as requested.

## Traceability

Use [FEATURE_INVENTORY.md](FEATURE_INVENTORY.md) as the acceptance checklist, [VISUAL_DESIGN_SPECIFICATION.md](VISUAL_DESIGN_SPECIFICATION.md) for visual parity, and [SECURITY_AUDIT.md](SECURITY_AUDIT.md) for release security gates. Implementation phases require their own test evidence; this planning document does not claim they are complete.
