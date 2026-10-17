# Web app audit — SOLID, file size, long lines, DRY

Scope: `apps/web-app/src` (867 files, 138 > 300 lines, 45 > 500, ~2,390 lines > 140 chars when re-measured excluding `__tests__`).
All paths below are relative to `apps/web-app/src`. No code was changed.

Baseline that is already good (do not regress):
- **HTTP**: only 3 `fetch(` calls outside `lib/api/` and all are legitimate (`lib/auth-session.ts:271` refresh, `lib/pdf-common.ts:84` image fetch for PDFs, `lib/http-client.ts:109` server fetch adapter). Pages go through `lib/api`.
- **Query keys**: zero raw `queryKey: [...]` arrays. Everything uses `keys.*` from `lib/query-keys.ts`.
- `ConfirmDialog` (17 users), `lib/clipboard.ts` (guarded by a spec), `PriorityBadge`, `ListPager`/`ListPageHeader` (`components/list-page.tsx`), `Segmented`, `useSpaceDirectory`, `lib/format-date.ts` and `lib/money.ts` already exist. **Most of the DRY problems are pages that don't use these existing pieces**, not missing abstractions.

---

## 1. Large files — what they do, and how to split them

Targets: one file per section/dialog. Page shell ≤ 150 lines, a section or dialog ≤ 250 lines, a hook ≤ 150 lines.

### 1.1 `app/_home/HomeClient.tsx` — 784 lines, 48 long
- **What it does**: the public marketing home page. 15 inline sections, marked with `══════` comments: nav 232, hero 280, positioning 331, intro video 344, key facts 368, how it works 391, field/mobile 411, why/differentiators 437, industries 492, pricing 533, comparison 620, FAQ 636, CTA 654, footer 677. Local primitives: `Reveal` 65, `LineReveal` 76, `Count` 92, `Label` 123, `CyclingWord` 129, `FooterCol` 752, `FramePlus` 773. State is only `mounted`/`scrolled` (156–175).
- **Problems**: nothing is fetched (good), but everything is presentation in one file. The section wrapper class `border-t border-foreground/[0.08] px-6 py-20 sm:px-10 sm:py-40` is repeated 7 times. The card shells at 448/455/468/481/504 are 170–200+ char classNames.
- **Split**: `app/_home/sections/{home-nav,hero,positioning,intro-video,key-facts,how-it-works,field-mobile,why,industries,pricing-teaser,comparison,faq,cta,footer}.tsx` (40–90 lines each). Primitives go to `app/_home/_motion.tsx` (`Reveal`, `LineReveal`, `Count`, `CyclingWord`) and `app/_home/_bits.tsx` (`Label`, `FramePlus`, `FooterCol`, plus `<HomeSection tone="lg|md">` replacing the 7× wrapper). `HomeClient.tsx` becomes about 80 lines of composition. ⚠️ Keep the i18n-boundary rule (memory `web-perf-static-and-i18n`): sections take copy as props and must not import `lib/industries.ts` copy accessors. `i18n-client-bundle.spec.ts` will catch a mistake.

### 1.2 `locations/[id]/_components/members-people.tsx` — 767 lines, 25 long
- **What it does**: the workspace People tab. `PeopleSection` 72–290: 4 queries (82–100: members, roles, space, units), search plus role and bill filters, and a raw `<table>` at 168. `CostFromProfile` 291. `MemberPanel` 340–630: a Sheet with role/bill/rates/auto-clock sections, 2 mutations (397, 402), a rate-history query at 407 and a ConfirmDialog. `AddMemberDialog` 633–767: an org directory query and an add mutation.
- **Split**: `members-people/people-section.tsx` (list, filters, table, ≤ 200), `people-filters.tsx`, `member-panel.tsx` (shell) plus `member-panel-roles.tsx`, `member-panel-rates.tsx`, `member-panel-autoclock.tsx`, `add-member-dialog.tsx`. Hooks: `use-space-people.ts` (the 4 queries plus the `rows` memo at 105) and `use-member-assignment.ts` (update/remove/rates, and `invalidateSpaceMembers(qc, spaceId)`, which is also repeated at 394–395 and 689–690 and in `members-tab.tsx` 175/181–182/202–203/432–434/463–465).

