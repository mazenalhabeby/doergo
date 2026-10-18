# Attendance: correct labels, a smarter day, a nightly check

Approved 2026-10-18. Mockups: plan https://claude.ai/artifact/Va9H9TcfwLbqjJNhiRVEt3 · labels on real data
https://claude.ai/artifact/UdsAjVQDbfuBS7qRVMSXcW · simpler day https://claude.ai/artifact/4Yi1Jxh26x96uyciQ8kGg1.
Branch `refactor/code-audit-2026-10`. Nothing deployed until the user has seen it on :3000 / Expo.

## Rules that bind every step

1. **The past is not touched.** Old entries keep their times, labels and status. New rules apply only to entries
   created after the update. Mechanism: `TimeEntry.labelRules` (Int?, null = old). Every new rule is gated on it;
   an entry with `labelRules = null` runs exactly today's code paths, edits included. No data migration rewrites rows.
2. **One rule per label, one place.** `packages/shared/src/attendance/labels/` holds the label catalogue (code,
   review/info, tone, i18n key), the facts kept on an entry, the pure rules, the explanation sentence and the
   duration format. Server, web, phone, push, reports and the no-shows record read it — no second copy.
3. **Every new label can explain itself** from `TimeEntry.labelFacts` (Json): the shift matched (name, start, end,
   grace), first arrival or not, the rest planned and taken, the distance and accuracy at clock-in/out, how the shift
   was closed. Tooltip: “Late · 15 min — shift starts 18:00 · grace 10 min”.
4. **Durations are hours and minutes everywhere**: “4 h 48 min”, “5 h”, “15 min” — never “288 min”.
5. **Keep the audit's guarantees**: typed contracts (no `{ cmd: '…' }`), validated bodies (DTO per route), size and
   long-line ratchets, clone check ≤ 3, no `any`, tests green, guards never loosened, OTA-safe phone code.
6. **Security**: every read and write keeps today's gates (workspace scope, approvals through the kind's own route);
   explanations never reveal more than the viewer may already see (no coordinates to a viewer without tracking).
7. **Performance**: facts are written in the same transaction as the entry; no extra query on list reads (facts
   travel on the row); the nightly check runs under the cron lease, one batched query per organization.

## Decisions (2026-10-18)

- **Late back from rest** (`LATE_FROM_REST`) sends the day to review; grace = the shift's own `flagToleranceMin`.
- Lunch off site inside the planned rest window is the rest; one request for more time, a “no” never clocks out;
  at most four clock pushes a day; one office item per person-day with a decision push; the five screen bugs first.

## Step 1 — five screen bugs · DONE (`d5712785`)

## Step 2 — correct labels (new entries)

| Label / behaviour | Rule for new entries |
|---|---|
| `LATE_ARRIVAL` | Only the **first** entry of a shift instance. Matched to the shift the clock-in falls in, else the next to start; never one already over. Remote-bucket clock-ins are judged when a shift resolves. |
| `LATE_FROM_REST` (new) | A rest (break row, or the gap between two entries of the same shift) longer than its planned length + grace. Facts keep planned and actual length. Review. |
| Office edit | Labels kept unless the edit removes their reason; the approval is decided again by `approvalFor` after every edit. |
| Approving extra time | Moves the planned end **and** works out the time labels again. |
| One entry per shift | An automatic and a manual clock-in for the same shift arriving together join; a fragment shorter than 2 min closed by a departure that the server refused as automatic does not make a second entry. Phone: a pending automatic entry is never treated as an arrive-and-leave session. |
| `MISSED_CLOCK_OUT` | Always stores how the shift was closed (left site, last seen, shift end, confirmed by the person, overtime decision). |
| `OUTSIDE_GEOFENCE_OUT` | Same accuracy limit as clock-in; a missing or too-coarse fix is recorded as “not judged” in the facts, never as “on site”. Judged on every close path or marked not judged. |
| `MISSED_BREAK` | Removed when the office adds the rest; re-read if the rule changed. |
| `BOUNDARY_CHANGED` | Only when the boundary itself changed (`CompanyLocation.boundaryChangedAt`, set on radius/polygon/pin change). |
| Reports · No-shows | Read the entry's label and the shift's grace; count only the first entry per shift. |
| Words | One catalogue, five languages, everywhere: Attendance Management, member page, phone review, worker history, Breaks tab (“Automatic rest”), push. “Auto-approved” instead of “AUTO”. |
| Setup | The workspace page warns when the pin lies outside its drawn boundary. |

Migrations (additive only): `time_entries.labelRules Int?`, `time_entries.labelFacts Json?`,
`company_locations.boundaryChangedAt timestamptz?`, the new flag code in the catalogue. Applied locally only.

## Step 3 — the smarter day

Arrival card (one tap; zero with the automatic clock; a refusal offers “Ask to clock in from here”), lunch off site
inside the rest window = the rest, one “Clock out / Ask for more time” question (a “no” stops counting, never
clocks out), forgot-clock-out offers the last moment seen on site, a budget of four clock pushes a day, one
Approvals item per person-day and a push when the day is decided.

## Step 4 — the nightly check

Under the cron lease, for yesterday's entries with `labelRules` set: work every label out again from `labelFacts`
with the shared rules and compare. A mismatch is logged and reported to the operator console — never shown to
customers, never auto-corrected.

## Verification for every step

Unit tests per label covering: early, on time, within grace, late, back from lunch, rest over plan, two shifts a
day, night shift, night → day, no shift, offline, automatic + manual together, office edit, forgot clock-out,
closed overnight, away allowed, outside boundary, daylight-saving day. Old-entry tests prove nothing changes when
`labelRules` is null. Live: `clock-audit.py`, `auto-clock-e2e.py --no-sweep`, `clock-in-day-e2e.py`,
`no-shows-e2e.py`, `approvals-e2e.py`. All suites, typecheck, ratchets, web `build:check`.
