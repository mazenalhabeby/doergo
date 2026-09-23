# Findings — measured in the repo

All verified against the source, not the doc. Four of them are worth landing
on their own, before any widget work.

---

## 1. ⚠️ The denominator collapses into the numerator

§3.6 asks the card to render **"6 of 9"**. The 9 comes from
`apps/mobile/src/components/home/admin-dashboard.tsx`, built from location
assignments — and then this:

```ts
// A viewer with attendance but no roster (possible: the grants are
// separate) still gets a truthful bar from the people actually on the clock.
if (rostered.size === 0) for (const id of clockedInUserIds) rostered.add(id);
```

With no roster in scope, `rostered` becomes the set of people already clocked
in. **"6 of 9" becomes "6 of 6", the bar is permanently full, and nobody is
ever missing.**

The comment calls it truthful, and it is — **as a list**. As a **ratio** it is
not, and §3.6 asks for a ratio.

This is not a rare configuration. `canViewSpaceAttendance` and the roster grant
are separate permissions, so it is every supervisor who was given attendance
and not sites.

**Fix.** When `rostered.size === 0`, drop the `/n` entirely: render `6` and
`on the clock right now`. A number with no denominator is honest. A
denominator that is a copy of the numerator is not.

---

## 2. ⚠️ `getActiveEntries` is unbounded

`apps/api/task-service/src/modules/attendance/attendance.service.ts`:

```ts
const entries = await this.prisma.timeEntry.findMany({
  ...
  orderBy: { clockInAt: 'desc' },
});   // no take
```

The gateway route is documented "Who is clocked in right now (**org-wide**,
date-independent)". At twelve workspaces that is ~148 `TimeEntry` rows pulled
**on every home render**, to draw one number.

The pattern already exists in the same codebase, twice:

- §3.7 asks `/attendance/approvals/pending?page=1&limit=1` and reads the total
  off the envelope;
- `listNoShows` in the *same service file* bounds itself with `take: 200` and
  clamps `days` to 1–60.

`active-entries` never got it.

**Fix before this widget ships to anyone with more than one site.** What the
card needs is a count per workspace plus rows only for the people the rail is
going to draw.

---

## 3. ⚠️ Two cases where a shift-progress ring would lie

`packages/shared/src/types/attendance.ts`, on `TimeEntry`:

```ts
// Shift expectation (space-centric attendance). Set at clock-in for
// shift/fixed spaces; drives the reminder engine. null on task/none spaces.
expectedClockOutAt?: string | null;

/** The planned end is the workspace's daily limit for clocking in with
    no shift, not a shift end. */
endIsDailyLimit?: boolean;
```

| Case | Why an arc lies |
|---|---|
| `expectedClockOutAt == null` | There is no shift, so there is no fraction to be a fraction *of* |
| `endIsDailyLimit === true` | The end is a **cut-off**, not a finish. An arc at 90% reads "nearly done" when it means "nearly at the cap" |

**Fix.** A plain jade ring in both cases: *present, no progress*. Same circle,
one honest claim fewer.

Related: `reminderState?: 'NONE' | 'REMINDED' | 'OVERTIME_PENDING' |
'OVERTIME_APPROVED' | 'ESCALATED' | 'RESOLVED'` is on the same type and is what
draws the overrun tail. The enum's own comment: *"The engine NEVER force-closes
— it nudges and escalates."*

---

## 4. ⚠️ `listNoShows(days = 7)` answers a wider question than §3.8 asks

`apps/mobile/src/lib/api/attendance.ts`:

```ts
listNoShows: async (days = 7): Promise<NoShow[]> => { ... }
```

§3.8 asks *"Who was expected **this morning** and has not arrived?"* The
default window is a week, and the gateway clamps it to 1–60.

Worse than being one argument off: **it breaks §3.8's own rule.** "Hidden when
empty" only works if the section can empty. A seven-day backlog never does, so
the not-arrived band would be open every day and stop meaning anything.

**Fix.** Pass `1`. And note that a no-show has a lifecycle — the service calls
them *"reminded / escalated / excused"* and `resolveNoShow(id, 'excuse' |
'reopen')` exists — so an excused no-show is resolved and must not hold the
band open either.

---

## 5. The permission is right, and I checked it

§3.6 claims all three widgets share `canViewSpaceAttendance`. Verified on
`apps/api/gateway/src/modules/attendance/attendance.controller.ts`:

| Endpoint | Guard |
|---|---|
| `GET /attendance/active-entries` | `@RequirePermissionInSpace('canViewSpaceAttendance')` |
| `GET /attendance/no-shows` | `@RequirePermissionInSpace('canViewSpaceAttendance')` |
| `GET /attendance/approvals/pending` | `@RequirePermissionInSpace('canViewSpaceAttendance')` |
| `PATCH /attendance/no-shows/:id` | `@RequirePermissionInSpace('canReconcileAttendance')` |

Same permission to see all three; a **different** permission to act. That is
the whole of `ACCESS.md`.

---

## 6. Cost is lower than §3.6/§3.7 say

Everything the card reads already exists in
`apps/mobile/src/lib/api/attendance.ts`:

`getActiveEntries` · `getActiveBreaks` · `countPendingApprovals` (already does
the `page=1&limit=1` trick) · `listNoShows` · `resolveNoShow`.

And `admin-dashboard.tsx` — 1,089 lines — already renders a version of the
whole thing. **This is extraction, not construction.**