### 1.3 `tasks/recurring/recurring-view.tsx` — 741 lines
- **What it does**: `TemplateCard` 90, `TemplateDialog` 195–548 (17 `useState`s 211–247, spaces and workflows queries 217/222, create/update mutations 266/276), and `RecurringPanel` 550–741 (list query, toggle/generate/delete mutations 599/608/618).
- **DRY**: `PRIORITIES`/`getPriorityColor` (65–84) re-implements `components/tasks/priority-badge.tsx` with its own palette. Line 218 fetches `locationsApi.list({limit:100})` instead of `useSpaceDirectory()` (see §2.1).
- **Split**: `recurring/template-card.tsx`, `recurring/template-dialog.tsx` (form only, ≤ 250), `recurring/use-template-form.ts` (one `useReducer` or react-hook-form object replacing the 17 states, plus `toPayload()`), `recurring/use-recurring-templates.ts` (query and 3 mutations), `recurring/schedule-fields.tsx` (frequency/day/custom-days block), and `recurring-view.tsx` as the panel shell (≤ 150).

### 1.4 `my/time-off/page.tsx` — 740 lines
- **What it does**: the member's own leave page. 4 inline SVG glyphs (57–110), `fmt` 141, `monthGrid` 148, `bookedDays` 161, 3 `useEffect`s, 9 `useState`s (195–204), queries for list/balance/cost (230/235/346), create/cancel mutations (307/319), stats (255) and draft/clash memos (289/355). It renders balance 386, calendar 449, request form 521 and history 656. Local `Stat` 712 and `Legend` 724.
- **DRY**: `STATUS_STYLES` 128 (also defined in the portal page at 44 and `sharing-tab.tsx:50`). `fmt` 141 duplicates `formatMediumDate`. Lines 245–246 invalidate by hand; use `invalidateTimeOff(qc)` from `lib/query-keys.ts:519`.
- **Split**: `my/time-off/_lib/calendar.ts` (`monthGrid`, `bookedDays`, pure and testable), `_components/{leave-glyphs,balance-strip,leave-calendar,request-form,request-history}.tsx`, and `_hooks/use-my-time-off.ts` (queries, mutations, stats, clash). Page ≤ 120.

### 1.5 `members/[id]/page.tsx` — 739 lines
- **What it does**: the member profile. Data already sits in `useMemberData` (110). The page still holds the skeleton (156–176), error/not-found, header card (≈ 205–350), the `headerStats` IIFE (133–152), and an IIFE at ≈ 365 that builds `overview` / Recent tasks / schedule / activity inline. It also holds a 10-tab `Tabs` with tab-visibility rules (≈ 545–705) and a local `triggerCls`.
- **Split**: `_components/member-header.tsx` (avatar, badges, contact, edit button, ≤ 200), `_components/member-stats.tsx` (move `headerStats` math into `_lib/header-stats.ts`), `_components/overview-tab.tsx` (recent tasks, schedule, activity), `_components/member-tabs.tsx` (trigger list driven by a `visibleTabs(member, perms)` pure function in `_lib/tabs.ts`, which also makes the external-member rule testable), and `_components/member-profile-skeleton.tsx`. Page ≤ 150.

### 1.6 `reports/page.tsx` — 739 lines, 69 long
- **What it does**: report catalogue (126), saved list (127), customers (130). Six mutations: run 143, timesheet 148, save 156, del 170, createSched 181, delSched 193. Schedules query 176, plus 8 `useState`s with compound form objects (117–124). Renders a nav rail (`NavBtn` ≈ 318), builder 423–583, results with KPIs/chart/table 584–640, Save dialog 644 and Schedule dialog 660–725.
- **DRY**: `fmt` 55 is identical to `lib/report-pdf.ts:92`. Export one `formatReportCellLocal` from `lib/report-format.ts`.
- **Split**: `reports/_components/{report-rail,report-builder,report-results,report-kpis,report-table,save-report-dialog,schedule-report-dialog}.tsx`, `reports/_hooks/{use-report-catalog,use-report-runner,use-report-schedules}.ts`, and `reports/_lib/{csv,stat-cards}.ts` (`toCSV` 59, `statCards` 82). Page ≤ 150.

