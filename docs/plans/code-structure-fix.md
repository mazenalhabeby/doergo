# Fixing the code structure — step by step

> Written 2026-10-20 from a read-only audit of the API, web, phone and shared package.
> Nothing has been changed yet. Every step below changes **structure only**: behaviour, API responses,
> database tables and phone/web screens stay exactly the same unless a step says otherwise.

## Where we are

| Part | Verdict | The main problem |
|---|---|---|
| API | mixed | One database schema shared by every service; services write each other's tables; giant modules (attendance 44 services, documents 32, tasks 30) |
| Web | mixed | 336 files cut up only to pass the 300-line rule; old routes still linked; three names for one thing |
| Phone | mixed | `components/` holds 61 % of the code incl. screens; two design systems; 47 screens bypass the offline queue |
| Shared | mixed | Server and client code split by two hand-kept lists that already drifted; the phone ships admin code; no tests of its own |

**One root cause:** the 300-line rule was met by *moving* code into numbered pieces
(`member-profile-page-detail3.tsx`, `events-1…5.ts`, `*-view-view.tsx`) instead of redesigning it.
**One habit to stop:** naming the same thing three ways (locations / spaces / workspaces, technicians / employees / members, customers / clients).

## Rules for the whole plan

1. **One step = one pull request**, small enough to review in an hour. No "big bang" branch.
2. **Behaviour never changes in a structure step.** All tests green, `pnpm size:check`, the e2e scripts in `tools/` that touch the area, and a click-through of the screens touched.
3. **Database:** no table or column is renamed or dropped. Moving the schema file is not a migration.
4. **No deploy per step** — batched, as always, until you say "deploy".
5. **Fix the rule that caused it first** (Phase 0), so the problems can't come back while we fix them.
6. Work on a branch per phase (`refactor/structure-p0`, `-p1` …), merged to `main` step by step.

---

## Phase 0 — Guardrails first *(≈ 2 days)*

> **Status (2026-10-20): DONE on branch `refactor/structure-p0`.** Baseline that day: 588 files with
> split names (557 carry the "moved here unchanged" note, 24 numbered, 35 -part, 23 repeated, 9 -inner),
> **3 import loops** (task-service tasks — 13 files; calendar-rules ⇄ cover; web `i18n/index` ⇄
> `languages`), **0** server imports reachable from `shared/client` (365 files walked), unused keys
> web 1,524 · phone 915. 0.3 uses our own import-graph walker (`tools/structure/graph.mjs`) rather
> than madge — no new dependency, one second for the whole repo.

So nothing new gets worse while we fix the old.

| # | Step | Done when |
|---|---|---|
| 0.1 | **Size rule allows a justified exception.** A file may go over 300 lines with a one-line `// size-exempt: <reason>` comment that a reviewer accepts. Stops the urge to cut files into meaningless pieces. | `tools/size-ratchet.mjs` reads the marker; documented in CLAUDE.md §14 |
| 0.2 | **Ban mechanical names for NEW files:** a check fails on new files ending in `2/3/…`, `-part(s)`, `-inner`, a repeated word (`-view-view`), or a new "moved here unchanged" comment. Existing ones are listed in a baseline that may only shrink. | `pnpm structure:check` in CI, baseline committed |
| 0.3 | **Cycle check:** add `madge` (or `dpdm`) for `packages/shared` and each API service. | runs in CI, current cycles listed |
| 0.4 | **Shared client boundary check:** walk the import graph from `packages/shared/src/client.ts` and fail on `@nestjs/*`, `@prisma/*`, `class-validator`, Node built-ins. | spec in `packages/shared` |
| 0.5 | **Unused translation key check** for web + phone. | report + baseline, may only shrink |
| 0.6 | **Glossary:** one page that fixes the words (see Phase 1). | `docs/glossary.md` |

---

## Phase 1 — One name per thing *(≈ 4 days, low risk)*

