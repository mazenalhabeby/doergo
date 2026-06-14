# HBCField — Founder Audit, Feature & Business Report

*Prepared for the founder · Synthesizes a full code audit (7 domains) + product/GTM analysis · 2026-06-13*

---

## 1. Executive Summary

- **What it is.** HBCField is a multi-tenant, role-based **field-service management (FSM) platform**: a Next.js web app for admins/dispatchers, an Expo/React Native mobile app for field workers, and a NestJS microservice backend (auth, task, notification, tracking) behind an API gateway, using Redis transport + BullMQ, Prisma + PostgreSQL/PostGIS, Socket.IO, and S3 storage.

- **Maturity: strong execution skeleton, missing commercial engine.** The product nails the *internal job-execution* half of FSM — task lifecycle, multi-assignee dispatch, GPS route tracking, geofenced attendance, schedules/time-off, service reports with parts/signatures, asset maintenance history, agile project layers, custom workflows/fields. That is roughly **60-70% of the "do the work" side** of an FSM product.

- **Biggest structural gap (business).** There is **no way to charge anyone.** No subscription/plan/seat-metering/Stripe layer for tenants, and the existing `Invoice` model (for a tenant's *own* customers) is inert — no UI, no payment processor, and no foreign key linking invoices to the work that was done. **Revenue is structurally impossible today.**

- **Biggest correctness/security risk: a half-applied migration.** An unfinished **role + platform→module / workMode→enabledModules migration** left live defects that break core screens and leak data: the dispatcher live map filters on the dead `TECHNICIAN` role so **no post-migration worker ever appears**; **cross-tenant IDOR** on tracking endpoints; **privilege escalation** via `canManageUsers`; **plaintext invitation/join codes** stored beside their hashes; and the web task list **only filters the current 20-row page**. These break exactly the screens a prospect sees in a demo.

- **Biggest product opportunity.** A genuinely differentiated combination — universal task assignment + real-time GPS + geofenced attendance + service reports + agile project management in one platform — that no single incumbent (ServiceTitan/Jobber/Housecall Pro) bundles. But it is undermined by the missing **customer-facing revenue funnel** (CRM → quote → schedule → invoice → pay → review).

- **What it would take to be sellable.** Three gates, in order: **(1)** make it chargeable + close tenant-isolation/privilege-escalation/credential holes; **(2)** fix the demo-breaking correctness bugs from the migration; **(3)** build the commercial layer (CRM, quoting, working invoicing/payments) plus the dispatch board and customer comms that define the category.

- **Bottom line.** This is a well-built internal field-ops tool that is **one stabilization pass and one commercial layer away** from being a competitive FSM SaaS. Every GTM dollar spent before the "Now" tier below is fixed will leak.

---

## 2. Feature Overview

Legend: ✅ complete · 🟡 partial · 🔵 stub · ❌ broken/effectively broken

### Authentication, Roles & Permissions
| Feature | Status | Notes |
|---|---|---|
| JWT login/register/refresh, token rotation, account lockout, password reset | ✅ | bcrypt cost 12 in app (seed uses 10 — see audit) |
| Role-based access (ADMIN/MANAGER/EMPLOYEE + legacy CLIENT/DISPATCHER/TECHNICIAN) | 🟡 | Half-applied rename; legacy values still live, normalization inconsistent |
| Granular permissions (canCreateTasks, canViewAllTasks, canAssignTasks, canManageUsers) | 🟡 | Enforced at gateway, but privilege-escalation hole (see Critical) |
| Custom per-org roles (`OrgRole`) | ❌ | Modeled + UI exists, but permissions never bridged into the guard → grants nothing |
| Platform access control (WEB/MOBILE/BOTH) | ❌ | Documented + seeded, but `User.platform` column dropped; helpers never existed |
| Multi-tenant org delegation (`OrganizationAccess`) | ✅ | Data model present (not monetized) |

### Task Management & Execution
| Feature | Status | Notes |
|---|---|---|
| Task CRUD + lifecycle (DRAFT→…→CLOSED) | ✅ | But `Task.status` is a free-form string, not an enum (see High) |
| Multi-assignee (`TaskAssignee` LEAD/MEMBER) | 🟡 | Coexists with legacy single `assignedToId` — split-brain, untested |
| Comments, attachments (S3 presigned), activity timeline | ✅ | Duplicate `get_comments` handler creates an IDOR risk (see High) |
| Checklists, subtasks (max depth 5), dependencies | 🟡 | Depth/limits enforced in app only, not DB |
| Service reports (parts, signatures, before/after photos) | ✅ | Strong; not linked to invoicing |
| Web task list (tabs / search / filters) | ❌ | Filters only the current 20-row page — core screen looks broken above 20 tasks |
| Kanban / timeline / calendar views, command palette | ✅ | |

### Workforce, Attendance & Scheduling
| Feature | Status | Notes |
|---|---|---|
| Clock in/out with geofence validation, breaks | ✅ | Non-atomic clock-in can create duplicate active shifts (see Medium) |
| Weekly schedules, time-off approval workflow | ✅ | |
| Availability calculation (schedule + time-off + tasks) | 🟡 | Filters on raw `EMPLOYEE` role → legacy workers excluded |
| Overtime request/approval state machine | ✅ | |
| Company locations ("spaces") with geofence, enabledModules | ✅ | Terminology drift: `CompanyLocation` vs "space" |

### Real-time, Tracking & Notifications
| Feature | Status | Notes |
|---|---|---|
| GPS location update + route history (Haversine distance) | ✅ | Non-transactional writes corrupt `routeDistance`; no coordinate bounds |
| Dispatcher live map (worker markers, route polylines) | ❌ | Filters on dead `TECHNICIAN` role → **shows no post-migration workers** |
| Socket.IO realtime (task/location/activity events) | 🟡 | Trusts client-supplied org/role → cross-tenant leak risk |
| Push notifications (Expo/FCM) | ✅ | Channel routing misroutes some attendance events to "tasks" |
| Transactional email (Nodemailer) | 🟡 | No plain-text fallback; hardcoded `secure:false` SMTP bug |
| Customer-facing SMS / comms | ❌ | Does not exist |

### Project Management (Agile)
| Feature | Status | Notes |
|---|---|---|
| Epics, Sprints, Phases, story points, sprint reports/velocity | ✅ | Backend complete; gateway modules partly stub |
| Custom fields, custom status workflows | ✅ | Org-level extensibility present |
| Recurring task templates | ✅ | Internal automation (not customer-facing recurring revenue) |

### Onboarding, Invitations & Org Management
| Feature | Status | Notes |
|---|---|---|
| 3-path mobile onboarding (create org / join by code / invitation) | ✅ | |
| Invitation codes (SHA-256 hashed) | 🟡 | **Plaintext code also stored** beside hash; `enabledModules` silently not persisted |
| Join requests + admin approval | ✅ | OPEN-policy auto-join not transactional |
| Org members management (role/permission edit, remove) | ✅ | But privilege-escalation hole (see Critical) |
| Org settings, join code regeneration | ✅ | Join code stored in plaintext |

### Monitoring, Billing & Assets
| Feature | Status | Notes |
|---|---|---|
| Activity logs, daily metrics, alerts, health metrics | ✅ | Data collected but **not surfaced** in any dashboard |
| Asset management (categories, types, maintenance history) | ✅ | Not tied to a customer-owned site |
| Invoicing (Invoice/InvoiceItem models) | 🔵 | Models exist; **no UI, no payments, no FK to tasks** |
| Customer/CRM entity | ❌ | No first-class Customer or Property entity — free-text only |
| Quoting / estimates | ❌ | Does not exist |
| SaaS subscription billing (charge the tenant) | ❌ | Does not exist |

### Web & Mobile Apps
| Feature | Status | Notes |
|---|---|---|
| Web: dashboards, tasks, employees, members, locations, invitations | ✅ | Tokens in localStorage (XSS-exfiltratable); debug panel ships to prod |
| Web stub pages: assets, overtime, payments, invoices, sprints, schedule | 🔵 | Placeholders |
| Mobile: role-based tabs, task execution, attendance, time-off, onboarding | ✅ | Legacy CLIENT role breaks admin home for legacy admins |
| Mobile: offline support | 🔵 | Infrastructure only — all requests fail offline |
| i18n (en + de) | 🟡 | Docs claim en/ar; code ships en/de — drift |

---

## 3. Architecture Snapshot

The API Gateway (NestJS, port 4000, `/api/v1`) is the single entry point and routes to four microservices — **auth-service**, **task-service**, **tracking-service**, **notification-service** — over Redis-based RPC, with **BullMQ** providing exactly-once semantics for write operations and direct message-pattern calls for reads. A shared package (`packages/shared`, 47 TS files) holds the canonical enums, guards, Prisma service, queue config, constants, and utilities to keep the services DRY. Data lives in **PostgreSQL/PostGIS** (40+ Prisma models) with **Redis** for cache + queues; realtime is **Socket.IO** (notification-service, port 4001); files use **S3-compatible** storage via presigned URLs. The gateway runs a 5-layer global guard pipeline (Throttler → JwtAuthGuard → RolesGuard → OnboardingCompleteGuard → PermissionsGuard). The main structural weakness is that **every authenticated request makes an uncached `validate_token` RPC + DB user read**, making auth-service/Postgres the platform-wide bottleneck under load.

---

## 4. Code Audit

> **The half-applied migration — read this first.** A rename of roles (`CLIENT/DISPATCHER/TECHNICIAN` → `ADMIN/MANAGER/EMPLOYEE`) and a feature refactor (`platform` → `enabledModules`, `workMode` → `enabledModules`) were started but never finished. The DB enum still carries both role sets; some services normalize roles and others compare raw strings; the `WorkMode` enum and `User.platform` column were dropped by migration but still referenced in schema/types/docs. The result is **"type lies"** — fields and types that look authoritative but are inert or wrong at runtime — plus several **live authorization and correctness breaks**. This single unfinished migration is the root cause of the two Critical findings, three of the High findings, and most of the "type lie" Mediums below.

### 🔴 Critical

**C1. Live map shows no workers post-migration (dead-role filter)**
- *Location:* tracking-service `getActiveWorkers()` (`location` service), filter `user.role === 'TECHNICIAN'`.
- *Why it matters:* Field workers are now created with role `EMPLOYEE`; only legacy seed rows are `TECHNICIAN`. The dispatcher live map therefore shows **zero real workers** — a core feature outage and an instant "the product is broken" moment in any demo.
- *Fix:* Normalize roles at the service boundary (use `normalizeRole()` / `isEmployee()` from shared) and filter on the normalized value, not a raw string. Audit every raw-role query (attendance `clockIn` role check, `getAvailability`, overtime leader lookup, stats access control).

**C2. Cross-tenant IDOR on tracking endpoints**
- *Location:* `tracking.controller.ts:45-88` passes `organizationId`, but `location.controller.ts:26-44` handlers (`get_worker_location`, `get_worker_history`, `get_worker_current_route`, `get_task_route`) never scope by org.
- *Why it matters:* Any user with `canViewAllTasks` in Org A can read another org's worker last-location, full GPS history, current route, and any task's route polyline by supplying a foreign `userId`/`taskId`. **A single demonstrable cross-tenant leak fails security review and kills B2B deals.**
- *Fix:* Add `organizationId` scoping to all singular tracking queries (as `getActiveWorkers` already does). Reject mismatches with 403/404.

**C3. Privilege escalation via `canManageUsers`**
- *Location:* auth-service member-update path — `dto.role` written straight into `prisma.user.update`; gateway gated only by `@RequirePermission('canManageUsers')`.
- *Why it matters:* A non-ADMIN holding `canManageUsers` (e.g. a MANAGER, or any member granted the flag) can promote any member — including reciprocally themselves — to **ADMIN with full permissions**. Horizontal + vertical privilege escalation; an automatic fail on security review.
- *Fix:* Require the requester to be ADMIN to grant/modify the ADMIN role; enforce role-hierarchy checks (can't grant a role ≥ your own); validate permission keys against a schema. Also wire `OrgRole.permissions` into the guard or remove the feature.

### 🟠 High

**H1. `Task.status` is a free-form String, not an enum**
- *Location:* `schema.prisma` — `status String @default("NEW")`; the `Task` TS interface (`types/index.ts:295`) lies by typing it `TaskStatus`.
- *Why it matters:* No DB CHECK/enum/FK to `WorkflowStatus` — any string ('done', typos, mixed case) can be written. The app-level state machine is the only guard; any bypass corrupts the column with values the enum/`ACTIVE_STATUSES`/`TERMINAL_STATUSES` cannot interpret.
- *Fix:* Migrate to a native Prisma enum or add a CHECK constraint; reconcile with custom `WorkflowStatus`.

**H2. Dead `WorkMode` enum / `platform` field — schema drift (migration residue)**
- *Location:* `enum WorkMode` still in `schema.prisma`; migrations `20260504100000` and `20260506100000` dropped the column/type. `User.platform` dropped but `JoinRequest.assignedPlatform` still written & discarded; web/mobile types still declare `platform` as required.
- *Why it matters:* `prisma migrate dev` / CI drift checks will try to re-create the orphan enum; the generated client emits a `WorkMode` type nothing can use; documented WEB-only/MOBILE-only access **is not enforced anywhere** (a "WEB only" manager can log in on mobile).
- *Fix:* Remove `WorkMode` from schema, drop `platform` from types/DTOs or mark explicitly reserved, stop writing `JoinRequest.assignedPlatform`, regenerate the client.

**H3. Single `assignedToId` vs many-to-many `TaskAssignee` split-brain**
- *Location:* `schema.prisma:618` (`assignedToId`) coexists with `TaskAssignee` (`:656/:680`); no sync, seed only uses `assignedToId`.
- *Why it matters:* "Own tasks" means `assignedToId` in one service and `TaskAssignee` in another. A worker added only via `TaskAssignee` may be **invisible to queries filtering on `assignedToId`** — an authorization/visibility hazard, not cosmetic.
- *Fix:* Choose one model (recommend `TaskAssignee`), migrate data, keep `assignedToId` as a derived/legacy alias or remove it; centralize the "own tasks" predicate in shared code.

**H4. Duplicate `get_comments` MessagePattern → IDOR**
- *Location:* both `TasksController` and `CommentsController` declare `@MessagePattern({cmd:'get_comments'})` (`app.module.ts:56-57`). The `CommentsController` handler (`commentsService.findByTask`) does **no authorization and no org-scoping**.
- *Why it matters:* NestJS resolves duplicate patterns nondeterministically (last bound wins). If the unauthorized handler wins, any authenticated user can read comments on **any task in any org** by guessing IDs. The whole `CommentsModule` appears to be dead leftover code.
- *Fix:* Delete the dead `CommentsModule` (or its duplicate handler); keep the authorized `TasksController` path.

**H5. Inconsistent role enum handling splits authorization across services**
- *Location:* `auth.service.validateToken` returns `user.role` raw; `tasks.service` switches on `MANAGER/EMPLOYEE`, while `reports/attachments/assets` services switch on `DISPATCHER/TECHNICIAN`. **No single role value satisfies all four.**
- *Why it matters:* A freshly-onboarded `EMPLOYEE` is fine in `tasks.service` but hits a `default` ForbiddenException for reports/attachments (can't see their own task's report). A seeded `DISPATCHER` works for reports but gets empty status counts / denied access in `tasks.service`. **Live, reproducible authz break.**
- *Fix:* Normalize roles once at the gateway/token boundary so every downstream service sees canonical values; delete per-service role-switch duplication.

**H6. Web stores access + refresh tokens in localStorage; comments falsely claim httpOnly cookies**
- *Location:* `lib/api.ts` `setTokens()/getRefreshToken()`; comments at lines 231/236 claim a cookie scheme that does not exist (no `middleware.ts`, no cookie handling).
- *Why it matters:* Both tokens are JS-readable → any XSS yields the long-lived refresh token = **durable account takeover**. The false comments are the migration "type lie" misleading future devs.
- *Fix:* Move refresh token to an httpOnly, Secure, SameSite cookie with a server route; keep access token in memory; remove the misleading comments.

**H7. Refresh-miss path dumps all refresh-token hashes to logs + full-table scan**
- *Location:* auth-service `refresh()` — logs first 20 chars of incoming/new tokens; on miss runs `findMany` over the entire `RefreshToken` table and logs every hash/userId.
- *Why it matters:* Sensitive-data leak into logs (often shipped to 3rd-party aggregators) **plus** a full-table scan triggerable by anyone sending a bad refresh token = cheap DoS amplifier + log spam.
- *Fix:* Remove token material from logs; replace the diagnostic `findMany` with a single indexed lookup.

**H8. Rate limiting + login audit IP unreliable — Express `trust proxy` unset**
- *Location:* gateway global ThrottlerGuard keys on `req.ip`; app never calls `app.set('trust proxy', …)`; login records `req.ip || x-forwarded-for` (`auth.controller.ts:77`).
- *Why it matters:* Behind any proxy/LB, all clients share one throttle bucket → one abuser exhausts the 5/min login limit for everyone (account-wide DoS) and per-IP brute-force protection is gone; `X-Forwarded-For` is forgeable, poisoning the audit trail.
- *Fix:* Set `trust proxy` appropriately and derive client IP from the trusted forwarded chain.

**H9. Old refresh-token deletion relies on `setTimeout` — lost on restart/crash**
- *Location:* auth-service rotation cleanup (`setTimeout((grace+1)s)`); cron at `:864` only deletes by `usedAt`.
- *Why it matters:* A deploy/scale/crash within the grace window leaves used tokens reachable; combined with the session cap this orphans rows and weakens rotation hygiene. The timer also holds a `prisma` reference during shutdown.
- *Fix:* Delete synchronously after grace expiry via a durable job/cron, not an in-process timer.

**H10. Admin password reset does not invalidate the member's sessions**
- *Location:* auth-service `adminResetMemberPassword` updates only `passwordHash` (self-service `resetPassword` at `:840` deletes all refresh tokens).
- *Why it matters:* When an admin resets a compromised member's password to lock out an attacker, the attacker's existing refresh token **keeps working indefinitely**.
- *Fix:* Delete all of the member's refresh tokens on admin reset.

**H11. Plaintext invitation & org join codes stored beside their hash**
- *Location:* auth-service invitation/join — model persists plaintext `code`/`joinCode` alongside `codeHash`/`joinCodeHash`; `getJoinCode` returns plaintext. Comment claims "plaintext never stored."
- *Why it matters:* Hashing is defeated — a read-only DB compromise yields working codes (auto-join orgs / register accounts).
- *Fix:* Store only the hash; if a code must be displayed once at creation, return it in the create response and never persist plaintext.

**H12. `updateLocation` accepts arbitrary `taskId` with no ownership check**
- *Location:* tracking-service `updateLocation` — only checks `task.status === 'EN_ROUTE'`.
- *Why it matters:* Any authenticated employee can inject GPS points and inflate `routeDistance` on **another worker's/org's** task, corrupting the dispatcher route view cross-tenant.
- *Fix:* Verify the task is assigned to the caller and belongs to their org before writing.

**H13. Socket.IO `join_task` and `authenticate` trust client-supplied identity**
- *Location:* notification-service `handleJoinTask` (no task-org check); `authenticate` falls back to `payload.role`/`payload.organizationId` when the JWT omits them.
- *Why it matters:* Any authenticated socket can join an arbitrary task room (cross-tenant realtime leak of comments/status) or self-assign any role/org room.
- *Fix:* Derive identity strictly from verified JWT claims; verify task→org ownership before room join.

**H14. Location update = three non-transactional writes (race corrupts `routeDistance`)**
- *Location:* tracking-service `updateLocation` (upsert last-location → find task → find last point → create history → update distance).
- *Why it matters:* Two concurrent pings read the same `routeDistance` and last point, then both write `old+delta` → one increment lost (read-modify-write race).
- *Fix:* Wrap in a transaction and use an atomic `increment` for `routeDistance`.

### 🟡 Medium

| # | Title | Location | Why it matters / Fix |
|---|---|---|---|
| M1 | Seed hashes passwords at bcrypt cost 10, standard is 12 | `seed.ts` `bcrypt.hash(...,10)` | Weaker than `BCRYPT_COST_FACTOR=12`; DRY violation. Use the shared constant. |
| M2 | Email globally unique, not per-org | `schema.prisma` `email @unique` | Blocks one person belonging to two orgs; leaks tenant membership. Use `@@unique([organizationId,email])`. |
| M3 | `InvoiceItem.taskId/reportId` are loose strings, no FK | `schema.prisma` | Orphaned billing references; broken "jump to source task". Add relations + onDelete. |
| M4 | Several relations lack `onDelete` → opaque 500s on cleanup | `TimeEntry.location/.organization`, `OvertimeRequest.*`, `ServiceReport.organization` | Hard-delete of a location/org with time entries fails with FK restriction. Set Cascade/SetNull deliberately. |
| M5 | Three competing authz models with no bridge | User booleans vs `Role`+`DEFAULT_PERMISSIONS` vs `OrgRole.permissions` (untyped JSON) | Custom roles silently grant nothing; typos in JSON silently no-op. Merge `OrgRole` into the user object before `PermissionsGuard`. |
| M6 | Non-atomic clock-in → duplicate active shifts | task-service `clockIn()` (check-then-create, no unique index) | Double-tap/retry creates two `CLOCKED_IN` rows, inflating hours. Add partial unique index + transaction. |
| M7 | Divergent `checkTaskAccess` copies; reports blocks admins | reports/tasks/attachments services | ADMIN denied access to reports of tasks they didn't create. Centralize one `checkTaskAccess`. |
| M8 | Guards fail-open on missing user | gateway `PermissionsGuard`/`OnboardingCompleteGuard` `if(!user) return true` | Fragile; any guard-ordering change lets unauthenticated callers through. Fail closed like `RolesGuard`. |
| M9 | ADMIN can't `GET /users/:id` for others (MANAGER-only branch) | gateway `users` `findOne` | Org owner rejected; legacy roles also mis-handled (no `normalizeRole`). Fix the role check. |
| M10 | Push channelId via substring match misroutes attendance | notification-service | `auto_clock_out`, `geofence_alert`, `overtime_alert`, etc. go to "tasks" channel. Map type→channel explicitly. |
| M11 | WS `authenticate` trusts client role/org when token omits claims | notification-service | Self-assign any role/org room. Require claims in token. |
| M12 | Invitation `enabledModules` accepted but never persisted | auth-service `createInvitation` | Tab-visibility config silently lost (migration type-lie). Persist it / read it on accept. |
| M13 | OPEN-policy auto-join not transactional | auth-service onboarding | User onboarded but audit `JoinRequest` may be missing. Wrap in `$transaction`. |
| M14 | Public `validateOrgCode/validateCode` enable code enumeration | auth-service | Short codes brute-forceable for org names / auto-join. Add throttle + generic responses. |
| M15 | Dead/unenforced fields in every token payload | `taskCreationScope`, `scheduleType`, `monthlyHourBudget`, `position`, `maxDailyJobs`, `orgRole.rolePermissions` | "Type lies" bloating responses, misleading clients. Remove or implement. |
| M16 | `LocationHistory` retained forever, no partition/TTL | tracking | Unbounded GPS table dominates query cost & cascade deletes. Add retention/partitioning. |
| M17 | Web auth is UI-only; admin queries fire for any role | web `DashboardLayout`, `MembersPage` getMembers query | No role gating; dead `withAuth` HOC. Add `enabled:isAdmin` guards / server enforcement. |
| M18 | `auth-context` overrides backend `canCreateTasks` by role | web `auth-context.tsx` | UI advertises create-task to MANAGERs the backend rejects. Trust the backend flag. |
| M19 | Mobile `User.platform` typed required but column gone | mobile `types.ts` | Runtime `undefined`; TS allows unchecked reads (migration type-lie). Remove/optional. |
| M20 | Mobile pending-approval polling uses stale `status` closure | mobile pending-approval screen | Rejection toast de-dup ineffective. Use ref/memoized callback. |

### 🟢 Low (selected)

- **Task `depth` (max 5) not enforced at DB level** — runaway recursion risk; enforce in a trigger or validated service path.
- **Timezone defaults diverge** (`Organization`=Europe/Vienna vs `CompanyLocation`=Europe/Berlin) and are unvalidated IANA strings → DST/attendance skew, runtime crashes on typos.
- **Inconsistent S3 region/bucket defaults** across attachments vs reports services (`eu-central` vs `eu-central-1`, bucket `hbcfield` vs actual `doergo`) → wrong-bucket on misconfig, silent delete failures (S3 object leaks).
- **`getAvailability` "active assignment" filter** uses `effectiveTo: null` only, diverging from the null-OR-future pattern elsewhere → drops future-dated postings.
- **`getTaskRoute` caps at 5000 points with silent truncation** → drawn path and stored distance disagree, no truncation flag.
- **SMTP `secure:false` hardcoded** regardless of port → `SMTP_PORT=465` fails.
- **Orphaned event handler** `blocked_tasks_reminder` consumed but never emitted (dead code).
- **Production `TokenDebugPanel`** renders for every logged-in user (session timing + manual refresh) — gate on `NODE_ENV`.
- **CORS origins not trimmed** (`split(',')`) → spaced env values silently drop origins.
- **Mobile i18n drift** — ships en/de; docs claim en/ar (no RTL handling).
- **Legacy CLIENT role** not normalized on mobile home screen → broken mixed UI for legacy admins (every other gate handles it).
- **Dead role union members** (`EMPLOYEE`/`DISPATCHER` in mobile, unused `Platform` enum) widen the type surface.

---

## 5. Business & Product Gaps (Prioritized)

> "Now" = blocks any paying customer or is actively broken · "Next" = required to compete · "Later" = differentiation/scale.

| Priority | Gap | What's missing | Why it matters |
|---|---|---|---|
| **NOW** | **SaaS subscription billing** | No Plan/Tier/Seat/Usage/Payment/Stripe layer to charge tenants; `enabledModules` is config, not entitlement | **You cannot charge anyone.** Revenue is structurally impossible — every GTM dollar leaks. |
| **NOW** | **Customer / CRM entity** | No first-class Customer or Property/Site; tasks & invoices use free-text names only | The foundational FSM object — no repeat-business workflow, no service history at dispatch, no payer of record. Blocks selling to any business that bills external customers. |
| **NOW** | **Quoting / estimates** | No estimate entity, price book, quote→approve→job→invoice flow, e-signature | Front of the revenue funnel; Jobber/Housecall lead with it. Without it customers keep quoting in spreadsheets. |
| **NOW** | **Working invoicing + payments** | Models inert: no UI, no Stripe/Square, no online "pay" link, no FK from invoice to task | Getting paid is the #1 reason SMBs buy FSM. No revenue capture = no ROI story. |
| **NOW** | **Tenant data isolation** | Cross-tenant IDOR (tracking), Socket.IO trusts client org/role, arbitrary `taskId` writes (C2/H12/H13) | #1 procurement gate for multi-tenant B2B; one leak fails security review and kills deals. |
| **NOW** | **Authorization integrity** | `canManageUsers` → ADMIN promotion; custom roles grant nothing; admin reset doesn't kill sessions (C3/H10/M5) | Auto-fail on security review; makes the "custom roles" upsell non-functional. |
| **NOW** | **Demo-breaking correctness** | Empty live map (dead role), tasks list filters only 20 rows, free-form `Task.status` (C1/H1, §4) | Breaks the exact screens a prospect sees — reads as a broken product, destroys trust in evaluation. |
| **NOW** | **Credential/session security** | Tokens in localStorage + false httpOnly comments; log leak; spoofable throttle; plaintext codes (H6/H7/H8/H11) | Fails questionnaires/pen-tests; durable account takeover via XSS; no brute-force protection at scale. |
| **NEXT** | **Dispatch board & optimization** | No drag-and-drop calendar across techs/time, no route/travel-time optimization, no arrival windows | The dispatcher's daily cockpit and ServiceTitan's headline feature; limits deal size to tiny teams. |
| **NEXT** | **Customer comms / SMS** | No Twilio/SMS, no "tech en route" ETA, no reminders/review requests; email bugs | Top driver of FSM ROI (fewer no-shows, higher CSAT); core to Housecall/Jobber. |
| **NEXT** | **Customer portal / online booking** | No self-service portal (approve quotes, pay, history) or embeddable booking widget | Primary lead-gen & self-service buyers expect; turns the product from "manage labor" to "grow revenue." |
| **NEXT** | **Reporting / analytics dashboards** | `DailyMetric`/`ActivityLog` collected but unsurfaced; no revenue/utilization/AR-aging/first-time-fix | Owners renew/expand on demonstrated ROI; quick win since data already exists. |
| **NEXT** | **Integrations** | No QuickBooks/Xero, calendar sync, payment gateway, reviews; no productized API/webhooks | Accounting sync is among the most-requested FSM integrations; absence caps deals to small buyers. |
| **NEXT** | **Mobile offline support** | Offline queue is infrastructure-only; all requests fail offline; some uploads bypass auth-refresh | Field techs work in dead zones; baseline FSM expectation; without it techs lose work and abandon the app. |
| **NEXT** | **Compliance (GDPR) + reliability** | No DSAR export/erasure; infinite retention; fire-and-forget audit log; uncached `validate_token` on every request | Hard blocker for EU buyers (the apparent market); auth hot-path is a scaling bottleneck. |
| **NEXT** | **Activation instrumentation** | No analytics funnel, setup checklist, sample-data seeding, in-app guidance | Trials won't convert if you can't see where new orgs stall — flying blind on the metric that decides SaaS survival. |
| **LATER** | **Service agreements / SLAs / memberships** | No maintenance-contract entity, SLA tracking, membership billing | Primary recurring-revenue & retention engine; marquee ServiceTitan feature. |
| **LATER** | **Inventory / parts management** | `PartUsed` records consumption only; no catalog/stock/PO/reorder | Needed by materials-heavy trades; caps mid-market deals and job-costing accuracy. |
| **LATER** | **Packaging, expansion levers & support tooling** | No ICP/tier mapping, seat-expansion prompts, referral program, super-admin/impersonation, suspend tenant | NRR has no levers; can't support/suspend tenants; existing `OrganizationAccess` delegation is a free, un-monetized franchise upsell. |

---

## 6. Recommended Roadmap — Top 10 Actions

1. **Stop the cross-tenant leaks (C2/H12/H13):** add `organizationId` scoping to all tracking queries + Socket.IO room joins, and ownership checks on `updateLocation`.
2. **Close the privilege-escalation hole (C3):** require ADMIN to grant ADMIN, enforce role-hierarchy, validate permission keys; wire or remove `OrgRole`.
3. **Finish the role/platform migration (C1/H2/H5):** normalize roles once at the token boundary, fix the live-map/availability/stats filters, delete the `WorkMode` enum + `platform` type lies, regenerate the Prisma client.
4. **Fix the tasks list (H1 + web bug):** make `Task.status` a real enum/CHECK; move status/search/space filtering server-side so the list works beyond 20 rows.
5. **Harden credentials (H6/H7/H8/H11):** refresh token → httpOnly cookie, remove token material from logs, set `trust proxy`, store only hashed invitation/join codes.
6. **Build SaaS billing:** Plan/Tier/Seat/Subscription + Stripe Billing, trials, and `enabledModules`-as-entitlement gating — the prerequisite to any revenue.
7. **Introduce a first-class Customer/Property entity** and link Task, ServiceReport, Asset, and Invoice to it (the CRM backbone the whole commercial layer depends on).
8. **Make invoicing real:** wire Invoice/InvoiceItem to tasks/reports with FKs, build the web UI, add a Stripe/Square "pay invoice" flow, and "convert ServiceReport → Invoice."
9. **Add quoting + a dispatch board:** estimate→approve→job→invoice flow with a price book, plus a drag-and-drop scheduling calendar — the two screens buyers evaluate first.
10. **Surface ROI + ship customer comms:** turn the already-collected `DailyMetric`/`ActivityLog` into owner dashboards, and add Twilio SMS reminders / "tech en route" ETA — the cheapest wins for retention and demos.

*Sequence: actions 1-5 (stabilization) before any customer onboarding; 6-8 to become chargeable; 9-10 to compete.*