### 1.7 `locations/[id]/portals/[portalId]/page.tsx` — 738 lines, **84 long (worst in the app)**
- **What it does**: 7 queries (81–86, 151, 203, 205) and 9 mutations (switch 100, delete 105, saveCat 120, delCat 127, triage 162, upload/remove cover 177/182, removeClient 190, invite 208). Around 20 `useState`s for 5 dialogs: type picker 457, delete 502, category 529, triage 554, invite (≈ 600–700). Tabs for requests 331, clients 364, categories 396, then a danger zone 427. Local `TabTrigger`/`Panel`/`EmptyState`/`Loading` (713–737).
- **SOLID**: line 76 builds a permission check by hand with `(user as unknown as Record<string, unknown>)[key]` plus `accessAllows(user.access as never, …)`. This should go through `useAuth().hasPermission` or a `useSpacePermission(key, spaceId)` hook.
- **Long lines**: one-line `useQuery({...})` calls (82, 85), `onSuccess: () => { …; …; … }` one-liners (107), JSX rows with 3–4 nested elements on one line (370–383), and 12-icon imports (10, 12).
- **Split**: `portals/[portalId]/_components/{portal-header,portal-cover,requests-tab,clients-tab,categories-tab,danger-zone,type-picker-dialog,delete-portal-dialog,category-dialog,triage-dialog,invite-dialog}.tsx`. Hooks: `_hooks/use-portal.ts` (the 3 portal reads plus `inv`) and `_hooks/use-portal-mutations.ts`. Each dialog owns its own form state, so the page keeps only `openDialog` state. Page ≤ 150.

### 1.8 `locations/[id]/_components/rota-tab.tsx` — 715 lines
- **What it does**: pure rota rules (`assignmentAppliesOn` 71, `hhmmToMin` 91, `shiftWindow` 98, `cellHasConflict` 107), `RotaTab` 118–467 (week grid, raw `<table>`, rota and members queries, remove mutation), and `RotaDialog` 469–715 (10 states, 2 queries, save mutation).
- **Split**: move the rules to `locations/[id]/_lib/rota-rules.ts`, or `packages/shared/src/scheduling/` if the phone needs them. Then `rota/rota-week-grid.tsx`, `rota/rota-cell.tsx`, `rota/rota-dialog.tsx` (≤ 250) with `rota/use-rota-form.ts`, and `rota-tab.tsx` as the shell (≤ 150). `hhmmToMin`-style helpers exist under other names elsewhere, e.g. the calendar's `at()` (`event-dialog.tsx:52`). Check `packages/shared` time utils before adding.

### 1.9 `locations/[id]/_components/members-tab.tsx` — 706 lines
- **What it does**: `MembersTab` 94 (composition), `SubRolesSection` 135–376 (roles query, combine/useHere/dropHere/remove mutations), and `RoleDialog` 378–706 (create/edit/merge/use-existing: 3 mutations, permissions editor, day-rate).
- **Split**: `work-roles/sub-roles-section.tsx`, `work-roles/role-dialog.tsx` (form only), `work-roles/role-merge.tsx` (merge picker plus confirm), and `work-roles/use-space-roles.ts` with one `invalidateSpaceRoles(qc, spaceId)` replacing the 6 copies of the triple invalidation (175–182, 202–203, 417, 432–434, 463–465, 573, 591).

### 1.10 `tasks/[id]/page.tsx` — 683 lines
- **What it does**: already sectioned with `dynamic` sections. 5 queries (138–180) and 6 mutations inline: assign 241, delete/cancel 260, statusChange 281, resume 322, comment 369, plus `refreshTask` 316.
- **DRY**: `tasks/_hooks/use-task-assign.ts`, `use-task-status-change.ts` and `use-task-row-actions.ts` already wrap assign, status move (clock gate, office start) and cancel for the list. The detail page copies the same logic and invalidates `detail/lists/counts` by hand 8 times (251–255, 272–276, 295–299, 317–320, 361–364, 374–375, 458, 658, 669).
- **Split**: `tasks/[id]/_hooks/use-task-detail-actions.ts`, built on the existing `_hooks`, and `invalidateTask(qc, id, {timeline?, time?, submissions?})` in `lib/query-keys.ts` next to `invalidateTimeOff`. Also `tasks/[id]/_components/task-header.tsx` and `task-sidebar.tsx`. Page ≤ 250.

### 1.11 `locations/[id]/_components/asset-kind-dialog.tsx` — 681 lines
- **What it does**: one dialog. The form state is a single `KindShape` (good). Sections: presets 116, what it is 150, fields 177, address 195, holder 204, more info 279, tables 335–497, log types 498, money 507–590. Local buttons: `Row` 594, `Pick` 619, `DirBtn` 637, `OwnerBtn` 665.
- **Split**: `asset-kind/{kind-presets,kind-basics,kind-holder,kind-fields,kind-tables,kind-log-types,kind-money}.tsx`, each taking `(shape, setShape)`, plus `asset-kind/kind-shape.ts` (pure updaters). `Pick`/`OwnerBtn` are the shared `ChoiceChip` (§2.5).

