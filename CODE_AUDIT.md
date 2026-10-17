# Code audit: backend, web, phone, shared

> **Unattended run 2026-10-17 — summary (details §12).** Branch `refactor/code-audit-2026-10`, 16 commits, not
> pushed, not deployed. Long lines ~4,470 → 581; files over 300 lines 365 → 13; gateway↔service messages typed
> (string patterns 1,153 → 3, events 215 → 1); 2 performance fixes (clock-out sheet, workspaces page); 52
> identical UI copies merged. Every package typechecks; every suite green except the two PDF-parsing specs that
> failed before. **Waiting for you:** the UI look per piece (mockup https://claude.ai/artifact/Gs8d8fBoMYVKa2rkQpxNVk),
> the scope gap in `get_technician_assignments`, the lost `task_comment_added` notification, join-request
> `userName`, the Vienna/UTC calendar default, B3 validation, Settings lazy sections.

> 16 Oct 2026. The whole codebase: 2,452 source files, 387,814 lines (tests, locales and
> migrations excluded). Measured by script, plus four detailed reviews of the largest files.
> Detailed reports, with file:line for every finding: `docs/audit/2026-10-16/`
> (`audit-backend.md`, `audit-gateway-shared.md`, `audit-web.md`, `audit-mobile.md`,
> `file-sizes.json`). Chat-only audit: `CHAT_CODE_AUDIT.md`.

## 1. Numbers

| Area | Files | Lines | > 300 lines | > 500 | > 800 | Lines > 140 chars | `any` |
|---|---|---|---|---|---|---|---|
| Gateway | 256 | 30,081 | 19 | 12 | 4 | 120 | 754 |
| Auth service | 123 | 29,025 | 35 | 16 | 6 | 128 | 286 |
| Task service | 220 | 48,325 | 55 | 32 | 10 | 427 | 406 |
| Notification + tracking | 41 | 7,148 | 5 | 4 | 2 | 41 | 56 |
| Web | 867 | 134,630 | 138 | 45 | 0 | 2,149 | 39 |
| Phone | 640 | 90,784 | 74 | 19 | 0 | 1,510 | 129 |
| Shared | 305 | 47,821 | 39 | 14 | 4 | 481 | 43 |
| **Total** | **2,452** | **387,814** | **365** | **142** | **26** | **4,856** | **~1,700** |

- **Copy-paste clones (jscpd, ≥ 12 lines):** 7, all small and in older files. The repo was cleaned on 11 Oct.
- **Import cycles:** one, in shared, type-only (`utils/geofence.ts` ↔ `utils/route-nav.ts`).
- **Longest methods:**
  - `ClockInService.clockIn` and `TaskStatusService.updateStatus`, about 610 lines each.
  - Next: invoice `gather` 402, `clockOut` 350, `createInvitation` 344, `addManualEntries` 329, `editEntry` 283.
- **No formatter or line/size rule exists** (no Prettier config, no `max-len`, no `max-lines`). That is why long lines keep coming back.

## 2. Bugs the audit found (behaviour, not style) — fix first

| # | Bug | Where | Effect |
|---|---|---|---|
| B1 | The "workspace has no time zone" fallback is hand-written 59 times: most use **UTC**, 7 use **Europe/Berlin** | approval.service:848, role-pool.service:252, calendar.service:207, cover.service | A workspace with no zone gets a different "today" depending on which code path runs |
| B2 | Scope checks bypass `scopeFor` in 24 places; at least two are wrong | technicians.controller:279 (org-wide `canViewSpaceAttendance` → cover never shown); technicians:203/243/844, locations:323, tasks:368 (bridged org managers pass the guard, then see an empty page) | Managers see empty or missing data |
| B3 | 118 `@Body()`/`@Query()` params are inline types or `any`, so the global ValidationPipe skips them | e.g. attendance:1185 (manual entries), :1231 (bulk approve, unbounded id list) | Unvalidated input on write routes |
| B4 | A bulk time-off loop returns `{ success: false }` with HTTP 200 | technicians:390 | Failures look like success |
| B5 | `@UseGuards(JwtAuthGuard, RolesGuard)` repeated on 7 controllers on top of the global guards | 10 decorators | Those requests authenticate twice |


**Status 16 Oct (evening):** B2, B4, B5 fixed. **B1 fixed**: 43 fallbacks → shared `zoneOf()` (+ `workspaceZone` uses it), guard `task-service/src/common/__tests__/zone-fallback-guard.spec.ts`. Every replaced Berlin site read a `CompanyLocation.timezone` (NOT NULL), so no real day moves. ⚠️ Open: 4 calendar sites default an ORG with no zone to `'Europe/Vienna'` (`calendar.service:76`, `events.service:150`, `feed.service:87`, `calendar-notification.handler:29`) while `workspaceZone` says UTC — a product decision. B3 stopped (see §8).
**Step 2, first item done:** ~60 hand-written assignment windows → `activeWindowWhere(now)` (started + not ended) and `notEndedWhere(at)` (not ended only), each copy keeping its own meaning; guard `assignment-window-guard.spec.ts`. ⚠️ Left on purpose: `member-offboard.service:72` (`gt`, a different rule) and `technicians.service:1369` (`effectiveTo: null` only — a person assigned UNTIL a future date drops out of the availability grouping; likely a bug, behaviour change, not touched).
**Step 2, more:** 90 hand-built `${u.firstName} ${u.lastName}` → `personName()` (guard `person-name-guard.spec.ts`; names inside longer sentences/log lines left as they are); the last 2 accent-folding copies → `foldText` (`leave-ledger` uses `\p{Diacritic}`, `asset-kind-shape` NFKD — different rules, kept).
**Step 2, chat:** times/days/presence words + bubble grouping are ONE copy in `packages/shared/src/chat/format.ts` (`chatTime`, `chatDayLabel`, `chatWhenShort`, `chatRelTime`, `chatPresenceLabel`, `bubbleShape`, `chatLocale`). The phone's `chat-format.ts` is gone; the web's keeps only `presenceColor` (Tailwind). The web's 5-minute pause rule is an option (`groupWithinMs`), so neither app's grouping changed.
**Step 2, web workspace list:** all 12 `locationsApi.list` callers now read the shared directory (`useSpaceDirectory`, new `useActiveSpaces`); guard `web-app/src/lib/__tests__/space-directory-guard.spec.ts`. ⚠️ Behaviour: a bare call stopped at the server's page size (**20 workspaces**), others at 100/200 — pickers now show every workspace. One request per minute instead of five cache keys.
**Step 2, task cache:** 15 hand-written groups → `invalidateTaskLists(qc)` / `invalidateTask(qc, id, { timeline, time, counts })` in `lib/query-keys.ts`. Both refetch with `refetchType: "all"` (a few screens refetched counts only when on screen — now always; a few extra small requests). Single invalidations (one key) left as they are.
**Step 4 (guards) done:** `tools/size-ratchet.mjs` + `tools/size-baseline.json` (1,027 files over a limit recorded: 364 over 300 lines, 4,801 lines over 140) — a recorded file may shrink, never grow; a new file must be under both. `pnpm size:check` / `pnpm size:update` (only lowers); run in task-service's suite (`size-ratchet.spec.ts`), proved by planting a 150-char line. Prettier 3.9.9 at 120 (`.prettierrc.json` single quotes + semicolons; `apps/web-app/.prettierrc.json` double quotes, no semicolons), applied only through `pnpm format:changed`. Not yet: ESLint `max-len`/`max-lines` (the ratchet covers it) and `pnpm dry:check` (jscpd not installed).
**Step 5 started — `crm/business-card.ts` split** (1,876 → a 90-line barrel + 11 files under `crm/card/`, largest 279). Move-only by `tools/split-module.mjs` (TypeScript-AST: every statement moved byte-for-byte, imports computed, cycles refused, internal names exported in a list at the bottom of each file, the barrel re-exports exactly the 23 public names). Checked: all 1,640 code lines present, shared/web/mobile/auth typecheck, 158 card tests pass. `tools/size-ratchet.mjs --split` hands the old file's long lines to the new files (7 → 7).
**Step 5 — `locations.service.ts` split** (1,644 → 9 files, largest 253): `LocationsService` (create, modules), `SpaceReadService` (list, one), `SpaceUpdateService` (edit), `SpaceLifecycleService` (default, archive, purge), `SpaceRosterService` (rosters), `MemberSpacesService` (a member's workspaces, colleagues), `SpaceMembershipService` (add/remove a person), `AssignmentTermsService` (a member's terms); shared helpers in `space-service.base.ts` (all extend it — same constructor, so DI and `new X(prisma, client)` unchanged) and `space-helpers.ts`. By `tools/split-class.mjs` (methods moved byte-for-byte; only `private`→`protected` on the 5 shared helpers). Processor/controller call the owning service; 7 specs repointed; task-service 2,535 tests pass. ⚠️ Not booted against a live stack (Docker was down).
**Step 5 — `invoice.service.ts` split** (1,563 → 7 files + module/controller wiring): `InvoiceService` (list, one, delete, exchange rate), `InvoiceCreateService`, `InvoiceEditService` (fields + status), `InvoiceItemsService` (lines + totals), `InvoiceGatherService` (gather), `SiteTimeService` (a workspace's site time, own service with `prisma` only), shared base `invoice-service.base.ts`. ⚠️ `invoice-gather.service.ts` is **460 lines** — `gather` alone is ~400; recorded over the limit (`--over`) and needs a real (tested) rewrite to shrink. Long lines 20 → 18. 3 specs repointed (incl. `rate-writer-guard`, which now names `invoice-create.service.ts` and `space-service.base.ts`); auth-service 1,407 tests pass.

**Re-audit, 16 Oct (late):** 2,490 files, 387,312 lines. Over 300 lines: **362** (was 365); over 500: 139 (was 142); over 800: **24** (was 26); lines over 140: 4,797 (was 4,856). Three splits done (business-card, locations.service, invoice.service). Largest left: technicians.service 1,506 · push-messages (i18n catalogue) 1,380 · customers.service 1,347 · portal.service 1,268 · space-roles.service 1,247 · attendance.controller 1,227 · websocket.gateway 1,183.
**Step 5 — `technicians.service.ts` split** (1,506 → 7 files, largest 298): `TechniciansService` (stats, task history), `MemberPerformanceService`, `MemberScheduleService` (week + availability), `TimeOffRequestService`, `LeaveRecordsService` (office-entered leave, lists, counts, balance), `TimeOffDecisionService` (approve/cancel/update/delete); base `member-service.base.ts`, helpers `technicians-helpers.ts`. ⚠️ **DI trap found by a test**: Nest's `@Inject`/`@Optional` param markers are INHERITED by index — a subclass constructor with one extra parameter handed the notification client to `calendarRules`. `TimeOffRequestService` gets `TimeOffDecisionService` as a PROPERTY (`@Inject(...)`), and `tools/split-class.mjs` now always does that. One class-level comment the tool had dropped was restored (tool fixed). 9 specs repointed; 2,535 tests pass.
**Step 5, batch 2 (17 Oct):** split by job, move-only, tests repointed, every split verified line-by-line (`tools/verify-move.mjs`) and recorded with `size-ratchet --split`: `customers.service` (→6), `portal.service` (→8, base split twice: `portal-guards.base` + `portal-service.base`), `space-roles.service` (→6), gateway `attendance.controller` (→8 controllers, same `/attendance` URLs — no route can shadow another), `onboarding.service` (→6), `break.service` (→4, `BREAK_SERVICES`), `approval.service` (→4, `ENTRY_SERVICES`), `clock-out.service` (→4: base `shift-close.base` + `DecidedCloseService` + `ShiftCloseSweepService`), task-service RPC `attendance.controller` (→5, each with only the services it uses). Over the limit because ONE method is (recorded `--over`, need a tested rewrite): `invoice-gather` (gather ~400), `entry-edit` (editEntry 282), `manual-entries` (addManualEntries 333), `clock-out.service` (clockOut 342). Tools: `split-class.mjs` (+controller mode, trimCtor, property injection, static members), `wire-split.py`, `split-tests.py`, `verify-move.mjs`, `prune-imports.mjs`; test helper `common/testing/combined-services.ts` in each service.
**Step 5, batch 3 (17 Oct):** `clock-in.service` (→3; `clockIn` alone is 611 — recorded over), `billing.service` (→7; the two @Cron jobs moved with their methods), notification `attendance-notification.handler` (→6 event controllers), gateway `technicians.controller` (→6, `/employees` — static-path controllers registered BEFORE `GET :id`, said in the module), `workflows.service` (→5) + `workflow-library.service` (→2), `invitation.service` (→3; `createInvitation` 338 — over), gateway `tasks.controller` (→7, static paths first), gateway `assets.controller` (→6; the route-order guard now reads the MODULE's registration order across controllers and caught `proposals/*` registered after `:id` — fixed), shared `types/permissions.ts` (→8 under `types/permissions/`) and `types/index.ts` (→7 under `types/entities/`, re-exports kept on the barrel). Web/phone guards that read server files now read the module FOLDER (`server-source.ts` helpers). Found by tests while splitting: Nest param-decorator inheritance (fixed with property injection), comments between class decorators (now kept verbatim), namespace imports, inline `import('…')` paths.
**Step 5, batch 4 (17 Oct):** `task-status.service` skipped (one 613-line method); `events.service` (→5), shared `asset-kind-shape` (→5), `assets.service` (→3), `task-assignment.service` (→3), `reports.service` (→5), gateway `documents.controller` (→6, route-order guard now reads module order via `common/testing/module-routes.ts`), `role-pool.service` (→5, @Cron sweep moved with its method), notification `push.service` (→4: core + task/attendance/approval pushes; handlers repointed), `task-notification.handler` (→4), `document-routing.service` (→2), `documents.service` facade (`readOwnUpload` → `OwnUploadReaderService`; now 239), `member-admin.service` (→3; `updateMemberProfile` 303 — over), `extra-time.service` (→3), tracking `location.service` (→5), `task-records.service` (→3; `create` 322 — over), `asset-proposal.service` (→3) + task-service RPC `assets.controller` (→4), gateway `organizations.controller` (→5), `stripe.service` (→4; the billing base gets the two new Stripe services as properties), `document-signing.service` (→4). ⚠️ Found while splitting, all fixed before going on: a base class turning an existing import loop into "Class extends value undefined" (type-only import + lazy forwardRef); a trimmed constructor dropping its body (`this.expo = new Expo()` — the source class now keeps its constructor verbatim; caught by `verify-move`, not by tests); a re-export moved off the source; positional fixture arguments after a trimmed constructor (now matched by name).

## 3. Structure (SOLID): the biggest offenders

| File | Lines | Split into (all ≤ 300) |
|---|---|---|
| shared `crm/business-card.ts` | 1,879 | 11 files under `crm/card/` |
| task `locations/locations.service.ts` | 1,651 | workspace CRUD, members/assignments, modules, auto-clock settings, geofence, default workspace |
| auth `invoices/invoice.service.ts` | 1,562 | numbering, lifecycle, gather (lines from work), PDF data, currency, statement |
| task `technicians/technicians.service.ts` | 1,507 | profile, schedule, time-off (incl. approval rules), availability, performance |
| auth `customers.service.ts` | 1,348 | clients, contacts, addresses, CRM reach, import |
| auth `portal.service.ts` | 1,268 | portal admin, units, intake, requests, customer side |
| task `space-roles.service.ts` | 1,248 | roles, grants/ceiling, day rates, members |
| gateway `attendance.controller.ts` | 1,244 (85 routes) | 10 controllers, same URLs |
| notification `websocket.gateway.ts` | 1,184 | connection/auth, rooms, chat relay, support relay, emitters |
| task attendance `clock-in` / `clock-out` / `approval` / `break` | 1,025–1,115 each | step functions, each ≤ 40 lines |
| gateway `technicians` / `tasks` / `assets` / `documents` / `organizations` controllers | 663–1,052 | 4–7 controllers each |
| shared `types/permissions.ts` / `types/index.ts` | 904 / 852 | 8 files / a 40-line barrel |
| web: portal page, reports, members-people, recurring, time-off, member profile, HomeClient | 738–784 each | page ≈ 150 + sections ≤ 250 + data hooks |
| phone: route planner, job page, tabs layout, API client | 488–782 each | screen + hooks + pure model + sheets |

**Couplings:**
- `RolePoolService` ↔ `TasksService` through three `forwardRef`s. Fix: `role-pool-spots.service`.
- 24 notification handlers inject the whole WebSocket gateway just to emit. Fix: a small emitter.
- Two ways of calling services from the gateway: `BaseGatewayService` (28 services) vs a raw `ClientProxy` in 24 controllers, with about 175 hand-rolled calls.

## 4. Duplication (DRY) that jscpd can't see

**Backend:**

| Rule written many times | Copies | One source |
|---|---|---|
| Time-zone fallback | 59 | shared `workspaceZone()` |
| "Assignment active now" window | ~21 | `activeWindowWhere(now)` (no userId), beside `activeAssignmentWhere` |
| RPC command strings `{ cmd: '…' }` | 615 literals | typed contracts in `packages/shared/src/rpc/<module>.ts` |
| Hand-built names | 73 | `personName()` |
| Org-scoped "missing or another org's" lookups | 22 | `assertFoundInOrg` |
| `hashCode` | 2 | shared `utils/crypto` |
| Accepting an invitation | 2 | one service |
| Days worked (invoice vs statement) | 2 | one gatherer |
| Diacritic folding | 16 | `foldDiacritics` |
| Envelope/pagination types | 5 | one in `http/` |

**Web:**

| Rule written many times | Copies | One source |
|---|---|---|
| Workspace list fetched (5 query keys) | 12 | `useSpaceDirectory()` |
| Task cache invalidation | ~30 | `invalidateTask` / `invalidateSpaceRoles` |
| Pagers | 7 | `ListPager` |
| Chip toggles | 24 | `ChoiceChip` |
| Stat tiles | 7 | `StatTile` |
| Status colour maps | 9 | `ToneChip` |
| Empty states | ~66 | `EmptyState` |
| Inline date formatting | 113 | `lib/format-date` |

**Phone:**

| Rule written many times | Copies | One source |
|---|---|---|
| Count badge | 6 | `CountBadge` |
| Label/value row | 8 | amazen primitive |
| "Loading…" | 11 | amazen primitive |
| Empty and "not allowed" states | 7 | amazen primitive |
| Initials circle | 10 | amazen primitive |
| Tone-to-colour ternaries | 18 | amazen primitive |
| Pill buttons + chip components | 12 + 4 | amazen primitive |
| Sheet systems | 5 | `BlurSheet` (8 raw `<Modal>` left) |
| Thread UIs (chat / support / issues) | 3 | one thread kit (mockup first) |
| Hand-rolled refresh state | 21 | `useFetchData` |
| Old style constants (`COLORS`/`SPACING`) | 47 | amazen |
| `job-ui.tsx` used as the UI kit | 65 importers | move to amazen |

**Web + phone:**

| Rule written in both apps | One source |
|---|---|
| Chat time/day formatting | `packages/shared` |
| Presence wording and colours | `packages/shared` |
| Bubble grouping | `packages/shared` |
| Read-receipt wording | `packages/shared` |
| Locale mapping | `packages/shared` |

## 5. Typing

- 469 of 705 gateway routes take `req: any`, and about 435 only read `req.user`. Root cause: `CurrentUserData.access` is loosely typed, which forces 23 `as never` casts. Fix: an `AuthedRequest` type plus `@Me` / `@OrgId` / `@ReqCtx` decorators, applied by codemod.
- 300 of 700 `@Payload()` params in the services are `any`. Fix: typed RPC contracts, one module at a time.

## 6. Rules and guards (so it can't come back)

- **Prettier at 120**, applied **only to touched files** (a full-repo reformat would bury the real diff). ESLint `max-len` 140 and `max-lines` 300 as a **ratchet**: existing files may not grow, new files must comply.
- A **structure spec** in each app that fails if a file over the limit grows, or a new file is over it.
- **`pnpm dry:check`**: jscpd with the settings above, failing on a new clone.
- **Guard specs** for each new single source:
  - workspace list only through `useSpaceDirectory`
  - dates only through `format-date`
  - every scope check through `scopeFor`
  - the time-zone fallback only through `workspaceZone`

## 7. Refactor order

Each step: no behaviour change (except the bug fixes, which are named), tests green, then the next.

1. **Bugs B1–B5**, each with a test that pins it.
2. **Shared single sources:**
   - `activeWindowWhere`, `foldDiacritics`, `geo-point` (the cycle)
   - chat format, presence and grouping
   - `hashCode`, `personName`
   - dead exports removed
3. **Typing:** `AuthedRequest` + decorators (codemod), `access` typed.
4. **Guards and the ratchet** (§6).
5. **Splits, largest first, move-only:** backend services → gateway controllers → shared files → web pages → phone screens. Specs are repointed with each move.
6. **UI primitives** (web `ChoiceChip`/`StatTile`/`EmptyState`/`ToneChip`; phone `CountBadge` and the rest). Anything visual is reviewed on :3000 / the Expo dev app before it ships.
7. **Typed RPC contracts and the notification emitter,** module by module.

The thread-UI unification (phone) and any visual change wait for your mockup review, as usual.

## 8. B3 notes (validation was started, then stopped — no behaviour change wanted)

Only `entries/manual` and `approvals/bulk-approve` (attendance) got DTOs. Before doing the rest:
- **`'key' in body` breaks with a DTO class** (ES2022 declares every field, `undefined` when not sent):
  portal-admin `updatePortal` (`spaceId` → null on every save) and platform-support `assign` (`teamId`).
  Change those to `!== undefined` first.
- **Interfaces skip validation too**: `CustomerDto`, `LeavePolicyInput` — the grep does not find them.
- Services trim and return coded refusals (no-show reason 500, share title 200, legal entity);
  a tight `@MaxLength` would turn those into a generic 400 — keep bounds generous.
- `enableImplicitConversion` is on: a `boolean` field turns the string `"false"` into `true`.
- Shared `assetsEndpoints.rejectProposal` declares `{ reason }`; clients send and the server reads `{ note }`.
- Shift/rota PATCH forms re-send `spaceId`/`userId`; legal-entity bank accounts carry `id`/`isDefault`;
  the phone's activity outbox sends `id` — a DTO must accept them.
- `/customers/import` stays `unknown` on purpose (`parseContactImport` is the validator).

## 9. Progress of step 5 (splits) — 2026-10-17

Backend + shared files over 300 lines: **108 → 23**; over 500: **27 → 7**. The 23 left are exempt data
(push/email wording, DTO field lists, the timezone table, starter document types), single over-long
methods (below), the websocket gateway, `mrz-ocr` (no constructor) and the gateway approvals inbox
(its count cache is one object's state — two classes would stop a decision from clearing it). All suites green; every split
checked line-for-line against the original (`tools/verify-move.mjs`) and recorded in the ratchet.

Done since batch 4: gateway `AttendanceService` (→5 RPC wrappers); shared `task-report`,
`types/attendance`, `step-form`, `logbook`, `object-store`, `types/modules`; auth `document-issuing`
(+ drafts), `document-common` (→ `common/`), `document-supply` (+ requirements); task `asset-log`
(+ reads), `recurring-tasks` (+ runner), `cover` (+ floor), `attendance-read` (+ entries),
`sprints` (+ reports), `support` (+ inbox); gateway `customers`, `portal-admin`, `locations`
controllers (static paths stay on the first-registered controller).

Done after that: every service/controller/shared module between 300 and 500 lines that was more than
one long method (≈65 files) — see `git status` for the new `*.base.ts` / part files and the fixtures.

**Long methods — DONE 2026-10-17** (tested rewrites, not moves): `updateStatus`, `clockIn`, invoice
`gather`, `clockOut`, `createInvitation`, `addManualEntries`, task-records `create`, sessions `refresh`,
`createApiClient`, `submitOwnDocument`, `statement.forMember`, `toApproval`, `updateMemberProfile` — each
now an orchestrator running named steps (`*-steps.ts` / `*.base.ts` beside it), same order, same refusals.
New specs pin each one's branches; invoice/statement were pinned by 18 snapshots taken BEFORE the split.
Typecheck 0 errors in all six packages; suites green except the PDF-parsing specs (`pdf-receipt`,
`background-reader`, failing before this work). ⚠️ Source-text guards must read the step files too
(`attendance-service-source.ts`, `task-service-source.ts`). `offline-mode-context.spec` (text count)
miscounts a multi-line select — replaced in spirit by `offline-mode-sessions.spec`, which runs sign-in,
refresh and validation and was proven by removing the field from refresh. The notification
`websocket.gateway.ts` (1190) still waits for a live socket test. Exempt (data): `push-messages`, `email-messages`, the documents and tasks DTOs.

⚠️ **2026-10-17 incident**: `format-changed` run with no argument reformatted ~800 files in the
working tree (one-word-per-line lists). Rebuilt from git with a three-way merge, each result proven
equal under Prettier to the reformatted one; ~20 new files (chat phase 3) keep Prettier's layout.
The tool now refuses to run without files or an explicit `--all`.

Tool lessons (fixed in the tools): an inherited `send()` is not a missing member; a base class needs
`Injectable` imported; a field must not share a name with a method; a test fixture must fill
`@Inject` properties; a part's import keeps its leading comment only by hand (check `verify-move`).

**UI next (214 web/phone/console files over 300)** — move-only, but reviewed on :3000 / Expo first.

## 10. UI files (step 5, screens) — 2026-10-17

Web + phone + console files over 300 lines: **214 → 89**. Typecheck 0 errors, all suites green.

- **Pieces out** (`tools/extract-statements.mjs`): sub-components, helpers and types move to a sibling
  file; the original stays the entry point (a Next page keeps its default export). Phone screens under
  `app/` put their parts in `src/screens/…` — every file under `app/` is a route.
- **Big components** (`tools/split-component.mjs` = `extract-hook` → helpers → `extract-sections`):
  the logic before the markup becomes `use<Name>` (same hooks, same order); markup blocks become
  sections that take the hook's state; a condition the block sat under is re-checked at the top of
  the section (a no-op at runtime, it keeps TypeScript's narrowing). A hook still over 300 is cut in
  halves (`use<Name>Data`). A file that would stay over 300 or fail tsc is put back automatically.
- **Guards that read source as text** now read through `src/test-utils/read-source.ts`: a file plus
  the parts moved out of it (found through its imports and the "moved here unchanged" marker). Guards
  that WALK every file and count per file keep reading files alone, with their allow-lists moved to
  the new file names.

Left (89): ~33 components whose markup reads values computed after an early return (those cannot move
into the hook without changing when they run), ~20 that are not components (API clients, route tables,
registries), and a dozen left whole on purpose (root layouts, theme, crew card — guards pin their text).

## 11. UI files, second pass — 2026-10-17 (evening)

Web + phone files over 300 lines: **36 → 6** (move-only; typecheck 0 in all 7 packages; web 2,033 /
phone 3,102 / console 67 / gateway 1,278 tests green; auth + task-service green except the PDF-parsing
specs that failed before). Values computed after an early return are passed as PROPS to a section in a
sibling file — the computation never moves. Long lines carried by a split are recorded with
`size-ratchet --split` (they may only shrink). Guards repointed, never loosened: distance allow-lists
(`clock-out.base.ts`, `route-tracking-values.tsx`), one-at-a-time (`task-status-checks.ts`).

Left over 300, on purpose: `job-page.tsx` 622 (markup reads post-early-return values), `auth-session.ts`
322 and phone `lib/api/client.ts` 319 (token state must stay in one module); `job-report-pdf.ts` 548 and
`build-workspace-boxes.ts` 470 are one function writing shared state — a tested REWRITE, not a move.
Exempt: help `articles.ts`, `theme/amazen.ts`, `crew-card.tsx`, phone `app/(app)/_layout.tsx`.
Tool bugs seen: `split-component`'s hook-halving can loop (writes `-data2…6`); `extract-hook` refuses a
cut when a local inside a callback shadows a later name (false positive).

**Later the same evening:** `websocket.gateway.ts` 1190 → 7 files ≤ 288 (the class keeps every
`@SubscribeMessage`; bodies on `gateway-*.base.ts`). Proven LIVE: `chat-e2e`, `chat-phase2-e2e`,
`chat-phase3-e2e` all pass before and after, jest 241/241. `job-report-pdf.ts` 548 → 152 + 6 and
`build-workspace-boxes.ts` 470 → 52 + 4, rewritten over a `PdfCursor` / `BoxAccumulator`; 10 snapshots
taken on the ORIGINAL (every jsPDF call in order + a hash of the PDF bytes; every box) match. ⚠️ The PDF
pin snapshot is ~585 KB — trim to the byte hashes if it is too heavy to keep.
Step 5 is finished except `job-page.tsx`, `auth-session.ts`, phone `client.ts` (reasons in §11).

## 12. Unattended run (2026-10-17 evening) — plan `docs/plans/refactor-autonomous-2026-10-17.md`

Branch `refactor/code-audit-2026-10` (not pushed, not deployed).

**Phase 1 — long lines: ~4,470 → 581.** Web 2,226 → 268, console 200 → 25, phone ~1,365 → 182, shared+API
1,011 → 34. Tools: `wrap-long-strings` (same-string pieces, proved per edit by evaluation),
`break-long-lines-ast` / `break-long-lines-tokens` (break only the long line; syntax tree / token
sequence compared before and after), `split-long-templates`. Left long: icon paths, regexes, email HTML,
guard-pinned text, one-component files with nothing movable. ⚠️ Full Prettier on long-line files pushed
~125 files past 300 lines — the tools re-print only the long line.

**Phase 2 — typed contracts: string patterns 1,153 → 3.** `rpc<Req, Res>('cmd')` in
`packages/shared/src/microservices/contracts`; `pattern()`, `sendRpc()`, `this.call()`; `callerOrgId()`;
`tools/rpc-ratchet.mjs` (+ gateway spec). Proved by every API suite and 8 live e2e scripts.

### Mismatches the types exposed — kept as they are, marked in place, decisions for the user
1. ⚠️ **Scope gap:** `get_technician_assignments` (`/employees/:id/assignments`) ignores the
   `scopeSpaceIds` the gateway sends — a viewer scoped to one workspace sees the member's assignments
   in every workspace.
2. Sent but never read: `approval_route` decideKey/orgWide; `dispatcherId` on three tracking reads;
   `portalId` on `create_invitation` from customer/portal routes; `trackingSpaceIds` on
   `get_technician_detail`.
3. Query strings arrive where numbers are declared: `chat.history` limit, `support.list` page/limit.
4. Unchecked values: analytics run/save `definition` (the engine still refuses unknown datasets/fields);
   platform support `inbox.view`, `setStatus.status` raw strings; `addMessage` authorId/body may be
   null/missing; support and shift-issue attachments may lack file size/key.
5. Service DTOs that were missing fields the service read through casts (now declared):
   `ListEmployeesDto.scopeSpaceIds`, `GetEmployeeDetailDto.viewerSpaceIds/canViewTracking`,
   `UpdateMemberProfileDto` (11 fields), task history `startDate/endDate`.

**Phase 2b — notification events: string event names 215 → 1** (`event()`, `emitEvent()`, `eventPattern()`).
Found, kept, for the user:
6. ⚠️ **Likely lost notification:** `task_comment_added` is emitted (`task-activity.service.ts`) but nothing
   listens — the handler is `comment_added`.
7. ⚠️ join_request_approved / _rejected read `userName`, which the gateway never sends.
8. Read but maybe missing: chat_message `organizationId` on SYSTEM lines; worker_location_updated /
   presence_changed `organizationId`; invitation_created `invitationCode` may be null.
9. ~20 events send fields no handler reads (typed `SentNotRead<…>`; list in contracts/events-*.ts).

**Phase 3 — API performance (local, 44 route/role pairs).** Most routes 10–60 ms, few queries; the hot tables
already have matching indexes. Fixed: the clock-out sheet resolved workspace workflows one query each →
two queries (~27 → ~15 statements, p50 200 → 106 ms). Not fixed (design changes, for the user): the
approvals inbox reads each kind's own route (~100 statements; by design); calendar rules read the
organization/workspace/holidays ~3× per request.

**Phase 3 — web page load** (`tools/video/page-load-check.ts`). All main pages within the ≤ 8 first-second budget
except tasks for a manager (9: the role summary above the list — deferring it would make the list jump).
Fixed: workspaces 22 → 6 first-second requests, 409 → 231 kB; calendar 303 → 227 kB. For the user: Settings
(297 kB) could lazy-load each section, but each would show a brief skeleton the first time — a visible change.
Duplicate refreshes on chat/team are the socket catch-up and are deliberate.

**Phase 4 — UI pieces and repeated logic.** Merged only what renders/behaves identically: web ChoiceChip (5),
EmptyNote/PageNotice/DashedEmptyBox (15); phone toneColor (16), LoadingLine (14), NotAllowed (2), sheet primitives
into amazen (105 importers); logic hashCode, read receipts, presence wording, pagination meta, 5 date sites.
Variants that differ: `docs/design/ui-pieces/variants.md`, `variants-phone.md`, mockup
https://claude.ai/artifact/Gs8d8fBoMYVKa2rkQpxNVk. Left on purpose (they differ in behaviour): 14 hand-built
names (`personName` would drop "null"), phone hand-rolled refresh ×18 (each handles 401/dedupe differently),
task invalidation copies (different key sets), legacy COLORS (fixed hex vs themed tokens).
