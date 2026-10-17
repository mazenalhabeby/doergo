# Audit: API gateway and `@hbcfield/shared`, covering SOLID, file size and DRY

Date: 2026-10-16. Read-only audit: no code was changed. Every path below is relative to `/Users/pc/work/doergo`.
Line counts come from `sizes.json` and from `grep`. Test files are excluded throughout.

## 0. Headline numbers

| | gateway (`apps/api/gateway/src`) | shared (`packages/shared/src`) |
|---|---|---|
| Non-test files / lines | 256 / 30,081 | 305 / 47,821 |
| Files > 500 lines | 10 | 14 |
| Routes | 705 handlers | n/a |
| `@Request()/@Req() req: any` params | **469** in 38 files (`@Request()` 387 + `@Req()` 44 + optional `req?: any`) | n/a |
| `req.user.*` reads | 589. These are organizationId 321, id 141, access 18, role 8 and a few others | n/a |
| Controllers that inject a raw `ClientProxy` | 24, with about 175 `firstValueFrom` calls written directly in controllers | n/a |
| Inline / `any` `@Body()` types | **118**. The global `ValidationPipe` does not check these (see 3.4) | n/a |
| Import cycles | none | 1, type-only (`utils/geofence.ts` ↔ `utils/route-nav.ts`) |

Global `APP_GUARD`s (`app.module.ts:176-230`) already run JwtAuth, Roles, Permissions, Module, Plan and the others on every route.

---

## 1. Large files: responsibilities and concrete splits (target ≤ 300 lines)

### Gateway

Nest allows several controllers on one `@Controller('<prefix>')`. That means every split below keeps every URL as it is.

⚠️ **The order of literal and param routes moves into the module's `controllers: []` array.** Express matches routes in the order they were registered. A controller that holds `GET :id` must be listed **after** any controller that holds `GET mine`, `GET usage` and so on. `common/__tests__/controllers-load.spec.ts` exists already. Extend it with a test that requests each literal path.

#### 1.1 `modules/attendance/attendance.controller.ts`: 1,244 lines, 85 routes, one class
It covers clock-in/out, auto-clock, the work log, entries, reports, no-shows, breaks, break rules, approvals, excursions, extra time, overtime, edit and manual entry.