### 1.12 `tasks/_components/timeline-view.tsx` — 670 lines
- **What it does**: a Gantt chart. Date header helpers (22–34), `TaskTooltip` 59, `TaskRow` 111, `TimelineView` 155 (scale, scroll sync, geometry).
- **Split**: `timeline/_lib/timeline-geometry.ts` (pure: ranges, x/width per task, header ticks, which makes it testable), `timeline/timeline-header.tsx`, `timeline/task-row.tsx`, `timeline/task-tooltip.tsx`. The 6 inline `toLocaleDateString(dateLocale(), {month:"short",day:"numeric"})` calls (24–34, 89, 94) should use `formatDayMonth` / `formatMonthYear`.

### 1.13 `attendance/_components/tracking-tab.tsx` — 660 lines
- **What it does**: presentational, with data passed in through props. Stats 120, excursion panel 150, geofence alerts 161–242, filter bar 243–358 (search, location, status, date range, refresh, presets), attendance/days-off sub-tabs 360, table 393–590, hand-rolled pagination 592–630, `SortHead` 632.
- **Split**: `tracking/{tracking-stats,geofence-alerts,tracking-filters,tracking-table,tracking-row}.tsx`. The pager becomes the existing `ListPager` (§2.3) and `SortHead` becomes `components/data-table/sort-head.tsx`.

### 1.14 `locations/page.tsx` — 659 lines
- **What it does**: `SpacesPage` 80 (list, workflows, resync-all mutation), local `EmptyState` 273, `SpaceCard` 306 (one roster query **per card** at 329–330; that is N requests, against the §15 budget), `SharedWithUsSection` 510, `CreateSpaceDialog` 632.
- **Split**: `locations/_components/{space-card,shared-with-us,create-space-dialog,spaces-empty}.tsx`. Replace the per-card roster query with a count field from the list or from `useSpaceDirectory`.

### 1.15 Others over 550 worth splitting the same way
- `components/location-picker.tsx` (654): map helpers versus search versus manual fields. Proposed files: `location-picker/{map-layer,address-search,coords-fields,polygon-draw}.tsx`.
- `shared/[id]/page.tsx` (652): has 3 inline dialogs, `AddWorkerDialog` 430, `CreateTaskDialog` 490 and `RequestMoreDialog` 559. Move each to its own file.
- `my/attendance/page.tsx` (641): `duration`/`fmtDate` (29/36), `LiveShift` 51, `RangeField` 99. Split into `_components` plus `_lib/period.ts`.
- `calendar/_components/event-dialog.tsx` (566, **56 long**): has **28 `useState`s** (70–98) and 3 queries plus 2 mutations. Proposed: `event-dialog/use-event-form.ts` (reducer, `toPayload`), `{event-when,event-where,event-people,event-client,event-reminders}.tsx`.
- `tasks/[id]/_components/service-report-section.tsx` (624), `documents/all/_components/document-control.tsx` (621), `attendance/_components/edit-entry-dialog.tsx` (601), `locations/[id]/_components/general-tab.tsx` (600).
- `app/help/_content/articles.ts` (665, 75 long) is content, not code. Exempt it from the line rule, or move it to MD/JSON.

---

## 2. Repeated UI and logic → one shared piece

### 2.1 Workspace list fetched 12 ways (cache split plus §15 violation)
§15 says the workspace list is `useSpaceDirectory()`, one shared request. The following each fetch `locationsApi.list` under their own key:
- `attendance/page.tsx:106` (no args)
- `tasks/_components/create-task/use-create-task-form.ts:338`
- `tasks/recurring/recurring-view.tsx:218–219` (`{limit:100}`)
- `invoices/new/page.tsx:170`
- `locations/page.tsx:96` (`{limit:100,includeInactive,kind:"all"}`)
- `locations/[id]/portals/[portalId]/page.tsx:85` (`{limit:100}`)
- `locations/[id]/_components/customers-tab.tsx:294` (`{limit:200}`)
- `components/assets/asset-record-dialog.tsx:143` (`{limit:200}`)
- `components/invitations/create-invitation-dialog.tsx:106`
- `hooks/use-assignable-members.ts:50`
- `hooks/use-space-scope.ts:90` (`{limit:200}`)
- `components/top-navbar/use-prefetch-routes.ts:42,46`

