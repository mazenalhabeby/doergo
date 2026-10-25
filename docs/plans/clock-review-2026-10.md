# Clock review — fixes and changes (2026-10-25)

Review mockup (rules, roles, findings, screens, Arabic narration): https://claude.ai/artifact/2eJeeA3FCmdMs6ZN3XN4pK
(`docs/design/clock-review/`). Findings A1–A10, B1–B10, C1–C10, D1 there.
Branch `feat/clock-review-a7-a10` (from the deployed `4c8635a0b`). **Nothing deployed, no OTA, no push** until the
user says so.

## Rules that bind every phase

1. **The past is not touched.** No migration rewrites a row. A new rule that changes a label or a count applies to
   entries created after it (`labelRules` gate where a label is involved), exactly as in
   `docs/plans/clock-attendance-2026-10.md`.
2. **One rule, one place (DRY).** A rule shared by web, phone and server lives in `packages/shared`; a server rule
   reused by several services lives in one service and is asked, never copied. No second copy of a recipient list,
   a permission test or a duration format.
3. **SOLID.** New behaviour goes in a small unit with one job (a resolver, a formatter, a guard helper) that the
   existing services call; services are not grown into god-objects. Files stay under the size ratchet.
4. **Security.** Gates are never loosened. Every new read is narrowed by workspace scope; refusals stay 404 where a
   403 would reveal existence. Socket rooms carry only what the member may already read through the API.
5. **Performance.** No per-row queries in sweeps (one query per organization/space, cached per run); no extra query
   on list reads; pushes resolved once per space per sweep.
6. **Durations** always hours + minutes. **No "paid"/"unpaid"** in any text. Five languages for every new string.
7. Tests for every rule (unit), the e2e script over real HTTP against the LOCAL stack, and the web + iOS simulator
   driven as a user. `pnpm size:check` and `pnpm structure:check` stay green.

## Phase 0 — decisions taken by the user (DONE)

| | Change |
|---|---|
| **A7** | `User.clockOff` (migration `20261025090000_member_clock_off`, additive, false for all). Only an ADMIN may switch their own clock (`PATCH /users/me {usesClock}`); refused while clocked in (`CLOCK_SWITCH_WHILE_CLOCKED_IN`) or for a non-admin (`CLOCK_SWITCH_ADMIN_ONLY`). `hasAccessModule('clock')` answers no → no tab/button/widget, gateway refuses clock-in. Session carries it on all three builders. The rota materializer skips them; their future PENDING shift instances are dropped (past kept). Web: Settings › Clock in. |
| **A10** | Time outside the shift is decided by who holds **approve hours AND approve overtime** (`OUTSIDE_SHIFT_DECIDE_KEYS`): gateway guard `canApproveAttendance` + `scopeForAll`, task-service keeps its overtime check, the inbox kind's `decideKey` is `canApproveAttendance`, "waiting for" names holders of both. A team leader keeps the live extra-time answer. |
| **D1** | Approved — Phase 5. |

## Phase 1 — security (A1)

