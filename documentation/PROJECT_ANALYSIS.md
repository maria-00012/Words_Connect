# Words Connect: Project Analysis

## Purpose and scope

This document records a source-based investigation of the two legacy pages and a plan for their reconstruction. It is planning documentation only. No application code, dependencies, backend, or project structure have been created as part of this investigation.

The current workspace has `index.html` and `teacher.html` at its root. The proposed brief refers to `reference/index.html` and `reference/teacher.html`, but that directory does not currently exist. Treat the existing root files as read-only source references until the team explicitly decides how to organize them.

## Source files examined

- `index.html` (42,393 bytes): `FORCE='student'` and title `WORDS CONNECT`.
- `teacher.html` (42,404 bytes): `FORCE='teacher'` and title `WORDS CONNECT · Teacher`.

They are nearly identical copies of one HTML document. Their meaningful source differences are the page title and `FORCE` value. Both contain the student and teacher markup and all application logic. No separate source assets or backend files are present in the workspace.

## Product summary

Words Connect is a single-page classroom activity for teaching paraphrasing. It combines a five-stage student journey with a teacher dashboard. It uses embedded HTML, CSS, and JavaScript, browser `localStorage`, and Firebase Realtime Database REST calls. Its display and content are generated locally; the “coach” is prepared pattern-matched text, and the writing score is a browser-side heuristic.

The educational flow to preserve is: appreciation and peer audience, direct instruction, guided recognition practice, two paraphrasing tasks, feedback, and revision. Teacher orchestration, live status, classroom controls, awards, spotlight, and CSV export are also part of the legacy experience. See [FEATURE_INVENTORY.md](FEATURE_INVENTORY.md) for a detailed inventory.

## Major findings

1. The legacy pages combine rendering, state, business rules, transport, and teacher controls in one inline script. They are useful behavior references but should not become the new architecture.
2. The default Firebase project URL is compiled into both files. The client directly reads and writes database paths through REST.
3. During this investigation, a read-only request to the embedded Firebase path for `rooms/class1.json` returned HTTP 200 and class records without authentication. The response included student names and writing. This confirms that data at that path was publicly readable at the time of inspection. The files also instruct users to publish rules with unrestricted `.read` and `.write`; the intended production security posture must not reproduce that setup.
4. Teacher “authentication” is a client-side comparison against a weak 32-bit rolling hash stored as `ctl.ph`. It is not server authorization. A local `wc_t` flag can keep teacher mode open on that browser.
5. The source text contains mojibake in visible symbols and punctuation in the current workspace (for example, UTF-8 characters rendered as `â†’`). The reconstruction should restore intended Unicode from the meaning and context, then use UTF-8 consistently.
6. The assessment result is explicitly described as a rule-based guide, not a grade. Preserve this caveat and teacher judgment; do not present the heuristic as validated automated assessment.
7. No backend, package manifests, tests, or docs exist yet. The brief’s staged plan should begin only after review of this analysis.

## Preserve in the reconstruction

- Visual identity: dark teal, pale lime, mint, and warm off-white; rounded cards; compact chips; responsive mobile-first layout.
- Student learning outcomes and lesson sequence, examples, and three-question Pit Stop.
- Student peer appreciation, class wall, two-step Stage 4 tasks, reports, and revision loop.
- Teacher live overview, student progress, results, stage control, wall/submission toggles, awards reveal, spotlight, class sections, CSV, and join QR.
- The explicit labels that coach content is prepared and scoring is indicative.

Preserve the workflows while replacing anonymous names and device identity with the account, classroom, membership, and invitation concepts in the product vision. Do not preserve public database access, client-side authorization, or hardcoded production configuration.

## Recommended decisions before implementation

- Approve a server-authoritative authentication and authorization design, including token/session strategy and admin bootstrap process.
- Decide the deployment target, domains, email provider, and MongoDB hosting/backup expectations.
- Confirm student privacy, age range, consent/retention requirements, data deletion process, and whether student emails are collected. These decisions affect account and invitation design.
- Decide whether the current Firebase data is to be migrated, archived, or deleted after its access rules are secured. Migration is not assumed in this plan.
- Decide whether “teacher invite by email” requires email verification and expiry duration, and whether a student may join with a display name or must have an email/account credential.
- Decide what the three awards mean when fewer than three eligible submissions exist and how ties are handled.

## Cross-references

- [FEATURE_INVENTORY.md](FEATURE_INVENTORY.md): interactions and flows.
- [DATA_STRUCTURE_ANALYSIS.md](DATA_STRUCTURE_ANALYSIS.md): Firebase paths, objects, state and offline behavior.
- [VISUAL_DESIGN_SPECIFICATION.md](VISUAL_DESIGN_SPECIFICATION.md): visual tokens and responsive rules.
- [SECURITY_AUDIT.md](SECURITY_AUDIT.md): evidence, risks and remediation direction.
- [PROPOSED_ARCHITECTURE.md](PROPOSED_ARCHITECTURE.md): recommended target design and proposed tree.
- [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md): staged delivery.

## Evidence and assumptions

Findings about existing behavior come from inspection of the inline markup and JavaScript in the two root HTML files. The live database read is a point-in-time observation, not a guarantee of current Firebase configuration. Proposed architecture is a recommendation based on the project brief, not existing functionality. Further privacy, deployment, and migration decisions require owner confirmation.