That is 5 different keys for the same list, which silently caps at 100 or 200. **Fix**: `useSpaceDirectory()`, plus `useActiveSpaces()` (filters archived) in `hooks/use-space-directory.ts`. Add a guard spec that fails on `locationsApi.list(` outside `lib/space-directory.ts`.

### 2.2 Cache invalidation groups → named invalidators
There are 383 `invalidateQueries` calls in 119 files. `lib/query-keys.ts:519/530` already has `invalidateTimeOff` and `invalidateSchedule`. Add:
- **`invalidateTask(qc, id, opts)`** (detail + lists + counts, optionally timeline/time/submissions). Users: `tasks/[id]/page.tsx` (8 sites), `tasks/_hooks/use-task-assign.ts:71`, `use-task-status-change.ts:78`, `use-task-bulk-actions.ts:60,92`, `use-task-row-actions.ts:145`, `tasks/page.tsx:125`, `create-task/use-create-task-submit.ts:159`, `locations/page.tsx:117–118`, `locations/[id]/_components/workflow-tab.tsx:58`, `tasks/[id]/_components/checklist-section.tsx`, `edit-task-dialog.tsx`.
- **`invalidateSpaceRoles(qc, spaceId)`** (space roles + org roleLists + spaceMembers). Users: `members-tab.tsx` 6 sites, `members-people.tsx:394–395, 689–690`.
- `my/time-off/page.tsx:245–246` should call the existing `invalidateTimeOff`.

### 2.3 Pagination → existing `ListPager` (`components/list-page.tsx:123`)
Only `invitations/page.tsx:312` (and join requests) use it. Hand-rolled copies:
- `attendance/_components/tracking-tab.tsx:593–630`
- `settings/audit-log/page.tsx:290`
- `members/_components/members-table.tsx:107`
- `documents/all/page.tsx:98,348`
- `components/assets/asset-list-table.tsx:155`
- `overtime/_components/rounds-list.tsx:92`
- `tasks/_components/tasks-pagination.tsx` (keep one: fold it into `ListPager` or the other way round).

### 2.4 Empty / loading states → `components/ui/empty-state.tsx` + `LoadingBlock`
The best implementation is `locations/[id]/_components/section-header.tsx:48` (`EmptyState`, 9 importers). Promote it to `components/ui/empty-state.tsx`. Duplicates:
- local `EmptyState` at `locations/page.tsx:273` and `portals/[portalId]/page.tsx:726`
- `Loading` at `portals/[portalId]/page.tsx:737` (hard-coded English "Loading…")
- inline `py-(8|10|12|16) text-center` blocks: 66 in 53 files, for example `attendance/_components/no-shows-tab.tsx:66`, `edit-history-dialog.tsx:108`, `settings/audit-log/page.tsx:153,240`, `invoices/page.tsx:337`, `invoice-document.tsx:274`, `invoices/[id]/page.tsx:163`, `invoices/[id]/edit/page.tsx:263`, `portals/page.tsx:54`, `portal-tab.tsx:67`, `my/time-off/page.tsx:370,662`, `tasks/_components/grouped-list.tsx:245`, `calendar/_components/agenda-list.tsx:27`, `customers/[id]/customer-timeline.tsx:55`, `members/[id]/page.tsx` (~415 "no recent activity")

### 2.5 Choice chips / toggle pills → `components/ui/choice-chip.tsx` (cva)
The active-pill class `border-primary bg-primary/10 …` versus inactive `border-border text-muted-foreground` is written out in **24 files**: `asset-kind-dialog.tsx:619,665`, `reports/page.tsx`, `issues/page.tsx`, `members/phone-sync/page.tsx:248` (`FilterChip`), `members/[id]/_components/add-attendance-dialog.tsx`, `documents/all/_components/document-control.tsx`, `approvals/_components/no-show-decision.tsx`, `assets/[id]/_components/log-entry-dialog.tsx`, `settings/_components/{leave-settings-card,clock-in-section}.tsx`, `locations/[id]/_components/{away-policy-section,portal-tab,no-shift-section,rests-section}.tsx`, `tasks/[id]/_components/task-crew-card.tsx`, `customers/[id]/customer-composer.tsx`, `welcome/_wizard/choice-card.tsx`, `components/{access-fields,clock-in-picker}.tsx`, `components/attendance/break-fields.tsx`. One `ChoiceChip` (size sm/xs, optional icon, `tone`) plus the existing `Segmented` for radio groups.