> **Status (2026-10-20): 1.1–1.4 DONE on branch `refactor/structure-p1`** (5 commits, not merged, not deployed).
> 1.2: `/employees/availability` → `/schedule`, `/employees/new|leave-opening` → `/members/…`, 7 redirect-only
> pages deleted, old paths are 308s in `next.config.ts`. 1.3: audit log is a Settings section;
> `/customers/[id]` → `/clients/[id]`. 1.4: gateway `technicians` → `members`; gateway + task-service
> `locations` → `spaces` (HTTP routes and message patterns unchanged). Task-service `technicians`
> deliberately left for Phase 4 (it is leave/cover/availability — split by meaning, not renamed).
> **1.5 waits** for a phone build that no longer reads the old i18n namespaces.

Decide once, then rename **code**, never database tables (Prisma `@@map` keeps the table names).

| Concept | The one word | Today also called |
|---|---|---|
| A place / team people work in | **Workspace** (code: `space`) | location, CompanyLocation, space |
| A person in the organization | **Member** | technician, employee, worker, people |
| A company you work for | **Client** | customer |

| # | Step | Done when |
|---|---|---|
| 1.1 | Write the glossary and get your OK on the three words. | `docs/glossary.md` approved |
| 1.2 | **Web routes:** move the 7 redirect pages (`/employees`, `/employees/[id]`, `/schedule`, `/profile`, `/sprints`, `/task-types`, `/join-requests`) into `next.config.ts` real redirects; delete the folders; point the menu, bell and ⌘K at the real pages. | no link to an old route left (`grep`), redirects return 308 |
| 1.3 | **Web:** one audit-log entry point; `/customers/[id]` → `/clients/[id]` (redirect kept). | one route per page |
| 1.4 | **API modules:** gateway `technicians` (served at `/employees`) → `members`; task-service `technicians` + `members` merged by meaning; `locations` modules → `spaces`. Old URLs stay as aliases for the installed phones. | modules, file names and i18n namespaces use the glossary words |
| 1.5 | **Phone + i18n namespaces** follow (`technicians` namespace → `members`). Old keys removed only after 1.4 ships to both stores. | no old word in new code (check in 0.2) |

---

## Phase 2 — The shared package *(≈ 5 days)*

> **Status (2026-10-20): DONE on branch `refactor/structure-p2`** (4 commits, on top of p1, not merged, not deployed).
> 2.1/2.2: `server.ts` + `@hbcfield/shared/server`; `index.ts` is exactly client + server (a structure check
> keeps it so); the root still exports every original name, plus 23 the old list had dropped.
> 2.3: contracts by subject (`events-*`, `task-service-*`, `auth-service-documents-*`); the `'../../index'`
> type loop removed; numbered file names 24 → 11. 2.5: one shared `isSameDay`; the unused en-US
> `formatTime` removed — the three formatTime helpers in use show different things and stay (merging
> them is a visible change). 2.6: shared has its own jest project, 33 specs moved in (544 tests), CI runs it.
> **2.4 measured and folded into 6.5:** the phone uses portalAdmin, spacePortal and billing from the
> "web" table, and without Metro tree-shaking a ~1,100-line table is a rounding error next to what
> `client.ts` already carries — the real win is tree-shaking.

| # | Step | Done when |
|---|---|---|
| 2.1 | **Split server code out:** `@hbcfield/shared/server` (Nest guards, decorators, Prisma, queues, storage, mail sending, crypto). `client.ts` becomes the default; `index.ts` = client + server. | 0.4 passes; apps import server code only from `/server` |
| 2.2 | **Generate `client.ts`** from the folder list instead of keeping it by hand (the two lists already drifted). | one source of truth |
| 2.3 | **Regroup `microservices/contracts` by domain** (`events-1…5`, `task-service-1-misc-1/2` → `contracts/attendance.ts`, `contracts/documents.ts` …) and remove the `'../../index'` imports (the one cycle). | 0 cycles in 0.3 |
| 2.4 | **Endpoint table split:** `http/endpoints/web` and `platform-admin` behind their own subpaths, so the phone stops bundling them. | phone bundle smaller (measure before/after) |
| 2.5 | **Remove copies:** shared `formatTime` becomes locale/12-24h aware, `isSameDay` moves in, apps re-export the shared `User`/`Task`/`Comment` types instead of redefining them; delete phone shims `lib/api/envelope.ts`, `path.ts`. | jscpd still 0; types come from one place |
| 2.6 | **A test project inside shared** for the pure rules (counted time, billing, holidays, access). | `pnpm --filter shared test` runs in CI |