Clock events (`attendance.clockIn/clockOut`, `break.*`, `shift_reminder`, `attendance_left_early` with the reason,
`geofence_alert` with the distance, `noshow_reminder`) are emitted to `org:{id}`, which every staff socket joins —
external members included. Change: emit to the **person** plus **attendance rooms** joined only by sockets whose
session may read those hours: `attendance:{orgId}` (org-wide viewers: admin, org flag) and
`attendance:{orgId}:{spaceId}` (per workspace granting `canViewSpaceAttendance`). One helper decides the rooms on
join (from the session's resolved access, already computed at sign-in), one helper builds the emit target. The web
listens exactly as before. Test: an external observer's socket and a plain employee's receive none of them.

## Phase 2 — alerts reach the person who can decide (A2–A6, A8, A9)

- **A2/A3/A4** One resolver for "who acts on this person's attendance today": the inbox's own deciders for kind
  `hours` (`approval-route` "who else can decide": workspace roles with approve/correct hours, org-wide holders
  through the bridges, stand-ins in, people on leave out, never the subject). Used by still-clocked-in, left early,
  no-show escalations and "day needs review" (∪ watchers). Nobody → admins by push (not a socket room). Cached per
  space per sweep.
- **A5** Push category `attendance_team` (escalations, left early, geofence alert, pending approval, no-show
  escalation) separate from the member's own `attendance`; a new switch "My team's clock" in both apps.
- **A6** Push budget day = the member's own day (`memberDayZone`), not UTC.
- **A8** Deciding time outside the shift is part of time counting for everyone: `RequirePlan('shift_scheduling')`
  removed from that decision (the list never had it). Asking for MORE time stays the Option's: hidden on web/phone
  without it, and the automatic clock's "Still working" no longer files a request without it.
- **A9** The worker is pushed for every outside-shift decision (counted, part, not counted, before the start).

## Phase 3 — counting rules (B1–B10), each with a test

- **B1** One open extra-time round per entry (a second ask returns the open one, idempotent for offline replays);
  rejecting marks those minutes decided (`outsideDecidedAt`), so the inbox does not ask again; "outside" is claimed
  and the overtime written in one transaction (or the claim undone on failure).
- **B2** A no-shift session (no planned end, or a daily-limit marker) never gets "Ask for more time" (server refuses
  `EXTRA_TIME_NO_SHIFT`, both apps hide it) and the clock-out never files an overtime request against a marker.
- **B3** The phone's old "no hours left" block is removed everywhere (card, tiles, strings); dead `NO_HOURS_LEFT`.
- **B4** Offline clock-in at a SHIFT_ONLY workspace is flagged `UNSCHEDULED_DAY`, not `PAST_DAILY_LIMIT`.
- **B5** An automatic member's daily-limit session closes only with evidence they left (the presence rule).
- **B6** Clock-out position judged only at ≤100 m accuracy (else "not judged"); policy `NONE` never flags outside.
- **B7** A required rest shorter than planned (beyond tolerance) → `MISSED_BREAK` (new entries).
- **B8** "I forgot to clock out" appends to notes.
- **B9** Approve/reject only closed entries (`ENTRY_STILL_OPEN`); an office close by edit runs `closeEntry`.
- **B10** Remote-bucket clock-in marks the rota instance present and applies the accuracy + no-shift rules; an
  unanswered extra-time request reminds the deciders after N minutes (the escalation sweep).

## Phase 4 — screens (C1–C10)

- **C1** Codes for every refusal (accuracy, not assigned, not clocked in, already on a rest, remote not permitted,
  entry already decided) + five-language sentences in both apps (one catalogue in shared).
- **C2** Location asked only where the chosen place checks it (no coordinates, Remote → no fix needed).
- **C3** Web "Hours worked" + history = counted time (clocked shown second).
- **C4** Web buttons read the server's key (member page add/away override, Add attendance, Reopen, days-off column,
  schedule cells per led workspace).
- **C5** Approval minutes pre-filled with what was asked; asked/worked shown; times in the workspace zone.
- **C6** One prompt per step on the phone's Time tab; one word per thing.
- **C7** Early-leave target from the planned end for every worker; the approver named (server `askedOf`).
- **C8** Hours + minutes everywhere (`formatDuration` localized).
- **C9** In-app Undo for an automatic clock-in (10 min); arrival card for every member with a site.
- **C10** Dead screens/strings removed; web shows "my time waiting for a decision".

## Phase 5 — D1 simpler setup

Workspace "How do people work here?" — Fixed shifts / Flexible hours / In the field (presets writing the existing
columns) + "Change details". Per worker per workspace "Works here as" (same / another type + own daily hours),
away Yes/No, auto clock; "Own rules" tag. Additive columns on `SpaceAssignment` (null = same as workspace); the
no-shift rule reads assignment → workspace.

## Phase 6 — proof

`tools/clock-review-e2e.py` (LOCAL, real HTTP, every phase's rules incl. attacks), web driven as Anna/John/an
external supervisor, iOS simulator with Maestro, all existing e2e scripts re-run (time-counting, outside-shift,
auto-clock, approvals, no-shows, external access).