### 2.6 Stat tiles → `components/ui/stat-tile.tsx`
Seven separate implementations:
- `attendance/_components/attendance-helpers.tsx:262` (`StatCard`)
- `my/time-off/page.tsx:712` (`Stat`)
- `members/[id]/_components/holdings-tab.tsx:97` (`Stat`)
- `members/[id]/_components/performance-tab.tsx:62` (`StatTile`)
- `employees/availability/page.tsx:435` (`Stat`)
- `invoices/_components/list/aging-summary.tsx:20` (`Stat`)
- the inline `headerStats` grid at `members/[id]/page.tsx:353–363`, and `reports/page.tsx:592` KPI cards

One `StatTile {icon?, value, label, tone?, delta?, size}` plus `StatGrid`.

### 2.7 Status / tone maps → `lib/status-tones.ts` + `<ToneChip>`
- `STATUS_STYLES`: `portals/[portalId]/page.tsx:44`, `locations/[id]/_components/sharing-tab.tsx:50`, `my/time-off/page.tsx:128`, `components/dashboard/worker-avatar.tsx:31`
- `TONE`: `members/phone-sync/page.tsx:31`, `components/attendance/presence-day.tsx:20`, `components/assets/asset-status.tsx:15`, `tasks/[id]/_components/job-time-card.tsx:10`, `invoices/_components/list/aging-summary.tsx:28`
- Priority palettes: `tasks/recurring/recurring-view.tsx:65–84` and `issues/page.tsx:19–20` (SEV_DOT/SEV_TEXT) duplicate `PRIORITY_COLORS` (`@hbcfield/shared/constants`) and `PriorityBadge`.

Proposal: a semantic tone set (`neutral|info|success|warning|danger|primary`) → class map in one file, a `ToneChip` built with cva, and per-domain `status → tone` maps. About 20 chip components (`StateChip`, `StatePill`, `StandingChip`, `VisibilityChip`, `ModeChip`, `MatchChip`, …; see the grep list in §2.10) become 3-line wrappers.

### 2.8 Date / number formatting → `lib/format-date.ts` (already exists)
There are 113 inline `toLocale(Date|Time)String(` calls across 62 files, although `formatDayMonth`, `formatMonthYear`, `formatMediumDate`, `formatMediumDateTime` and `formatRelativeDay` exist.
- Worst: `tasks/_components/timeline-view.tsx` (6), `settings/_components/holidays-section.tsx` (3, line 386), `calendar/_components/month-grid.tsx` (3), `calendar/_components/{week-grid,rail,agenda-list}.tsx` (2 each), `shared/[id]/page.tsx:258,367`, `reports/page.tsx:263–264`, `invoices/_components/list/invoice-row.tsx`, `assets/[id]/_components/asset-about.tsx`, `components/assets/custody-parts.tsx`, `tasks/_components/{task-card.tsx:153,task-table-row.tsx:126}`, `members/_components/pending-invitations.tsx:82`, `members/[id]/page.tsx:305`, `my/attendance/page.tsx:38,115,260–261,559–560`.
- Local formatter clones: `my/time-off/page.tsx:141 fmt`, `my/attendance/page.tsx:29 duration` and `36 fmtDate`, `issues/page.tsx:30 fmt`, `customers/[id]/customer-record-lib.ts:43–44`, `components/worklog-timeline.tsx:17 fmtTime`, `attendance/_components/edit-history-dialog.tsx:24 formatTime` vs `attendance-helpers.tsx:76 formatTime`.
- Add the missing shapes to `format-date.ts`: `formatTimeShort`, `formatWeekdayDayMonth`, `formatDateTimeShort`, `formatDurationBetween`. Add a guard spec like the existing `distance-display-guard`: no `toLocale*String(dateLocale()` outside `lib/format-date.ts`.
- Money: `invoices/[id]/page.tsx:38 money`, `invoice-document.tsx:121 money` and `invoices/_lib/list-format.ts:3 formatCurrency` are 3 one-line aliases of `formatAmount`. Import `formatAmount` directly.
- Report cell: `reports/page.tsx:55` and `lib/report-pdf.ts:92` are the same `fmt`.