---

## Phase 3 — Data ownership *(≈ 2–3 weeks, the biggest risk — careful)*

Today it is a "distributed monolith": one 6,145-line schema in auth-service, used by everyone.

| # | Step | Done when |
|---|---|---|
| 3.1 | **Ownership map:** for each of the 124 models, which service owns it (writes it). | `docs/data-ownership.md` approved |
| 3.2 | **Move the schema** to `packages/db` (schema + migrations + ONE `PrismaService`). Dockerfiles stop copying `auth-service/prisma`. No migration, no table change. | all services build from `packages/db`; the 3 identical `prisma.service.ts` copies deleted |
| 3.3 | **Stop cross-service WRITES first** (they are the dangerous ones): task-service → `user`, `organization`; auth-service → `locationHistory`. Each becomes an RPC to the owner. | a check fails on a write to a model the service doesn't own |
| 3.4 | **Then cross-service READS:** replace direct reads (task-service reads `user` 219×) with a small read helper per owner (cached), one area at a time. | allowed-read list shrinks to zero, step by step |
| 3.5 | **Rename `auth-service` → `core-service`** (it holds clients, invoices, documents, billing). Containers, compose, nginx and logs change — done as its own deploy with a rollback tag. | names match what the services do |

> **Status (2026-10-21): 3.1–3.3 DONE on branch `refactor/structure-p3`** (not merged, not deployed).
> - **3.3** writes: 16 → 0 cross-service writes (groups A–F, `docs/data-ownership.md`); the agreed exceptions
>   are listed in `tools/structure/ownership.mjs` with their reasons. New migration
>   `20261021090000_task_routes` (additive, safe to re-run).
> - **3.2** schema: `packages/db` holds schema, migrations, seeds (`pnpm db:*`); ONE PrismaService (shared) —
>   task-service had been running two pools. No pool changed size (`PRISMA_CONNECTION_LIMIT=10` kept for
>   notification-service in compose). All five images built locally; the auth image's start-up migrated a
>   copy of the local database from the new path. ⚠️ **Deploy note:** the auth entrypoint, the release
>   script and CI read `packages/db/prisma`; `infra/release/deploy.sh` still finds an older commit's
>   migrations under auth-service for a rollback.
> - **3.4** reads: DONE 2026-10-22 — direct cross-service reads 269 → 0 (owner readers in `packages/shared/src/data`); relation reads (`include`) and raw SQL are the next layer.
> - **3.5** rename: SKIPPED for now by the owner (2026-10-22) — the name is cosmetic, the risk is in production naming. Revisit as its own release.

---

## Phase 4 — Split the giant API modules by meaning *(≈ 2 weeks)*

Each becomes a folder of real Nest sub-modules with their own providers and tests — not a facade with "-parts" lists.

| # | Module | Splits into |
|---|---|---|
| 4.1 | **tasks** (30 services) | records · assignment & role pool · crew · checklist · report — and the `forwardRef(() => require(...))` cycle disappears |
| 4.2 | **attendance** (44 services, 13.9k lines) | clock · rests · extra time & overtime · no-shows · automatic clock · reports & exports |
| 4.3 | **documents** (32 services) | catalogue & types · issuing · signing · templates · reading (OCR) · registers |
| 4.4 | **assets** (23 services) | register · custody · logbook · expenses · proposals |
| 4.5 | **Gateway:** one way to call services (`BaseGatewayService` + `SERVICE_NAMES`, no raw `ClientProxy` in 35 controllers); move `fetch` out of `geo.controller.ts`. | one call style |
| 4.6 | **notification-service:** the 27 handlers and root controller into `modules/`; task-service `common/` business logic (approval rules, routing) into feature modules. | `common/` holds only plumbing |
| 4.7 | **Tests** for the untested modules: epics, phases, sprints, approvals, custom fields, blog, search, space sharing. | each has at least its rules covered |

