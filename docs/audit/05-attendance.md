# Area 05 — Attendance & Time

Routes: `/attendance`, `/my/attendance`, `/schedule`, `/overtime`, `/my/time-off`.
The most real-time area in the product and the one where a defect costs money directly:
everything here ends up on a timesheet.

Status: **All six passes run. All 3 findings fixed**, 2 open questions raised.
1 High-adjacent Medium, 2 Medium.

---

## A. What this feature is (from the code)

**In one paragraph:** a member clocks in against a space, which must be one they are
assigned to, within its geofence, with acceptable GPS accuracy — or remotely, which is
geofence-exempt and captures a coarse place instead. That opens a `TimeEntry` stamped with
the shift resolved from the rota, in the *entry's* timezone. While clocked in, a heartbeat
drives a geofence-excursion state machine (it never auto-clocks-out), breaks can be
started and ended, and a work log of notes and photos can be attached. As the shift end
approaches, a reminder engine nudges, escalates, opens no-show flags, and lets the worker
**request extra time** which a leader approves in minutes. Managers can correct entries,
back-date them in bulk, and approve or reject them; every correction is attributed and
kept in an entry history.

### Server surface — 45 endpoints

| Guard | What |
|---|---|
| `@Roles(ADMIN, EMPLOYEE)` | clock in/out, heartbeat, breaks, worklog, own history, excursion report |
| `@RequirePermission('canViewAllTasks')` | all-entries, active, no-shows, reports, approvals list, breaks overview |
| `@RequirePermission('canManageUsers')` | approve/reject, edit entry, delete entry, **manual/back-dated entries**, bulk approve, end others' breaks, excursion decisions |
| `@Roles(ADMIN, EMPLOYEE)` + service check | **extra-time approve/reject** — space role `canApproveOvertime` |

---

## Findings

| ID | Sev | Pass | Title | Status |
|----|-----|------|-------|--------|
| AT-B1 | M | B | A leader could approve their **own** paid overtime — and the list offered it | **fixed** |
| AT-D1 | M | D | The whole no-show / shift-reminder stream was invisible on the web | **fixed** |
| AT-C1 | M | C | Four tabs and two dialogs (~3,000 lines) loaded eagerly | **fixed** |

### AT-B1 — self-approved paid time

Extra time is granted in minutes by a leader and extends `expectedClockOutAt`; the whole
request/approve flow exists so a **second party** sanctions the hours. `userCanApproveOvertime`
(`attendance.service.ts:898`) answers "may you approve *in this space*?" and says nothing
about *whose* shift it is.

So a shift leader holding `canApproveOvertime` who works shifts at the same site could
approve their own extra time. And this was not an API-only gap — `listPendingExtraTime`
(`:867`) filtered by space but **not** by caller, so their own row appeared in the approval
list with an approve button on it. One click, paid.

**Fixed** with `assertNotSelfOvertimeDecision` on both approve and reject, plus
`userId: { not: caller }` on the pending list. A true org **ADMIN** stays exempt,
deliberately: they are the owner, nobody is above them, and in a one-person organization
blocking it would make the shift impossible to extend at all. Everyone with *delegated*
authority — a space role grant, or `canManageUsers` — now needs someone else.

> Every other approval in this module already required `canManageUsers`; extra-time was the
> one that delegated to a space role, and it was the one that forgot the subject.

### AT-D1 — six events emitted, nothing on the web listening

A systematic comparison of every socket event the notification-service emits against every
literal listener in web and mobile found **7 dead events**, 6 of them here — the entire
shift-reminder / no-show / overtime notification stream:

| Event | Web consumer before | Now |
|---|---|---|
| `attendance_noshow_reminder` | none | invalidates `["attendance-no-shows"]` |
| `attendance_noshow_escalation` | none | invalidates `["attendance-no-shows"]` |
| `attendance_shift_reminder` | none | invalidates the attendance keys |
| `attendance_shift_escalation` | none | invalidates the attendance keys |
| `attendance_overtime_request` | none | **left alone — see below** |
| `attendance_overtime_decision` | none | **left alone — see below** |

These are push-first on mobile, which is why nobody noticed: the push works, and on the web
there is no push, so the socket emit was the *only* signal — and no page listened. An admin
watching `/attendance` saw a no-show flag appear only on the next manual reload.

**The two overtime events were deliberately NOT wired.** There is no extra-time query key
anywhere in the web app — the approval surface is mobile-only. Inventing an invalidation for
a query that does not exist would reproduce exactly the phantom-key bug this audit's Pass D
was written to catch (`attendance-today`). They are recorded as an open question instead.

### AT-C1 — four tabs to show one

`/attendance/page.tsx` had zero `dynamic()` and six static imports: four tabs (tracking 622,
breaks 390, approvals, no-shows), the day-off dialog, and the 412-line manual-entry dialog
borrowed from the members area. All lazy now.

---

## Verified good (checked, no finding)

- **Identity cannot be forged on a clock.** The gateway spreads the DTO *first* and then
  overwrites `userId` and `organizationId` from the token, so a `userId` in the body is
  discarded rather than honoured.
- **Clock-in is thoroughly gated**: the space assignment must exist *and* be in effect
  (`effectiveFrom <= now`, `effectiveTo` open or future — a future-dated assignment cannot
  clock in early), no double clock-in, the space must be active and in the caller's org, GPS
  accuracy is thresholded, and the geofence uses haversine with the reported accuracy as an
  allowance. Outside the ring is recorded as `OUTSIDE_GEOFENCE_IN` rather than silently
  accepted.
- **Manual and back-dated entries carry `editorId`**, and there is an entry-history endpoint
  behind `canViewAllTasks`. Back-dating is attributable.
- **Extra-time minutes are bounded** 1–1440, and the grant extends from the later of the
  expected end or now, so an already-ended shift cannot be extended into the past.
- **The heartbeat never auto-clocks-out** — the old silent 150m auto clock-out is gone,
  replaced by an excursion state machine with an explicit approval path.
- **i18n**: 273 distinct keys across 16 files, **0 missing** in de/es/fr/it.

## Open questions

- **`attendance_overtime_request` / `attendance_overtime_decision` have no consumer on any
  client.** Mobile uses push; the web has no extra-time surface at all. Either the web
  approval UI is missing, or these two socket emits are dead code that reads like a delivery
  guarantee. A product call, and the answer decides which.
- **`customer.reminder`** is the seventh dead event found by the same sweep. It belongs to
  Area 06 (CRM) and is recorded here only because this is where the sweep ran.
- GPS is client-supplied and unverifiable — inherent to phone-based attendance. The product
  flags rather than trusts, which is the right posture; worth stating that it is a posture
  and not a guarantee.

## Verdict

**PASS WITH FIXES** — the finding that matters is small in code and direct in consequence:
one person could turn their own hours into approved hours.
