# Area 01b — Member detail (`/members/[id]`)

Extends [Area 01 — Members & Access](./01-members.md). Same six passes, run against the
member record page and its eight tab components.

Status: **All six passes run. All 7 findings fixed**, plus 2 found while fixing. Awaiting the two-session live-sync check (exit gate #2).

---

## A. What this feature is (from the code)

**In one paragraph:** `/members/[id]` is the single-member record. It opens on an Overview
(role, contact, spaces, recent tasks, watchers) and fans out into up to seven tabs —
Tasks, Attendance, Locations, Schedule, Time Off, Performance, and an admin-only Access
tab. Which tabs appear depends on the viewer: `canViewOps` (ADMIN **or** `canViewAllTasks`)
unlocks the operational tabs, `isAdmin` unlocks Access. Editing goes through the same
`EditMemberDialog` the list page uses, so the two screens cannot disagree about what an
edit means.

### Structure

| File | Lines | Loading |
|---|---|---|
| `page.tsx` | 724 | static |
| `_components/time-off-tab.tsx` | 511 | static |
| `_components/add-attendance-dialog.tsx` | 412 | static (via attendance-tab) |
| `_components/performance-tab.tsx` | 323 | **`dynamic()`** — recharts |
| `_components/schedule-tab.tsx` | 321 | static |
| `_components/attendance-tab.tsx` | 150 | static |
| `_components/member-watchers.tsx` | 127 | static |
| `_components/locations-tab.tsx` | 110 | static |
| `_components/tasks-tab.tsx` | 91 | static |

### Reads — 8 queries, 4 of them tab-gated

| Query key | Endpoint | Gate | staleTime |
|---|---|---|---|
| `["orgMember", id]` | `GET /organizations/members/:id` | — | global |
| `["memberTasks", id]` | `GET /employees/:id/tasks?limit=5` | — | global |
| `["employeeSchedule", id]` | `GET /employees/:id/schedule` | — | global |
| `["memberLocationAssignments", id]` | `GET /employees/:id/assignments` | — | 30s |
| `["employeeProfile", id]` | `GET /employees/:id` | `canViewOps` | 60s |
| `["memberTasksFull", id, page]` | `GET /employees/:id/tasks` | `canViewOps` + tab | 30s |
| `["memberAttendance", id, from, to]` | `GET /employees/:id/attendance` | `canViewOps` + tab | 30s |
| `["memberPerformance", id]` | `GET /employees/:id/performance` | `canViewOps` + tab | 30s |

Plus per-tab queries: `["employeeTimeOff", id, status]`, `["memberWatchers", id]`,
`["orgMembers","managers"]`.

### Writes

All live in the tabs, none on the page itself: schedule save, time-off request /
approve / reject / cancel, manual attendance add, watcher save. Every one invalidates
its own key on success.

---

## Findings

| ID | Sev | Pass | Title | Status |
|----|-----|------|-------|--------|
| MD-D1 | M | D | Time-off lives in **three** caches that never invalidate each other | **fixed** |
| MD-D2 | M | D | Saving a schedule does not refresh the availability calendar | **fixed** |
| MD-C1 | M | C | ~2,000 lines of tabs and dialogs load before the first tab is opened | **fixed** |
| MD-F1 | M | F | Dates hardcoded to `en-US` — **27 occurrences app-wide** | **fixed** |
| MD-E1 | L | E | `formatRelativeDate` duplicates the dashboard's `timeAgo` | **fixed** |
| MD-E2 | L | E | `page.tsx` is one ~640-line component owning fetching, permissions and layout | **fixed** |
| MD-B1 | L | B | Access tab gated on `isAdmin` in the UI, `canManageUsers` on the server | **fixed** |

### MD-D1 — one dataset, three caches

The same `TimeOff` rows are read under three different query keys:

| Key | Read by |
|---|---|
| `["employeeTimeOff", id, status]` | this page's Time Off tab |
| `["orgTimeOff", status]` | `/attendance`, `/employees/availability` |
| `["availability"]` | the availability calendar |

`attendance/_components/add-dayoff-dialog.tsx:58-59` already knows they are linked — it
invalidates `orgTimeOff` **and** `availability`. The member page's four mutations
(`time-off-tab.tsx:129,146,166,182`) invalidate only `employeeTimeOff`, and nothing
anywhere invalidates `employeeTimeOff` from the org side.

**Repro**: approve a day off on `/employees/availability`, then open that member's Time Off
tab → still `PENDING`. Do it in the other order → the calendar still shows the request
pending. Both screens are wrong, in opposite directions, at the same time.

### MD-D2 — schedule saves do not reach the calendar

`schedule-tab.tsx:103` invalidates only `["employeeSchedule", employeeId]`. The
availability calendar computes from schedule + time-off + tasks, so a changed working week
does not appear there until its own staleTime lapses.

### MD-C1 — the first tab pays for all of them

`page.tsx` statically imports `AccessBuilder` (252), `EditMemberDialog` (601),
`AuditTrail` (270), and the tab barrel, which pulls `TimeOffTab` (511) and — through
`attendance-tab` — `AddAttendanceDialog` (412). The page opens on **Overview**, which uses
none of them. Only `PerformanceTab` is split, and only because recharts made it obvious.

### MD-F1 — `en-US` hardcoded (systemic)

`page.tsx:77` — `date.toLocaleDateString("en-US", { month: "short", day: "numeric" })`.
The app is otherwise fully translated into five languages, so a German user reads a German
page with an English date on it.

This is **not local to Members**: `grep '"en-US"'` returns **27 hits** across tasks,
timeline, epics and more, while `customers/[id]`, `service-report-section` and
`invoices-tab` already use the correct `i18n.language` / `undefined`. Both patterns exist
side by side. Fixing only the Members occurrence would leave the split in place — this
wants one shared formatter, tracked as a cross-cutting item.

### MD-E1 / MD-E2 — duplication and shape

`page.tsx:68` `formatRelativeDate(dateStr, t)` vs
`dashboard/_components/helpers.ts:67` `timeAgo(dateStr)`. Same job, different granularity
(days vs minutes), different i18n namespaces (`members.detail.*` vs `common.timeAgo.*`),
different signatures (one takes `t`, one reaches for the global `i18n`).

`MemberProfilePage` runs from line 84 to 724 and owns eight queries, the permission
derivation, three pieces of view state, the refresh-all callback, the header, the whole
Overview tab and the tab shell. The list page extracts `MemberRow` / `RoleBadge` /
`RowActions`; this page extracted the tabs but kept everything else inline. The codebase's
own precedent for the data half is `dashboard/_lib/use-dashboard-data.ts`.

### MD-B1 — UI stricter than the server

`page.tsx:437` — `showAccessTab = isAdmin`, but `PATCH /organizations/members/:id` accepts
`canManageUsers`. A manager who legitimately holds `canManageUsers` cannot reach the Access
tab in the UI but can perform the same edit through the API. Not a vulnerability — the
server is the authority and it is enforcing its own rule — but the two disagree about who
this feature is for, and one of them is wrong.

---

## Verified good (checked, no finding)

- **Server gating matches the client's.** Every `canViewOps` query maps to an endpoint
  carrying `@RequirePermission('canViewAllTasks')` (`technicians.controller.ts:323, 435,
  464, 495, 523`). The UI is hiding what the server would refuse, not the reverse.
- **Self-or-privileged on the shared endpoints.** `GET :id/schedule` and `GET :id/time-off`
  are `@Roles(ADMIN, EMPLOYEE)` — deliberately, so a member can read their own — and both
  re-check in the handler (`:554`, `:609`): a plain employee asking for someone else's id
  gets 403. `POST :id/time-off` is stricter still (`:637`).
- **Tenancy**: `getOrgMemberById` is `findFirst({ id, organizationId, customerId: null })` —
  a cross-org id and a portal customer id both 404.
- **Bounded reads**: the tasks tab paginates (P3) and the attendance window is capped at 90
  days (P4), both deliberately, with comments saying why.
- **Error state**: `isError` + a retry button (`:118`, `:256`) — the gap the list page had
  (M-F1) does not exist here.
- **Refresh-all after an edit**: `handleMemberSaved` (`:127-139`) invalidates the six
  dependent tab queries, not just the member — a previously-fixed bug (D5) that held.
- **Performance tab is correctly split**, with a comment explaining that recharts is the
  reason (P11).
- **i18n**: 169 distinct keys across the 9 files, **0 missing** in de/es/fr/it. No hardcoded
  user-visible strings, no hex colour literals.

## Open questions

- ~~Does the `_components/index.ts` barrel defeat the `PerformanceTab` `dynamic()` split?~~
  **Made moot rather than answered.** Rather than measure whether webpack happened to
  tree-shake the re-export, the page now imports each tab from its leaf module, so the
  question cannot arise. The barrel remains for other consumers.
- The page fires 5 queries on mount before any tab is opened. Each is individually justified
  — is collapsing them into one endpoint worth it? Needs measurement, not assertion.

## Fixes applied

| ID | What changed |
|----|--------------|
| MD-D1 | New `lib/query-keys.ts` owns which keys describe the same data. `invalidateTimeOff()` hits all three (`employeeTimeOff`, `orgTimeOff`, `availability`) and is now called from **all six** mutation sites — the member tab's four and the two org-level dialogs. Neither side can go stale against the other. |
| MD-D2 | `invalidateSchedule()` — the schedule tab now also invalidates `availability`, which derives from it. |
| MD-C1 | `AccessBuilder`, `EditMemberDialog`, `AuditTrail` and `TimeOffTab` are `dynamic(…, { ssr: false })`. The remaining tabs are imported from their **leaf modules**, not `_components/index.ts`, so the barrel can no longer drag `performance-tab` (and recharts) back into the page chunk — which also settles the open question below by construction. |
| MD-F1 | New `lib/format-date.ts`. All 27 `"en-US"` sites resolved: 22 display sites now use the active locale, 4 documented as intentional, 1 currency site fixed as a bonus. |
| MD-E1 | Four relative-time implementations collapsed into one. `utils.formatTimeAgo`, `dashboard/helpers.timeAgo` and `members/[id].formatRelativeDate` all resolve to `format-date`. |
| MD-E2 | Data layer extracted to `_lib/use-member-data.ts` (157 lines) — eight queries, the permission derivation, view state and the refresh-all callback. The page no longer imports `useQuery` or the auth context at all. |
| MD-B1 | `showAccessTab` and the Edit button now gate on `canManageMembers` (`isAdmin \|\| canManageUsers`) — exactly what `PATCH /organizations/members/:id` enforces. |

### Found *while* fixing

- **`utils.formatTimeAgo` returned untranslated English literals** — `"Just now"`,
  `"Yesterday"`, `"5d ago"` — on every page that used it, in all five languages. It was a
  fourth relative-time copy that the original audit had not reached.
- **`utils.formatTime` hardcoded `hour12: true`**, silently overriding the per-user 12/24h
  preference that `useTimeFormat` exists to honour. `formatClockTime` now takes it as an
  argument.
- **Invoice currency was `Intl.NumberFormat("en-US")`** — a European product printing
  `€1,234.56` where `1.234,56 €` belongs.

### Regression I introduced and caught

Re-exporting the date helpers from `lib/utils.ts` made `cn` — imported by nearly every
component, server ones included — transitively pull `@/i18n` and therefore react-i18next.
`next build` failed with `(0, e.createContext) is not a function` on `/splash-preview` and
`/operator/support`. **`tsc --noEmit` and all 235 jest tests passed.** Only the production
build caught it, which is exactly why it is in the exit gate. Fixed by deleting the
re-export and repointing the six importers at `@/lib/format-date`, with a comment in
`utils.ts` saying why it must not be re-added.

## Tests

`lib/__tests__/format-date.spec.ts` — 12 cases: locale actually follows the UI language,
the same date renders differently in en vs de, relative time is translated (asserting
specifically that it is *not* the old `"Yesterday"` / `"Just now"` literals), the
granularity ladder, and the switch to an absolute date past a week.

## Verdict

**PASS WITH FIXES** — no Critical, no High. The security posture of this page was already
sound; the work was freshness, weight, duplication and localisation.