### 2.9 Data tables, sort heads, search + filter bars
- **Tables**: 21 app files hand-write `<table>` while `components/ui/table.tsx` has 5 importers. The repeated header class `px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground` appears 7× and `px-3 py-2 text-left text-[11px] … text-slate-500` 5×. Files: `attendance/_components/no-shows-tab.tsx`, `locations/[id]/_components/{rota-tab,members-people}.tsx`, `members/phone-sync/page.tsx`, `members/[id]/_components/{statement-tab,attendance-tab}.tsx`, `documents/compliance/page.tsx`, `documents/_components/issue-rows-table.tsx`, `overtime/_components/by-person.tsx`, `reports/page.tsx:629`, `reports/job-time/page.tsx`, `employees/leave-opening/page.tsx`, `invoices/_components/labour-cost-panel.tsx`, `tasks/_components/role-jobs-summary.tsx`, `settings/_components/holidays-section.tsx`, `components/assets/{all-assets-list,asset-list-table}.tsx`. Not the printable ones (`invoice-document`, `report-sheet`, `service-report-section`).
  - Proposal: `components/data-table/{data-table-shell,th,sort-head,table-empty-row}.tsx` on top of `ui/table`. Move `SortHead` from `tracking-tab.tsx:632` into it.
- **Search fields**: `<Search className …>` + `Input` is hand-built in 25 files (list in §2.10 grep). Proposal: one `components/ui/search-input.tsx` (icon, clear button, debounced via `use-debounced-value`).
- **Filter bars**: `tracking-tab.tsx:243–358`, `tasks/_components/tasks-page-header.tsx`, `members/page.tsx`, `documents/all/page.tsx`, `invoices/page.tsx`, `team/page.tsx`. Proposal: `components/filter-bar.tsx` (search slot + Select filters + date-range pill + refresh), extending `ListPageHeader`.

### 2.10 Repeated typography / shell class strings → tiny primitives
- Eyebrow label `text-[11px] font-semibold uppercase tracking-wider text-muted-foreground` and variants: **131 uses in 85 files**. Use `<Eyebrow>` or a `eyebrow` class in `globals.css` via `@apply`.
- Card shell `bg-card rounded-(xl|2xl) border border-border…`: 52 uses. Use `ui/card`, or `<Panel>`, which already exists twice (`customers/[id]/customer-record-bits.tsx:56`, `portals/[portalId]/page.tsx:722`).
- Section card header `px-5 py-4 border-b border-border/60 flex items-center gap-2.5`: 6×. Use `<PanelHeader icon title action>`.
- Icon well `flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary`: 7×. Use `gradient-icon.tsx` or a new `IconWell`.
- Back link `mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 …`: 6×. Use `<BackLink>`.
- Delete icon button `shrink-0 rounded p-1.5 text-muted-foreground hover:text-destructive`: 5×. Use `<IconButton tone="danger">`.

### 2.11 Permission checks by hand
`portals/[portalId]/page.tsx:74–77` casts the user to a record to read a flag. Move it to a `useSpacePermission(key, spaceId)` hook (wrapping `accessAllows`) next to `hooks/use-task-permissions.ts`.

---

## 3. Long lines (> 140): causes and a rule

Measured on the 2,392 long lines (excluding tests):

| Cause | Lines | Example |
|---|---|---|
| `className="…"` literal on the line | **1,085 (45%)** | `HomeClient.tsx:448–504`, `portals/[portalId]/page.tsx:376–383`, `reports/page.tsx:320–374` |
| `t("key", "English default")` inline | 258 | `portals/[portalId]/page.tsx:107,370,398`, `reports/page.tsx:338,351` |
| Comments / JSDoc | 175 | throughout |
| `cn(…)` with conditional branches on one line | 86 | `reports/page.tsx:320–321` |
| Function/type signatures with inline object types | 50 | `HomeClient.tsx:65,76`, `FooterCol` 752 |
| Multi-symbol imports | 34 | `portals/[portalId]/page.tsx:10,12` |
| One-line `useQuery({...})` / `onSuccess: () => {a; b; c}` | 35 | `portals/[portalId]/page.tsx:81–86,107`, `reports/page.tsx:126–130,172,190` |
| Several JSX elements nested on one line | (overlaps className) | `portals/[portalId]/page.tsx:377–378` |
| Content data | 75 | `help/_content/articles.ts` |

There is no formatter: no Prettier config in the repo or in `apps/web-app`, and `eslint.config.mjs` has no `max-len`. That is the root cause. `class-variance-authority`, `clsx` and `tailwind-merge` are installed, but `cva(` is used only in `ui/button`, `ui/badge` and `ui/sheet`.