> **Status (2026-10-22): 4.1–4.7 DONE on branch `refactor/structure-p3`** (not merged, not deployed).
> - 4.1–4.4: tasks (8), attendance (12), assets (6), documents (7) are real Nest sub-modules; `tools/di-check.mjs` proves DI per service.
> - 4.5: one `ServiceCalls` for every controller → service call; a service's 5xx text never reaches the client.
> - 4.6: notification-service handlers in `modules/events/<area>`; task-service `common/` holds only plumbing.
> - 4.7: rule specs for planning items (epics, phases), sprints + reports, custom fields, stand-ins, office-rule
>   admin, blog, space sharing, global search (117 tests). Two small hardenings found on the way: the blog
>   store refuses SVG like the gateway does, and a share-request list with no organization answers nobody.
> - ⚠️ The Phase 4 e2e scripts still have to run against a restarted `pnpm dev:api`.

---

## Phase 5 — Web app *(≈ 2 weeks, route by route)*

| # | Step | Done when |
|---|---|---|
| 5.1 | **One folder rule per route:** `page.tsx` + `_components/` + `_hooks/` + `_lib/`; no `use-*` in `components/`; the 66 loose files in `components/` sorted into domain folders. | written in CLAUDE.md, checked by 0.2 |
| 5.2 | **Merge the mechanical splits back by meaning**, worst first: the 11 numbered files, the 24 repeated names, the 101 sections that take the whole page state (`vm`) — each becomes a component with its own props. Use 0.1 exceptions for honest big pages. | "moved here unchanged" count falls from 336 toward 0 |
| 5.3 | **Shared reads as hooks:** roles, clients, workflows, workspaces — one hook each, one refresh time (today 9 copies each). | `getRoles` etc. called from one hook |
| 5.4 | **One control each:** the date picker everywhere (42 raw date inputs), one person row (3 today), every delete through `ConfirmDialog`. | no raw `type="date"` in pages |
| 5.5 | **Components shared by `/clients`, `/portals`, `/locations`** move to `components/<domain>` (no route imports another route's private folder). | 0 cross-route `_components` imports |
| 5.6 | **i18n:** delete the 7 dead groups and stale fr/it keys; marketing text in its own lazy namespace. | unused-key baseline shrinks |

> **Status (2026-10-22): 5.1 DONE on branch `refactor/structure-p3`** (not merged, not deployed).
> 190 files moved, no line of logic changed: the 66 loose files of `components/` into domain folders
> (`common/`, `app-shell/`, `notifications/`, `command-palette/`, `custom-fields/`, `spaces/`, and the
> existing `tasks/`, `attendance/`, `permissions/`, `map/`, `top-navbar/`, `people/`); 124 route pieces into
> their route's `_components/`, `_hooks/`, `_lib/`. The rule is in CLAUDE.md §15 and enforced by the
> structure ratchet (`tools/structure/web-layout.mjs`, baseline empty). `tools/move-ts.mjs --alias=@/`
> rewrites the web app's alias imports; `readFolder()` (test-utils) reads a route as one screen.

> **Status (2026-10-22): 5.2 DONE on the web app** (same branch, not merged, not deployed). Every section that took
> the whole page state (`vm`) — 90 of them — now takes the props it reads, with a name by meaning; the mega-hooks
> are gone or split by what they hold. Web split names: numbered 11 → 0, repeated 16 → 0, inner 7 → 0, part 15 → 1
> (`name-parts.ts` really is a person's name parts), "moved here unchanged" 338 → 23 (left: `lib/api/*` and a few
> `lib/` helpers whose names already say what they are). Small, deliberate differences: the reports nav button is a
> stable component (it remounted on every render); the invoice billable-work rows' open state lives in that table
> (switching the source away and back closes them); the access editor's role-only mode no longer fetches contacts.

> **Status (2026-10-22): 5.3 DONE.** One hook per shared read, one refresh time each: `useOrgRoles(scope)` (5 min),
> `useWorkflows()` (2 min; `useOrgWorkflow` reads through it), `useClients(params)` (1 min); workspaces already had
> `useSpaceDirectory`. 26 call sites moved (they had drifted to 1, 2, 5 minutes and none). Guard:
> `src/__tests__/shared-reads.spec.ts` — each read has exactly one caller.

> **Status (2026-10-22): 5.4 DONE.** Dates: every native `type="date"` (~40 fields, 26 files) and the six hand-built
> Popover+Calendar copies use `components/ui/date-picker.tsx` (which gained `min`/`max`, `aria-label`, `title`,
> `triggerClassName`, `autoFocus`, and loads the month grid on first open). Deletes: the five browser `confirm()`s go
> through `ConfirmDialog` (two printed English to everyone). Person rows: the Assign dialog's row and the add-contact
> row are `PersonPickRow` (optional avatar, disabled). Guards: `one-date-picker.spec` (no native date input, the
> inline-copy list is empty), `one-confirm.spec`. Kept on purpose, a decision for the owner: the New Task dialog's
> custom DATE field still sends local midnight as an instant (the task page sends `YYYY-MM-DD`); the report builder
> still stores `from` as UTC midnight and `to` as local end of day.

> **Status (2026-10-22): 5.5 DONE.** Cross-route imports of a private folder: 15 → 0. 47 files moved into
> `components/<domain>`: the New Task dialog with its whole `create-task/` folder and the recurring-task views
> (`components/tasks`), the workspace Customers/Assets/Portal tabs and the pieces they need (`components/crm`,
> `components/assets`, `components/portals`), attendance's add-attendance/overtime dialogs and helpers, the invoice
> workbench shell (shared with the job report), three skeletons, the address map, and two marketing pieces. The
> structure ratchet now fails on any new cross-route import (`tools/structure/web-layout.mjs`).

> **Status (2026-10-22): 5.6 DONE.** Dead text: 8 groups no source reads (`landing`, `joinRequests`, `profile`,
> `download`, `attendanceReview`, `payments`, `liveMap`, `welcome` — 171 keys × 5 languages) and 9 stale fr/it keys
> (`locations.deactivate*`, gone from English) deleted; unused-key count 1524 → 1353 (`privacy`/`terms` only LOOK unused —
> read through `t(`${ns}.…`)`). Marketing text: `home`, `pricing`, `privacy`, `terms` moved to
> `i18n/locales/marketing/<lang>.json`; a public page's server render passes its English groups to `<MarketingCopy>`
> (registered before render, so SSR and hydration agree), other languages load on demand (`wantMarketing`). The four
> store-badge strings the app shell shows became `storeBadges.*`. Measured on a production build: the app's English
> catalogue chunk is 344 KB (the JSON fell 482 → 418 KB); no raw keys in the prerendered `/`, `/de`, `/pricing`,
> `/privacy`, `/terms`, `/blog`.

---

## Phase 6 — Phone app *(≈ 2 weeks; JS-only, OTA-safe except where noted)*

| # | Step | Done when |
|---|---|---|
| 6.1 | **Feature folders:** `src/features/<domain>/` (screen + hooks + parts together); merge `src/home` with `components/home`; fold `src/screens/*` in; `components/` keeps only shared UI. | `components/` < 25 % of the code |
| 6.2 | **Every write through the offline queue** (`useQueuedWrite`), removing the 20 hand-written online/offline branches and 47 direct writes; fix `offline/` importing from `home/`. | one write path |
| 6.3 | **Finish the design-system move:** one `ScreenHeader`, `Ground` instead of `ScreenContainer`, the new theme tokens only. | old header, container and tokens deleted |
| 6.4 | **`@/` alias** instead of `../../../` (81 files); kebab-case `use-*.ts` names. | consistent imports |
| 6.5 | **Smaller bundle:** Metro tree-shaking on, with 2.4. ⚠️ Metro config is native-adjacent — ship in a store build, not an OTA. | bundle size measured before/after |

> **Status (2026-10-22): 6.1 DONE on branch `refactor/structure-p3`** (not merged, not deployed, no OTA). 448 files moved
> into `src/features/<domain>/` (30 features: home — `src/home` merged in —, job, jobs-list, new-job, time, customer,
> chat, calendar, documents, equipment, route, onboarding, auth, app-shell, app-update, …); `src/screens/*` folded into
> their features; `components/` keeps shared UI only (the design system `amazen`, glyphs, sheets, pickers, scanners,
> signatures) — **10 %** of the code (was 52 %). `tools/move-ts.mjs --alias=@/=src/` resolves the phone's alias. Guards
> that read files by path follow them; the mobile suite also caught two web renames from Phase 5 (supply-document
> dialog hook, the radius readout) and the key `attendance.rest.unpaid` (now `notCounted` — the text never said
> "unpaid"). Metro export (Android) bundles: 11 MB — the 6.5 "before".

> **Status (2026-10-22): 6.2 DONE (one write path).** Every hand-written `if (offline.engine) … else …` write now runs
> through `useQueuedWrite().run(queued, direct)` (+ `keepCreated()` for creates that mint an id,
> `useOwnProfileWrite()` for the member's own settings): job status, crew, comments, files, decline, resume, handover,
> New job + photos, credential photo, issues, expenses, logbook, proposals, time-off cancel, presence, time format,
> clock-in pick, language, work log. `ENGINE_FALLBACKS` 21 → 13 files; what stays is a multi-call upload-then-submit
> block inside a `run` (the guard counts its last call) or not a queue shape (chat photos, multi-page papers, the
> portal's profile). `offline/` no longer imports a feature (the remembered-answers store is `lib/remember/`;
> guard `offline-boundary.spec`). Kept exactly as before, worth knowing: a few writes already differed between the
> two modes (issue reply trimmed only when direct; direct expense/log/proposal submit even if the photo failed; a
> direct work-log failure falls into the legacy local queue).
>
> ⚠️ **Decision needed — ~47 writes to routes the queue has no operation for** (would need a server sync op each).
> Candidates a member makes in the field: checklist tick/owner, custom-field values, deleting a job photo, snoozing
> a rest, deleting a work-log note, withdrawing one's own issue / asset proposal / log entry, chat edit/remove,
> calendar respond/snooze, notification preferences. Online by nature (leave as is): take/return a role job (a queued
> take would promise a place somebody else got), office edits/assign, approvals and stand-ins, attendance
> corrections, rota, register hand-overs, signing documents, invitations/members, onboarding/auth/account,
> telemetry (heartbeat, excursions, location), push tokens.

---

## Order, size and what you get

| Phase | Size | Can start | You get |
|---|---|---|---|
| 0 Guardrails | 2 days | now | nothing gets worse from here on |
| 1 Names | 4 days | after 0 | one word per thing, no dead routes |
| 2 Shared | 5 days | after 0 | clean server/client split, smaller phone app |
| 3 Data ownership | 2–3 weeks | after 2 | services that can change without breaking each other |
| 4 Giant modules | 2 weeks | after 3.2 | attendance/tasks/documents readable and testable |
| 5 Web | 2 weeks | after 1 (parallel with 3–4) | pages made of real components |
| 6 Phone | 2 weeks | after 2 (parallel with 3–5) | screens in feature folders, one write path |

**Total ≈ 8–10 weeks of focused work**, with 5 and 6 able to run beside 3 and 4.
**Suggested start:** Phase 0 + 1.1 (the glossary) — two days, no risk, and every later step builds on them.

## Decisions needed from you

1. The three words: **Workspace / Member / Client** — or others?
2. May the size rule allow a written exception (0.1)? Without it, Phase 5 and 6 cannot undo the mechanical splits.
3. Rename `auth-service` → `core-service` (3.5) — yes, or keep the name and only fix ownership?
4. Order: guardrails + names first (recommended), or data ownership first?