| New file (`modules/attendance/controllers/`) | Moves (current lines) | Target |
|---|---|---|
| `clock.controller.ts` | clock-in/out, heartbeat(+batch), status, clock-in-locations (73-174) | ~120 |
| `auto-clock.controller.ts` | auto-clock/plan, consent, entries/:id/auto-undo, auto-rest/skip (175-228) | ~70 |
| `worklog.controller.ts` | `worklogCaller` + 8 worklog routes (229-302) | ~90 |
| `entries.controller.ts` | history, entries, locations/:id/entries, all-entries, active-entries (303-443), entries/:id edit/presence/history/delete/manual (1111-1227) | ~280 |
| `no-shows.controller.ts` | no-shows, summary, :id (444-498) | ~60 |
| `attendance-reports.controller.ts` | reports/summary, weekly, monthly, export (499-583) | ~90 |
| `breaks.controller.ts` | breaks/* and entries/:id/breaks (584-626, 682-852) | ~230 |
| `break-rules.controller.ts` | break-rules CRUD (627-681) | ~60 |
| `attendance-approvals.controller.ts` | approvals/pending/approve/reject/bulk, excursions/*, forgot-clock-out (853-1004, 1228-1244) | ~190 |
| `extra-time.controller.ts` | request-extra-time, extra-time/*, entries/:id/overtime, overtime/:id (1005-1110) | ~110 |

The private `scope()` at line 64 is a one-line pass-through to `scopeFor`. Delete it.

`attendance.service.ts` (570 lines) consists of 60 thin `send/sendOnce` wrappers. Split it the same way into `attendance-*.client.ts` files, or leave it as it is (low value).

#### 1.2 `modules/technicians/technicians.controller.ts`: 1,052 lines, 35 routes, class `EmployeesController`
The file name does not match the class (`technicians/` vs `/employees`). Rename the folder to `modules/employees/`.

| New file | Moves | Target |
|---|---|---|
| `employees.controller.ts` | list, create, :id, :id/stats, patch, delete, performance, tasks, attendance, assignments (80-112, 575-881) | ~280 |
| `employee-availability.controller.ts` | availability, floor-now, cover-range (114-247) | ~110 |
| `time-off.controller.ts` | time-off list/approve/manual/patch/manage/bulk/cancel, :id/time-off, :id/time-off/count, :id/leave-balance, me/request-options, me/requests/precheck (157-180, 249-457, 936-1052) | ~290 |
| `leave-ledger.controller.ts` | leave-opening(*), leave-adjustments (459-574) | ~110 |
| `employee-schedule.controller.ts` | :id/schedule GET/POST (882-935) | ~60 |
| `employees.client.ts` (extends `BaseGatewayService`) | all 35 raw `firstValueFrom(this.authClient/taskClient.send…)` | ~150 |

`leaveWriteScope` and `leaveReadScope` (lines 50-62) move to `common/permission-scope.ts`.

#### 1.3 `modules/tasks/tasks.controller.ts`: 911 lines, 47 routes
| New file | Moves | Target |
|---|---|---|
| `tasks.controller.ts` | list, counts, resync, create, :id, patch, delete, assign, status, resume, decline, time, job-time | ~260 |
| `task-create-policy.ts` (pure, tested) | premium-field 402 check (85-110), assignee/openRole stripping and `taskCreationScope` (115-200), `assertMayAssignIn` (408) | ~120 |
| `task-role-pool.controller.ts` | open-for-me, role-options, role-preview, role-stats, take, return-to-role, open-role (~330-400) | ~110 |
| `task-crew.controller.ts` | handover(/mine), crew/join, leave, issue, resume, lead | ~120 |
| `task-collab.controller.ts` | timeline, comments, submissions, assignees | ~110 |
| `task-checklist.controller.ts` | checklist(*), subtasks, dependencies | ~140 |
| `task-attachments.controller.ts` | attachments presign/confirm/list/delete | ~90 |

#### 1.4 `modules/assets/assets.controller.ts`: 897 lines, 46 routes
| New file | Moves | Target |
|---|---|---|
| `assets.controller.ts` | POST, GET, usage, orphans, :id GET/PATCH/DELETE, activities, history | ~200 |
| `asset-custody.controller.ts` | mine, custody/member/:memberId, :id/custody | ~90 |
| `asset-expenses.controller.ts` | expenses/mine, pending, :entryId/review, receipt-url, :id/expenses/*, :id/money* | ~200 |
| `asset-proposals.controller.ts` | proposals/* (299-447) | ~150 |
| `asset-contracts.controller.ts` | contracts/read, preview, apply (448-485) | ~50 |
| `asset-log.controller.ts` | log/mine, log/due-mine, :id/log* | ~90 |
| `asset-rows.controller.ts` | :id/rows* (626-697) | ~75 |

All controllers with literal first segments must be registered **before** `AssetsController`, which holds `:id`.

#### 1.5 `modules/documents/documents.controller.ts` (731 lines, 42 routes) and `dto/documents.dto.ts` (778 lines, 21 classes)
| New file | Moves | Target |
|---|---|---|
| `document-types.controller.ts` | visibility-roles, types CRUD (82-151) | ~80 |
| `documents-issue.controller.ts` | upload-url, POST, bulk/visibility, bulk/delete, :id/revoke, export, publish, drafts, match-candidates | ~180 |
| `documents-registers.controller.ts` | route-candidates, browse, sent, compliance, requirements, pending, awaiting-verification, verify, reject | ~170 |
| `documents-mine.controller.ts` | mine/upload-url, mine/read, mine | ~50 |
| `document-templates.controller.ts` | templates CRUD, preview, issue-contract | ~100 |
| `document-signing.controller.ts` | send-back, consent, sign, acknowledge, chain, events, download-url, GET `/`, DELETE :id | ~130 |

Cleanup: lines 254-284 hold five doc comments stacked on top of each other. They describe routes that live elsewhere (orphaned comments). Move each one onto its own route.

The DTO file becomes `dto/document-type.dto.ts` (39-180), `dto/document-upload.dto.ts` (181-298), `dto/document-queries.dto.ts` (286-408), `dto/own-upload.dto.ts` (465-597), `dto/template.dto.ts` (598-719) and `dto/sign-visibility.dto.ts` (720-778). `dto/index.ts` stays as a barrel.

The same pattern applies to `tasks/dto/index.ts` (514 lines, 21 classes) and `organizations/dto/index.ts` (453 lines, 8 classes).

#### 1.6 `modules/organizations/organizations.controller.ts`: 663 lines, 27 routes
| New file | Moves | Target |
|---|---|---|
| `org-settings.controller.ts` | join-code, regenerate, leave-policy, settings, profile, profile-badges, notification-prefs, security-settings | ~200 |
| `org-members.controller.ts` | members(*), statement, watchers, reset-password, home, contacts, transfer-ownership | ~260 |
| `org-roles.controller.ts` | roles CRUD | ~70 |
| `audit-logs.controller.ts` | audit-logs (600-662); its access logic moves to a service | ~50 |
| `organizations.client.ts` | 28 × `firstValueFrom` + 18 × `assertServiceOk` | ~120 |

`updateMember` (289-357) copies 28 DTO fields one by one (lines 303-330). `whitelist: true` already strips unknown keys, so `dto` can be passed through as it is. The side-effect tail is covered in 3.3.

#### 1.7 Other files
- `locations/locations.controller.ts` (510 lines). Move `:id/members` GET/POST/PATCH/DELETE (335-510, about 175 lines) into `space-members.controller.ts`. About 330 lines remain.
- `customers/customers.controller.ts` (524 lines, 25 routes). Move contacts and promote (contact people) into `customer-contacts.controller.ts` (about 120 lines).
- `portal/portal-admin.controller.ts` (524 lines, 24 routes). Split along portals, categories and units.
- `users/users.controller.ts` (498 lines). The avatar upload and remove logic (250-343) covers MIME→extension mapping, S3-or-disk storage and old-file cleanup, all inside the controller. Move it to `users/avatar.service.ts` (about 90 lines).

### Shared
See section 4.

---

## 2. Controllers: business logic and a typed request

### 2.1 Business logic in controllers that should move to a service or policy
| Where | What | Move to |
|---|---|---|
| `tasks/tasks.controller.ts:85-110` | premium-field check that builds its own 402 body | `TaskCreatePolicy.assertEntitled()`, using a shared `paymentRequired()` (3.5) |
| `tasks/tasks.controller.ts:115-200` | strips the assignee and open role, derives `roleAssignSpaceIds` and `taskCreationScope` | `TaskCreatePolicy.prepare(dto, user)` |
| `tasks/tasks.controller.ts:366-370` | role-stats scope and its intersection with the requested space | `narrowToRequested(scopeFor(...), q.spaceId)` |
| `technicians/technicians.controller.ts:390-428` | bulk time-off: a fan-out loop, a 50-item cap, and `{success:false}` returned **with HTTP 200** | a task-service command `bulk_approve_time_off`; a 400 via a DTO with `@ArrayMaxSize(50)` |
| `technicians/technicians.controller.ts:121-134, 229-233` | date-format and 90-day validation that throws **403** for a bad format | a query DTO with `@IsIsoDay()` (3.6) |
| `technicians/technicians.controller.ts:630-641` | the `viewerSpaceIds` union of two grants | `scopeUnion(user, 'canViewAllTasks', 'canViewSpaceAttendance')` |
| `organizations/organizations.controller.ts:600-662` | the audit-log policy (admin vs per-entity, entitlement, an inline 402) | `AuditLogAccess.assert(user, query)`. Also, line 616 shadows the shared `isAdmin` with `user.role === Role.ADMIN` |
| `organizations/organizations.controller.ts:337-356` and 5 other places | the side effects after a member change | `MemberChangeNotifier` (3.3) |
| `users/users.controller.ts:250-343` | avatar storage | `AvatarService` |
| `locations/locations.controller.ts:321-326` | `scope !== null && !scope.includes(id)` → 403 | `assertInScope(scopeFor(user,'canViewAllTasks'), id)` |

### 2.2 Typed request user: removing the 469 `req: any` params

**Root cause.** In shared, `CurrentUserData.access` is typed as loose `Record`s (`packages/shared/src/decorators/index.ts:109-112`) instead of `ResolvedAccess` (`types/permissions.ts:665`). Every call to `spacesGranting(user.access, …)` therefore needs `as never` or `as any`. There are 23 `as never` casts, 13 of them in technicians.controller. Several fields the gateway reads (`orgAddOns`, `isExternal`, `customerId`, `unitId`, `iat`, `access.sharedSpaces`) are not on the type at all.

**Proposal** (`apps/api/gateway/src/common/http/authed-request.ts`, about 40 lines):
```ts
import type { Request } from 'express';
import type { CurrentUserData, ResolvedAccess } from '@hbcfield/shared';
export interface AuthedUser extends Omit<CurrentUserData, 'access'> {
  organizationId: string;              // non-null after OnboardingCompleteGuard
  access?: ResolvedAccess;             // incl. sharedSpaces
  orgAddOns?: string[]; isExternal?: boolean;
  customerId?: string | null; unitId?: string | null; iat?: number;
}
export interface AuthedRequest extends Request { user: AuthedUser }
```
In shared, change `CurrentUserData.access` to `ResolvedAccess`. That alone removes the 23 casts.

Add three typed parameter decorators next to `CurrentUser`:
- `@Me() user: AuthedUser`: the same as `@CurrentUser()`, but typed.
- `@OrgId() organizationId: string`: covers 321 reads.
- `@Actor() a: { userId; organizationId; role }`: covers the `{ userId: req.user.id, organizationId: req.user.organizationId }` pair, which appears in about 276 + 99 object literals.
- `@ReqCtx() ctx: { ip; userAgent }`: replaces the 5 hand-built copies (3.7).

Migration, run as a mechanical codemod:
- **469 handler params in 38 files** (66% of the 705 routes) change.
  - About 435 use only `req.user`. They become `@Me() user: AuthedUser` and `req.user.` becomes `user.`.
  - 34 also read headers, ip or path. They become `@Req() req: AuthedRequest`.
- Biggest files: tasks 47, assets 44, attendance 31, customers 25, portal-admin 24, workflows 22, chat 19, space-roles 17, documents 15, locations 13.
- These private helpers take `req: any` and change to `user: AuthedUser`:
  - `attendance.controller.ts:64,229`
  - `customers.controller.ts:130`
  - `shift-issues.controller.ts:30`
  - `tasks.controller.ts:403,408`
  - `portal-admin.controller.ts:70`
  - `common/task-actor.ts`, `common/external-task-write.ts`, `common/guards/module.guard.ts:100,164`
- Other `any` patterns to clean up:
  - `data: any` (52), mostly in thin `*.service.ts` wrappers (`shift-issues.service.ts` 8, `platform-admin.service.ts` 8, `attendance.service.ts` 7). Type these with the DTO plus the `Actor`.
  - `body: any` (36), see 3.4.
  - `as any` (44).
- Add an ESLint rule (`@typescript-eslint/no-explicit-any` on `**/*.controller.ts`) once the codemod has landed.

---

## 3. DRY across gateway modules

### 3.1 Scope narrowing bypasses the ONE rule (`common/permission-scope.ts:23`)
CLAUDE.md requires every narrowing to go through `scopeFor` (org flag first, then `spacesGranting`). There are still **24 direct `spacesGranting` calls in modules**:
- `technicians.controller.ts:104,143,203,243,279,287,637,638,668,770,806,844,870`
- `calendar.controller.ts:41,54,55,62`
- `tasks.controller.ts:180,368,410`
- `locations.controller.ts:224,323`
- `recurring-tasks.controller.ts:42`
- `documents.controller.ts:358`

The common gateway helpers `common/task-actor.ts:70,101`, `common/tracking-visibility.ts:21` and `common/guards/report-access.guard.ts:17-18` also call it directly.

The expression `isAdmin(user as never) ? undefined : spacesGranting(user?.access as never, K) ?? undefined` is copied **7 times** in technicians alone.

Two of these look like real defects. Verify both before fixing:
- `technicians.controller.ts:278-279`: `canSeeCover = isAdmin || (spacesGranting(...,'canViewSpaceAttendance') ?? []).length > 0`. An **org-wide** holder gets `null`, which becomes `[]`, so `canSeeCover` is `false`. The null-vs-empty collapse that `permission-scope.ts` warns about is exactly this.
- `technicians.controller.ts:201-203, 241-243, 842-844`, `locations.controller.ts:323` and `tasks.controller.ts:368` skip the org-flag check. `canViewSpaceAttendance` is bridged from `canViewAllTasks` (`access/org-flags.ts:39`). The guard therefore lets an org-wide manager through, and the service then receives `[]`, which yields an empty floor. This is the bug that `scopeFor` was written to stop.

**The single place to fix it is `common/permission-scope.ts`.** Add:
```ts
scopeFor(user, key)                       // existing: null | ids | []
scopeArg(user, key)                       // null → undefined (task-service convention)
scopeUnion(user, ...keys)                 // null if any is org-wide
narrowToRequested(scope, spaceId?)        // [spaceId] | [] | scope
assertInScope(scope, spaceId, msg?)       // 403 when outside
```
Then extend `permission-scope.spec.ts` with a source scan that fails on `spacesGranting(` anywhere under `modules/`.

### 3.2 RPC call, unwrap and throw: two styles side by side
- 28 services extend `BaseGatewayService` (`packages/shared/src/microservices/base-gateway.service.ts:34`). That class gives read retry, `sendOnce` for writes, and one status mapping.
- 24 controllers inject `ClientProxy` directly and call `firstValueFrom(this.x.send(...))`. They skip the timeout, the read retry and `toHttpException`, and they mix in `assertServiceOk(result, status)` by hand.
  - Counts: technicians 35, organizations 28, users 18, auth 17, analytics 12, invoices 11, tracking 10, billing 10, portal 7, onboarding 7, invitations 6, space-units 5, portal-admin 5, join-requests 4, and others.
- There are **seven** hand-rolled private copies of the same helper:
  - `customers.controller.ts:111` (+ `authMutation` 121)
  - `portal/space-portal.controller.ts:36`
  - `portal/space-units.controller.ts:48`
  - `portal/portal-admin.controller.ts:65`
  - `invoices/legal-entities.controller.ts:46`
  - `space-sharing/space-sharing.controller.ts:29`
- Injection tokens are inconsistent: 28 × `@Inject('AUTH_SERVICE')` string literals vs 42 × `@Inject(SERVICE_NAMES.X)`.

**Single source.** Create `common/clients/auth-service.client.ts`, `task-service.client.ts` and `tracking-service.client.ts`. Each extends `BaseGatewayService` and exposes `read(cmd, data)`, `write(cmd, data)` and `writeOk(cmd, data, failStatus)`. `writeOk` is `sendOnce` plus `assertServiceOk`. Register them once in `MicroservicesModule`. Controllers then never import `rxjs` or `ClientProxy`. A lint or spec check should forbid `firstValueFrom` in `*.controller.ts`.

### 3.3 Side effects after a member or access change
The sequence "invalidate session → emit `member_access_updated` → `orgEvents.memberChanged` → `billing.rebill`" appears in full at `organizations.controller.ts:337-356`. Parts of it appear at:
- `auth.controller` (5 × `invalidateUser`/`invalidateOrganization`)
- `onboarding.controller` (3), `technicians.controller` (2), `users.controller` (2), `billing.controller` (2), `platform-admin.controller` (2)
- `join-requests`, `customers`, `portal-admin` and `space-member-permissions` (one each)

There are also 9 direct `this.billing.rebill` calls.

**Single source:** `common/member-change.service.ts` with `accessChanged(orgId, memberId, { rebill })` and `orgChanged(orgId)`.

### 3.4 Unvalidated bodies
`main.ts:176` runs `ValidationPipe({ whitelist, forbidNonWhitelisted })`. That only takes effect when the parameter type is a **class**. An inline object type or `any` reaches the service unchecked: **118 params**.
- Most affected: attendance 10, portal-admin 9, platform-auth 9, technicians 8, customers 7, and 5 each in space-sharing, shifts, space-portal, platform-support-teams and analytics.
- Examples:
  - `attendance.controller.ts:1185-1205` (`addManualEntries`), `:1231` (`bulkApprove`, unbounded `entryIds`)
  - `technicians.controller.ts:311, 393`
  - `organizations.controller.ts:604-613` (`@Query() query: {…}`)

**Single source:** one DTO class per route, in the module's `dto/` folder.

### 3.5 402 bodies are built by hand in 5 places
- `common/guards/plan.guard.ts:64` (the canonical one, which names the price)
- `common/space-modules.service.ts:19`
- `tasks/tasks.controller.ts:96-106`
- `organizations/organizations.controller.ts:635-645`
- `routes/routes.controller.ts:36`

They disagree on `error` (`'Payment Required'` vs `'PlanUpgradeRequired'` vs `'ModuleDisabled'`) and on the shape (`addOn{}` vs `monthlyCents`).

**Single source:** `common/payment-required.ts` → `paymentRequired(feature): HttpException`.

### 3.6 Repeated parameter parsing
- The `YYYY-MM-DD` regex is written 9 times:
  - `organizations/dto/index.ts:194,341`
  - `calendar/calendar.dto.ts:8`
  - `space-roles/space-roles.dto.ts:6`
  - `technicians/dto/update-technician.dto.ts:50`
  - `technicians.controller.ts:124,230`
  - `locations/dto/create-location.dto.ts:251`
  - `approvals/dto/stand-in.dto.ts:3`

  Fix: an `IsoDayField()` decorator in `packages/shared/src/validators/index.ts`, beside `EmailField`.
- `page ? Number(page) : undefined` / `limit ? Number(limit)` appears 15 times, and there are 14 × `@Query('page')` and 11 × `@Query('startDate')`. The same date-range-plus-paging block is spelled out with `@ApiQuery` (96 in total) at `attendance.controller.ts:303-433` and elsewhere. Fix: `common/dto/date-range-page.query.ts` (`DateRangePageQuery` with `@Type(() => Number)`, `clampListLimit`). Swagger reads it from the DTO, which removes the `@ApiQuery` stacks.
- The `sharedSpaces` projection is hand-written in 5 places:
  - `attendance.controller.ts:386`
  - `locations.controller.ts:212,360`
  - `tasks.controller.ts:123`
  - `tracking.controller.ts:47`

  `common/task-actor.ts:72` is the sixth. Fix: `sharedSpaceIds(user, { showAttendance? })` in `common/permission-scope.ts`.
- 306 × `@Param('id') id: string` with 0 × `ParseUUIDPipe`. That is optional. Note that some ids are UUIDv7, so use `IsUUID('all')` or skip this.

### 3.7 Request context (ip / user-agent) is built 5 times
- `auth.controller.ts:114-115, 442-443`
- `common/interceptors/audit.interceptor.ts:84-85`
- `common/interceptors/platform-audit.interceptor.ts:88-89`
- `documents/documents.actor.ts:86` (`requestContext`, the best version)

**Single source:** move `requestContext` to `common/http/request-context.ts` and expose it through `@ReqCtx()`.

### 3.8 Redundant guard stacks
- `@UseGuards(JwtAuthGuard, RolesGuard)` duplicates the global `APP_GUARD`s, so each request authenticates twice (two auth-cache reads). It appears at:
  - `calendar.controller.ts:28`
  - `technicians.controller.ts:67`
  - `users.controller.ts:137`
  - `assets.controller.ts:74`
  - `asset-categories.controller.ts:63,185`
  - `invitations.controller.ts:44,80,127`
- `@UseGuards(ModuleGuard)` duplicates the global guard at `sprints.controller.ts:85`, `phases.controller.ts:42` and `epics.controller.ts:42`.
- Delete all of these. Before deleting, check that `global-guard-wiring.spec.ts` covers them.
- `@Roles(Role.ADMIN, Role.EMPLOYEE)` × 60 really means "staff, not a portal customer". Use one named `@StaffOnly()` (`applyDecorators`).

### 3.9 Actor builders
There are several copies of "who is calling":
- `common/task-actor.ts` (`taskActor`)
- `documents/documents.actor.ts` (`documentActor`)
- `assets/asset-actor.ts`
- `attendance.controller.ts:229` (`worklogCaller`)
- `customers.controller.ts:130` (`caller`)
- `shift-issues.controller.ts:30` (`ctx`)

Keep the domain-specific ones. Give them all one base, `actorOf(user: AuthedUser) → { userId, organizationId, role, access }`, in `common/http/actor.ts`, so the identity fields come from one place.

---

## 4. Shared package

### 4.1 Split plans
**`crm/business-card.ts` (1,879 lines).** It holds the types, about 30 regexes and word lists, segmentation, line facts, column detection, kind detection, a 220-line `ROLES` spec table, a 218-line `measure()`, scoring, `parseBusinessCard`, and the OCR→line adapter. Move it into `crm/card/`:

| File | Lines now | Target |
|---|---|---|
| `card/types.ts` | 80-238 | ~160 |
| `card/patterns-contact.ts` (EMAIL, PHONE, VAT, TLD, WEBSITE, PHONE_LABEL, separators) | 239-409 | ~170 |
| `card/patterns-words.ts` (LEGAL_FORM, ROLE, DEPARTMENT, AUTHORITY, STREET, POSTCODE, COUNTRY, HONORIFIC, GENERIC_LOCAL) | 410-570 | ~160 |
| `card/segment.ts` (`segmentCardLine`, `readCardPhones`, `labelKind`, `dialable`) | 572-653 | ~85 |
| `card/facts.ts` (LineFacts, Ctx, person shape, wordmark, `companyDomainFromEmail`, `companyNameFromDomain`) | 654-879 | ~230 |
| `card/columns-kind.ts` (`cardColumns`, `kindFromFacts`, `detectCardKind`) | 880-1001 | ~125 |
| `card/role-specs.ts` (ROLES) | 1002-1240 | ~240 |
| `card/measure.ts` | 1245-1500 | ~260 |
| `card/score.ts` (`scoreCardLines`, `contextFor`, `candidatesFor`, `suggestCompany`) | 1501-1601 | ~100 |
| `card/parse.ts` (`parseBusinessCard`) | 1602-1733 | ~135 |
| `card/ocr-lines.ts` (`OcrLine`, `CropRect`, `toCardLines`) | 1734-1879 | ~150 |

`crm/business-card.ts` stays as a barrel of re-exports, so no import changes. Run the existing card tests unchanged.

**`types/permissions.ts` (904 lines).** It holds the permission catalogue, CRM caps, built-in roles, set arithmetic, the external allow-list, space sharing, the resolved-access algebra and a job-title helper. It is access logic living under `types/`.

| New file | Lines now | Target |
|---|---|---|
| `access/permission-keys.ts` (PERMISSION_KEYS, key/set/domain types, ACCESS_PERMISSION_SCHEMA) | 18-165 | ~150 |
| `crm/crm-caps.ts` (`resolveCrmCaps`, `ownsClient`) | 166-236 | ~70 |
| `access/builtin-roles.ts` (RolePreset, BUILTIN_ROLES, EXTERNAL_DEFAULT_ROLE_SLUG) | 237-474 | ~240 |
| `access/permission-sets.ts` (`permissionsFrom*`, `mergePermissions`, `permissionsExceed`, `permissionLabel`) | 475-573 | ~100 |
| `access/external-permissions.ts` (EXTERNAL_ALLOWED_PERMISSIONS, `externalMayHold`, `externalForbiddenIn`, space-leader) | 558-617 | ~60 |
| `access/space-share.ts` | 618-664 | ~50 |
| `access/resolved-access.ts` (ResolvedAccess, IMPLIED_PERMISSIONS, `buildResolvedAccess`, `accessAllows*`, `spacesGranting`, `resolveTaskCreationScope`) | 665-889 | ~225 |
| `people/job-title.ts` (`jobTitleOf`) | 890-904 | ~15 |

**`types/index.ts` (852 lines).** This is a barrel mixed with real code. It holds role normalisation, socket events, API envelopes, User/DEFAULT_PERMISSIONS, the org-module catalogue (215-346), entity interfaces (Task, Sprint, Epic, Asset, ServiceReport, Workflow, CustomField, Recurring) and a dead permission schema.
- `auth/role-normalize.ts`
- `types/socket-events.ts` (59-108)
- `types/api.ts` (ApiResponse, PaginationParams, BaseEntity, plus `PaginatedResponse` moved out of `types/attendance.ts:488`)
- `types/user.ts` (142-214)
- `modules/org-modules.ts` (215-346: AVAILABLE_MODULES … MODULE_PRESETS, `effectiveSpaceModules`, CUSTOMER_STAGES). Also rename `types/modules.ts` (509 lines, the member's mobile Access Profile) to `access/access-profile.ts`, because the name "modules" now means two different things.
- `types/entities/task.ts` (397-603), `types/entities/asset.ts` (613-732), `types/entities/workflow.ts` (733-815)
- `types/index.ts` then shrinks to about 40 lines of `export *`.

**Dead exports to delete.** These have 0 importers outside `types/index.ts`:
- `PERMISSION_SCHEMA` and `PermissionKey` (822-833), which duplicate `ACCESS_PERMISSION_SCHEMA`
- `LegacyRoleMap` (39). CLAUDE.md §4 still documents it, so update the docs too.
- `SCHEDULE_TYPES`, `VelocityDataPoint`, `DefinitionOfDone`, `TechnicianAssignment`, `AssetWithHistory`, `TaskDependencyWithTask`

Verify each with `tsc` across apps before removing.

**`access/asset-kind-shape.ts` (809 lines).** It sits in the wrong folder: it has nothing to do with access. Move it, together with `access/asset-kind-templates.ts`, to `assets/kind/`:
- `types.ts` (17-269, limits plus interfaces): ~250
- `normalize.ts` (`normalizeKindShape` 270-433): ~165
- `log-types.ts` (434-621): ~190
- `details.ts` (holders, detail rows 622-700): ~80
- `money-lists.ts` (701-791): ~90
- `move.ts` (`keepFieldsForKind`, `fieldsDroppedByMove`): ~20

Similarly, `access/workflow-{modules,scope,status-label,template,validation}.ts` belong in `workflows/`, next to `workflows/step-form.ts`.

**Other files over 500 lines.** Splitting these is optional.
- `mail/email-messages.ts` (648) is five locale tables. Moving to `mail/messages/{en,de,es,fr,it}.ts` brings each to about 130 lines.
- `billing/invoice-lines.ts` (638) splits into `labour-lines.ts` (45-497) and `workspace-lines.ts` (498-638).
- `attendance/auto-clock.ts` (600) splits into `auto-clock-settings.ts` (30-110, 211-270) and `auto-clock-decide.ts` (107-210, 284-600).
- `tasks/task-report.ts` (583) splits into `task-report-types.ts` (173-453) and `task-report-copy.ts` (rules plus `toClientCopy`).
- `http/core/create-client.ts` (615): leave as it is. It is one cohesive closure.

### 4.2 The geofence ↔ route-nav cycle
`utils/geofence.ts:22` has `import type { LatLng } from './route-nav'`, and `utils/route-nav.ts:13` has `import { haversineDistance } from './geofence'`. A scan of every shared file found this as the only cycle, and it is type-only, so nothing breaks at runtime.

**Fix:**
1. Create `utils/geo-point.ts` with `export interface LatLng { lat: number; lng: number; label?: string }`.
2. Both files import it from there.
3. `route-nav.ts` re-exports it, so the public API does not change.

While doing this, delete the local re-declarations:
- `apps/mobile/app/(app)/route-planner.tsx:31`
- `apps/api/gateway/src/modules/routes/routes.service.ts:50`

### 4.3 Helpers and types duplicated in shared and in the apps
- **`fold` (strip diacritics) has 13 copies inside shared:**
  - `crm/business-card.ts:427,1543`, `crm/contact-import.ts:91`, `crm/card-merge.ts:48`
  - `documents/{dates-from-text:64, batch-matching:65, content-matching:84, scan-checks:101, doc-title:73}`
  - `assets/{contract:65, receipt:52, document-kind:39}`
  - `access/asset-kind-shape.ts:437`

  There are 3 more in apps: `task-service/.../calendar/holiday-library.ts`, `task-service/.../technicians/leave-ledger.service.ts` and `apps/mobile/src/components/customer/card-review.ts`. Half of the copies lowercase the text and half do not. **Single source:** `utils/text.ts` → `foldDiacritics(s, { lower = true })`.
- **Envelope and pagination types are defined 4 times in shared:**
  - `types/index.ts:110` `ApiResponse`
  - `types/attendance.ts:488` `PaginatedResponse`
  - `api/responses.ts:55` `PaginationMeta`
  - `http/core/envelope.ts:25` `PageMeta`

  The web app adds a fifth (`apps/web-app/src/lib/http-client.ts:122` `ApiResponse`). **Single source:** `http/core/envelope.ts` for the client and `api/responses.ts` for the server. `PaginatedResponse` should be `{ data: T[]; meta: PaginationMeta }`, defined once.
- **`CurrentUserData`** (`decorators/index.ts:68`) is out of step with what the session really carries. See 2.2.
- `isAdmin` is shadowed in the gateway at `organizations.controller.ts:616` (`user.role === Role.ADMIN`, which skips legacy normalisation). The web app has about 20 local `const isAdmin = …role === 'ADMIN'` variables. That is out of scope for this audit, but the shared `isAdmin()` should be used.
- `chunk()` is defined 5 times:
  - `shared/storage/object-store.ts:474`
  - `mobile/src/services/route-buffer.ts:155,192,248`
  - `mobile/src/services/background-route-tracking.ts:112`
  - `notification-service/.../push.service.ts:243`

  The local ones may be variables. If they are helpers, use one `utils/array.ts`.

### 4.4 Barrels
- `src/index.ts` (226 lines, 118 `export *`) and `src/client.ts` (192 lines) are acceptable as the package's two entry points.
- `types/index.ts` is the problem, because it holds about 800 lines of code (4.1).
- `validators/index.ts` (280 lines) and `decorators/index.ts` (248 lines) each hold all of their code in the index file. Split them into `validators/fields.ts` and `decorators/{current-user,roles,public}.ts`, and keep `index.ts` as re-exports.
- The web performance note in CLAUDE.md applies here too. Every `export *` in `client.ts` is part of the client bundle's module graph. Splitting by concern lets tree-shaking drop more.

---

## 5. Ten refactors, in priority order

| # | Refactor | Size | Risk | Why first |
|---|---|---|---|---|
| 1 | **Route all narrowing through `scopeFor`** and add `scopeArg`, `scopeUnion`, `narrowToRequested` and `assertInScope` (3.1). Fix `technicians.controller.ts:279` (org-wide → cover hidden) and the bridged-flag misses. Add a scan spec. | S (24 call sites, ~1 day) | Low–Med: behaviour changes for org-flag holders (intended); cover by `permission-scope.spec` + `tools/external-access-e2e.py` | Two likely correctness bugs, and the documented ONE rule is being broken |
| 2 | **Type `CurrentUserData.access` as `ResolvedAccess`** and add `AuthedUser`/`AuthedRequest` (2.2) | S | Low (types only) | Removes 23 `as never`; prerequisite for #3 |
| 3 | **Codemod `@Request() req: any` → `@Me() user: AuthedUser`** across 469 params in 38 files, plus `@OrgId`/`@ReqCtx` | M (mechanical, ~1–2 days with review) | Low; compile-checked. `tsc` will surface real field mismatches | Removes ~60% of the gateway's 755 `any` |
| 4 | **DTO classes for the 118 inline or `any` bodies and queries** (3.4) | M | Medium: `forbidNonWhitelisted` will start returning 400 for clients that send extra keys. Ship per module and watch the logs | Unvalidated input is a security and integrity gap |
| 5 | **Service clients that extend `BaseGatewayService`**, replacing the 175 raw `firstValueFrom` calls and the 7 private `auth()` helpers (3.2) | M | Low–Med: adds timeouts and status mapping where none existed (a hung RPC now gives a 408 instead of hanging). Writes use `sendOnce`, so nothing is ever retried | One error mapping for all controllers; unblocks the controller splits |
| 6 | **Split `attendance.controller.ts`** into 10 controllers (1.1) | M | Low with route-order checks; `controllers-load.spec` | Largest file; 85 routes |
| 7 | **Split `technicians/` into `employees/`** with 5 controllers and `employees.client.ts`; move bulk time-off into task-service (1.2, 2.1) | M | Low–Med (folder rename touches imports and the module registry) | Second largest; most raw RPC calls and scope copies |
| 8 | **Split `tasks.controller.ts` and extract `TaskCreatePolicy`**; add one `paymentRequired()` (1.3, 3.5) | M | Medium: task creation is the hot path; the policy needs unit tests first | Business logic out of the controller; consistent 402s |
| 9 | **Shared: split `permissions.ts`, `types/index.ts` and `business-card.ts`, keeping barrels; delete dead exports; fix the LatLng cycle; add `foldDiacritics`** (4.1-4.3) | M–L | Low: barrels keep import paths; risk is only in the deletions (check with `tsc` in every app) | Largest shared files; 13 copies of `fold` |
| 10 | **Split assets, documents (controller + DTO) and organizations; add `MemberChangeNotifier`, `DateRangePageQuery` and `IsoDayField`; drop redundant `@UseGuards`** (1.4-1.6, 3.3, 3.6, 3.8) | M | Low–Med: asset literal routes must register before `:id` | Remaining files over 500 lines; removes double authentication on 7 controllers |

Suggested order: 2 → 1 → 3 → 5 → 4. After that, run the per-file splits (6-10) in parallel, because they no longer touch each other.