**Proposed rule**
1. Add **Prettier** (`printWidth: 120`, plus `prettier-plugin-tailwindcss` for class ordering). It breaks JSX props, imports, object literals and one-line hooks automatically, which fixes most of the non-className causes with no thought. Run it per directory to keep diffs reviewable.
2. ESLint `max-len: [warn, { code: 140, ignoreStrings: false, ignoreComments: false, ignorePattern: "^import |t\\(\"" }]` as a ratchet. Fail CI only on *new* violations, using a baseline file the way `jscpd` is used.
3. **className budget**: a class string over about 80 chars, or repeated 3 or more times, goes to (a) a `cva` variant on a ui primitive (`ChoiceChip`, `ToneChip`, `StatTile`, `Panel`, `IconWell`), or (b) a named `const xxxClass = cn(…)` at module top. Never one long literal inline. Conditional classes use `cn(base, active && activeCls)` over several lines, never nested ternaries on one line.
4. `t("key", "default")`: the English catalogue already holds the string. Drop inline defaults on new code. A codemod can strip them where the key exists in `en` (`i18n` catalogue tests already check keys).
5. `max-lines: [warn, 300]` per file (skipping blank lines and comments), with `help/_content`, `lib/query-keys.ts` and `lib/api/*` exempt.

---

## 4. Ten refactors, in priority order

| # | Refactor | Size | Risk | Why first |
|---|---|---|---|---|
| 1 | **Workspace list → `useSpaceDirectory`** in the 12 call sites + guard spec (§2.1) | S (≈ 12 files, 1–5 lines each) | Low–Med: check each caller needs archived/inactive filtering; `locations/page.tsx` needs `kind:"all"` | Fixes silent 100/200 caps, 5 cache copies and a §15 rule violation |
| 2 | **`invalidateTask` / `invalidateSpaceRoles`** + task detail page onto `tasks/_hooks` (§2.2, §1.10) | M | Med: status-move behaviour (clock gate, office start, step form) must stay identical; covered by existing task-hook tests | Removes about 30 copy-pasted invalidations; −150 lines from `tasks/[id]/page.tsx` |
| 3 | **Prettier + `prettier-plugin-tailwindcss`**, then lint ratchet (§3) | M (mechanical, big diff) | Low (formatting only); land in per-directory commits to keep blame usable | Fixes the root cause of most of the ~2,390 long lines |
| 4 | **Portal detail page split** (§1.7) | M (738 → ≈ 12 files) | Med: 9 mutations, 5 dialogs; manual QA of triage/invite | Worst long-line file (84); has a hand-rolled permission cast |
| 5 | **`ListPager` everywhere + `components/data-table/*`** (§2.3, §2.9) | M | Low | 7 pagers and about 16 raw tables collapse into one look |
| 6 | **`ChoiceChip` / `ToneChip` / `StatTile` / `EmptyState` / `Eyebrow` primitives** (§2.4–2.7, §2.10) | M (primitives S; adoption across ~80 files incremental) | Low; visual diffs need the user's OK (memory `web-ui-approve-before-deploy`) | Biggest className de-duplication |
| 7 | **Date formatting via `lib/format-date.ts`** + guard spec (§2.8) | M (62 files) | Low–Med: output strings can change subtly (year shown or not); invoices keep their pinned locale | One locale rule; deletes local `fmt` clones |
| 8 | **Reports page split** (§1.6) + shared `formatReportCell` wrapper | M | Low–Med | 69 long lines, 6 mutations in one component |
| 9 | **Form-state hooks for big dialogs**: `event-dialog` (28 states), `recurring TemplateDialog` (17), `RotaDialog` (10) → `use-*-form.ts` reducers + section components (§1.3, §1.8, §1.15) | M–L | Med: payload shape must stay byte-identical; add `toPayload` unit tests first | Testability; −1,000 lines across 3 files |
| 10 | **Workspace People / Roles / Rota / members profile splits** (§1.2, §1.5, §1.8, §1.9) and **HomeClient sections** (§1.1) | L (≈ 3,700 lines moved) | Low–Med (move-only); HomeClient: re-run `i18n-client-bundle.spec` and check first-load JS size | Gets every top-15 file under 300 lines |

Moves that need no UI approval (1, 2, 3, 5-internal, 7, 8, 9, 10 when move-only) can be batched. Anything that changes a pixel (6, the HomeClient wrapper) needs a mockup or the user's OK on `next dev` first, per the project memory.
