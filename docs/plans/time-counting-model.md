# Time counting model — people with and without a shift

Mockup (approved direction, 2026-10-23): https://claude.ai/artifact/GUhyDewp6fzX7y6f1c2hwJ
(`docs/design/night-hours/`). Trigger: HBC USA night shifts at Binderholz lost ~21 counted hours
in October (no-shift 12 h limit cut the session; a night's post-midnight hours were charged to the
next night too; the organization zone was Mexico).

## The rule

One question per person per day, answered automatically: **does this person have a planned shift today?**

- **No shift:** everything from clock-in to clock-out counts. Past the workspace's daily hours the
  entry carries `PAST_DAILY_LIMIT` and the leader sees it (a long-day note), nothing is cut.
- **Shift:** the plan counts. Changes to the plan count when agreed — before (the plan for that day
  moves), during or after (one decision in Approvals). Nothing is lost silently.

## Phases

### 0 · Settings on production (needs the owner's yes, no deploy)
- HBC USA: Binderholz, AGRU America, HBC Office → no-shift policy ALLOW; clear the limit end on
  sessions open at those workspaces; organization time zone → America/New_York.

### 1 · No shift: count everything, flag long days (server) — IN PROGRESS
- [x] A night counts toward the day it started; the day follows member → workspace → organization
      zone (`countedMinutesOfDay`, `memberDayZone`).
- [x] A daily limit no longer caps counted time: `CountedTimeService.columnsFor` ignores a planned
      end that is only a daily limit (`endIsDailyLimit`). The limit stays as the planned end for
      reminders, the long-day flag and the forgotten-session close.
- [x] Clocking in with no hours left is no longer refused: kept, flagged `PAST_DAILY_LIMIT`
      (as an offline clock-in already was). `SHIFT_ONLY` still refuses.
- [ ] Repair: recount closed entries with `endIsDailyLimit` since 2026-10-01 — dry run DONE
      (2026-10-23, read-only on production), waiting for the owner's OK. 22 entries, all HBC USA:

      | Person | Workspace | Entries | Counted now → recounted | Gained |
      |---|---|---|---|---|
      | Patrick Fletzberger | Binderholz | 7 nights | 3,966 → 5,449 min | +24 h 43 m |
      | Andreas Holub | HBC Office | 5 days | 1,920 → 2,138 min | +3 h 38 m |
      | Peter Jedlicka | Binderholz | 1 day | 720 → 750 min | +30 m |
      | Juan Diego Castrillon Salazar | AGRU America | 9 days | +11 min in total | +11 m |

      Two of the entries are already APPROVED (Patrick 13 Oct, Juan 13 Oct): the repair changes
      approved hours, so the owner must agree to it explicitly. The recount never lowers a figure.

      Apply (after the OK; inside one transaction, table count and row count checked first):
      ```sql
      UPDATE time_entries t SET
        "countedEndAt" = t."clockOutAt",
        "paidMinutes"  = GREATEST(t."paidMinutes", GREATEST(0, ROUND(EXTRACT(EPOCH FROM (t."clockOutAt" - t."countedStartAt"))/60)::int
                          - COALESCE(t."unpaidBreakMinutes", t."breakMinutes", 0)))
      WHERE t."endIsDailyLimit" = true AND t.status <> 'CLOCKED_IN' AND t."clockOutAt" IS NOT NULL
        AND t."clockInAt" >= '2026-10-01' AND t."clockOutProvisional" = false;
      ```
      Only after the Phase 1 code is deployed — otherwise a later recount (a break edit) would cut
      the entry again.

### 1b · No shift: words on web and phone — DONE (2026-10-23, local)
- [x] Workspace setting: "Allow up to a number of hours a day" → "Flag days longer than a number of hours"
      (+ hint "Every hour counts…"), web, five languages.
- [x] Phone: the banner past today's hours is a WARNING ("past today's N h … your time still counts"), the
      "N min left today / counts only with overtime" lines say the time still counts. Five languages.
- [x] ⚠️ Found: the phone's OFFLINE clock-in check still refused `NO_HOURS_LEFT` itself
      (`offline/attendance/clock-in-check.ts`) — only `SHIFT_ONLY` refuses now, as on the server.
- [x] Phone (phase 2): the Time page says "Today you work 07:00–16:00 · set by Anna" for approved changed
      hours (`features/time/changed-hours.ts`).

