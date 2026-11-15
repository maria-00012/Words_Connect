# Data Structure Analysis

## Legacy backend and root path

The inline client sets:

- Firebase base: `https://paraphrasing-ae8c2-default-rtdb.firebaseio.com`
- Room: `class1`
- Database REST root: `/rooms/{room}.json`
- Shared control node: `/rooms/{room}/ctl`
- Session data: `/rooms/{room}/s/{sessionId}/...`

`api()` sends JSON REST requests with `XMLHttpRequest`. `GET`, `PUT`, and `DELETE` are used; no Firebase SDK, identity token, or server API is present. Session defaults to `s0`; `ctl.session` selects the active session. Since the default DB value is always truthy, saved DB configuration is overwritten and database/class fields are hidden in teacher login. A URL fragment only selects a custom DB if the hardcoded default has been removed.

## Legacy object map

```text
rooms/{room}/
  ctl/
    ph: string                 # weak hash of teacher PIN
    session: string            # active session key
    label: string              # visible class section label
    stage: number               # 0..4
    wallOpen: boolean
    subOpen: boolean
    reveal: boolean
  s/{sessionId}/
    msgs/{deviceKey}_{time}/
      n: string                 # author display name
      to: string                # optional recipient display name
      x: string                 # wall text
      t: number                 # client timestamp
      d: string                 # author device key
    subs/{deviceKey}/
      n: string                 # student display name
      from: string              # assigned message author
      src: string               # assigned message text
      p: string                 # Message Remix answer
      a: string                 # Academic Transfer answer
      rep: object               # score, m, nw, re, cp, iss
      t: number                 # client timestamp
      rev: string               # optional revision
      rr: object                # optional revision report
    who/{deviceKey}/
      n: string                 # display name
      st: number                # stage (0..4)
      pt: number                # Pit Stop score (0..3)
      sb: number                # has submitted flag
      sc: number                # score, or -1 when absent
      t: number                 # server timestamp placeholder converted client-side
```

Firebase collections are maps keyed by client-generated identifiers; there are no declared schemas, foreign keys, unique account constraints, or backend validations. `deviceKey` is random local storage (`wc_d`) and is not an identity credential. Message and submission keys can be forged.

## Data relationships and lifecycle

- One `room` holds shared teacher controls and a map of sessions.
- `ctl.session` points at the active session; each student presence, wall post, and submission is stored under that session.
- A teacher section change generates `s` plus a timestamp-derived identifier, clears local displayed maps, updates control fields, and retains the old session under `s/{oldId}`.
- Erase deletes `/s/{currentSession}`; old sessions are not deleted by section change. There is no retention policy, archive index, or per-user erasure workflow.
- Presence is refreshed every 30 seconds, with online defined as timestamp age under 80 seconds. Student polling retrieves only selected collections based on stage; teacher polling retrieves all three session maps.
- Assignments select an existing wall post from another device based on the student's device hash; otherwise use a hardcoded sample. The assignment is saved locally, not as a separate backend relation.
- Submission has one value per device key. Resubmission overwrites it. Revision updates that same object.

## Local storage and offline queue

The `LS` wrapper reads/writes `localStorage`, with an in-memory fallback if storage is unavailable. Relevant keys:

- `wc_d`: random device key.
- `wc_cfg`: DB and room configuration (overridden by default DB logic).
- `wc_T`: cached control and session data.
- `wc_o`: queued outgoing REST operations.
- `wc_me`: student name, session, stage, quiz answers, assignment, submission, and revision.
- `wc_t`: teacher-mode flag.

`put()` applies mutations optimistically to local `T`, appends network writes to `wc_o` when Firebase is configured, then flushes sequentially. A status-0 network/timeout error leaves the first queued operation for retry. Non-2xx errors are treated as completed and removed from the queue, so a rejected write may be lost. Polling runs every four seconds and when the page becomes visible. There is no transactional consistency, conflict resolution, queue size limit, schema version, or durable identity association. Some content exists in both local state and Firebase.

## Score object

`assess()` returns:

- `score`: rounded composite score (nominal 0–100).
- `m`: count of four keyword families matched.
- `nw`: percent of non-stop content tokens not matching source stems.
- `re`: heuristic structure-change flag (0/1).
- `cp`: copying/similarity flag (0/1).
- `iss`: comma-separated feedback keys (`swap`, `lost`, `changed`, `structure`).

The source sentence is fixed in code. The scoring formula combines idea-keyword count, overlap, structure flag, token length, punctuation, and caps. It is not suitable as a validated grade or a server-trusted result. A future system should retain the submitted text and versioned rubric result separately, and make clear whether scores are formative suggestions.

## Proposed MongoDB domain model (direction only)

The detailed design is in [PROPOSED_ARCHITECTURE.md](PROPOSED_ARCHITECTURE.md). Recommended collections are `users`, `classrooms`, `memberships`, `invitations`, `sections`, `wallPosts`, `activities`/`progress`, and `submissions`. Ownership should be explicit: classroom references teacher owner; membership links a user and classroom; section references classroom; all class artifacts reference section and author. Unique and compound indexes should enforce intended uniqueness. A response should not trust client-supplied role, user ID, score, classroom ownership, or section ID without server verification.

## Migration note

No migration is included in the first frontend stage. Before any legacy import, secure the Firebase project, preserve a controlled backup, define lawful retention and minimization, map anonymous device IDs to accounts only where justified, validate each record, and reconcile duplicate or forged names. Treat all legacy fields as untrusted user input.