### 2 · Shift: change the hours for one day — SERVER BUILT (2026-10-23, local), UI waits for a mockup
⚠️ Mostly exists already: an APPROVED `HOURS` request (`TimeOff.kind = HOURS`, startTime/endTime) moves
the day's planned start/end at clock-in (`dayRequestEffect` → shared `applyApprovedRequests`). So the
leader's action = create that request for the member, already approved, + push. No new model.
- [x] `PUT /employees/:id/day-hours` `{date, spaceId?, startTime?, endTime?, reason?}` (gateway
      `time-off-admin.controller.ts`, `canManageRota` org-wide or in the workspace; a workspace leader
      must name a workspace they lead) → task-service `technicians/day-hours.service.ts`: the shared
      request parser, not your own day, not a day of leave, the member works there; writes the HOURS
      request APPROVED (setting the day again replaces it; a day inside a longer request is refused).
- [x] A day ALREADY clocked is re-shaped through the same rule (`attendance/shifts/day-hours-reshape*.ts`):
      new planned start/end, only the moved side re-judged (late / early / overtime), counted time
      recomputed, a running entry's clock-out reminder re-armed (extra time asked/approved left alone);
      undecided → judged again, decided → kept with a note "counted 8h 00m → 10h 00m"; edit history row.
- [x] Push to the member: `time_off_decided` with `setBy` → "Your hours changed — Anna set changed hours
      on …" (five languages, `push-messages-attendance.ts`). Endpoint in `apiEndpoints.timeOff.setDayHours`.
- [x] Tests: `technicians/__tests__/day-hours.spec.ts` (18).
- [x] Web (2026-10-23, local): Schedule wallchart — each person/day is a button (clock on hover) opening
      `schedule/_components/day-hours-form.tsx` in a pop-over over the cell; the drawer of approved changed
      hours says who set them + "Change hours" (`drawer-actions.tsx`). Read `GET /employees/:id/day-hours?date&spaceId`
      (plan from the rota, hours already set, clocked in, leave — `technicians/day-hours-read.ts`, type
      `DayHoursView` in shared `requests/day-hours.ts`). Times checked by the shared parser (`_lib/day-hours.ts`).
      Five languages. Mockup https://claude.ai/artifact/3y58wM66AshFcGsGkUhwEJ. Defaults taken: Schedule only
      (not the member page), no "back to the shift" yet, reason optional. Phone screen not changed.
- [x] Nights (2026-10-23): an HOURS end at/before its start is the NEXT morning (18:00–06:00), at most
      16 h (`REQUEST_LIMITS.HOURS_MAX_OVERNIGHT_MINUTES` — 14:00–09:00 is refused as a slip). Shared
      parser + `applyApprovedRequests` (`atLocal(hhmm, nextDay)`); a new end alone on a night shift rolls
      over too. Applies to the member's own requests as well. The request belongs to the day the night
      STARTS. Refusal text updated (web + phone, 5 languages). Tests: `shared/requests/__tests__/hours-overnight.spec.ts`.
- ⚠️ A replaced end drops extra time approved DURING that shift (the office's new end is the decision);
  agreed overtime asked in advance is added on top again.
- Member "Change my hours" request → Approvals → same write on approval (reuse the request kinds
  HOURS / OVERTIME ahead and `dayRequestEffect`).

### 3 · Shift: one "time outside the shift" decision
- [x] DONE (2026-10-23, local). Rule: shared `attendance/outside-shift.ts` (`outsideShift`, `planAfterCounting`
      — after the end first, then before the start). Inbox kind `outside` (Approvals): Count it (the minutes
      box filled with all of it — editing it = "Change") · Don't count. Grouped into the person's working day;
      `kindNeedsMinutes` keeps it out of "Approve day".
- [x] Server: `attendance/extra-time/outside-shift.service.ts` — the leaders' list (31 days, never your own,
      not while an extra-time/overtime question is open), the member's own, the decision (permission,
      not yourself, office rules, claimed once). Counting after the end reuses `addOvertimeToClosedEntry`
      (an approved overtime round on the record); before the start moves the plan's start. Migration
      `20261023150000_outside_shift_decision` (additive).
- [x] Phone: "2 h 30 m outside your shift on 22 Oct is waiting for Anna" on the Time page (online only).
- [x] Tests: shared `outside-shift.spec.ts` (6), task-service `outside-shift.spec.ts` (8),
      `tools/outside-shift-e2e.py` (11 checks, LOCAL).
- Not done: "Ask for more time" during the shift still creates the extra-time item (its own kind) — merging
  it into this one is a later step, once this runs; the member is pushed only for the counted part after
  the end (through the overtime round).

### 4 · Clean-up
- [x] CLAUDE.md: "Counting time — with and without a shift" section (endpoints + the rules that bite).
- [ ] Retire duplicate paths (extra-time item → the outside item) once 2–3 have run on production.
