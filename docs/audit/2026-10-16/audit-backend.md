# Backend services audit — SOLID, size, DRY, typing

Scope: `apps/api/{auth,task,notification,tracking}-service/src` (gateway excluded). Read-only; no code changed.
Method lengths below are measured from one member's first line to the next member's first line, so they include JSDoc. Treat them as ±10%.
Date: 2026-10-16, branch `main` (dirty tree).

Throughout: **T** = `apps/api/task-service/src/modules`, **A** = `apps/api/auth-service/src/modules`, **N** = `apps/api/notification-service/src`.

---

## 0. Headline numbers

| Metric | Value |
|---|---|
| Non-test files > 700 lines in these four services | 21 (largest: `T/locations/locations.service.ts`, 1,651 lines) |
| Methods > 200 lines | 13 (the two worst are ~610 lines each: `ClockInService.clockIn`, `TaskStatusService.updateStatus`) |
| `@Payload() x: any` | **300 of 700** RPC/event handlers |
| `@MessagePattern({ cmd: '<string literal>' })` | 615, with **0** constants. The same strings are typed again in 58 gateway files |
| `@EventPattern('<string literal>')` / `.emit('<literal>'` | 99 / 112. Only one event, `OVERTIME_NOTICE_EVENT`, is a shared constant with a shared payload type |
| forwardRef cycles | 1 cycle, 3 sites (RolePool ↔ Tasks facade ↔ Assignment/Records) |
| Services with ≥ 7 injected dependencies | 12 |

---

## 1. Per-file breakdown and split proposals

Targets: ≤ 300 lines per service and ≤ 40 lines per method. Where a group is small, it is merged with a neighbour instead of getting its own file.

### 1.1 `T/locations/locations.service.ts` — 1,651 lines, 2 deps (Prisma, notification ClientProxy)
Responsibilities:
- **Workspace CRUD and lifecycle**: `create`@141 (89), `findAll`@230 (145), `findOne`@375 (82), `setDefault`@457, `update`@518 (**233**), `remove`@786 (74), `purge`@860 (**102**), `cleanPolygon`, `tzFromCoords`, `spaceCurrency`, `spaceCompany`.
- **Space rates**: `writeSpaceRates`@751.
- **Modules**: `getEffectiveModules`@962.
- **Roster / assignments**: `assignTechnician`@1007 (**132**), `getColleagues`@1139 (70), `rosterSpacesFor`, `getLocationAssignments`@1236 (**124**), `getLocationAssignmentsBatch`@1360 (85), `getTechnicianAssignments`, `updateAssignment`@1489 (**128**), `removeAssignment`.
- **Auto-clock offer**: `suggestStartWindow`@97, `offerAutoClock`@109, `readAutoClock`@1648.
- **Events**: `announce`@77.

Split:
- `workspaces.service.ts` (~300): create, findAll, findOne, setDefault, remove. Extract `findAll`'s list projection into `workspace-list.query.ts`.
- `workspace-update.service.ts` (~280): update and writeSpaceRates. Break `update` into `parseUpdate` / `applyGeofence` / `applyCurrencyAndCompany` / `applyAutoClock`.
- `workspace-purge.service.ts` (~120): purge.
- `space-roster.service.ts` (~300): assignTechnician, updateAssignment, removeAssignment.
- `space-roster-query.service.ts` (~280): getLocationAssignments(+Batch), getTechnicianAssignments, getColleagues, rosterSpacesFor.
- `space-auto-clock-offer.service.ts` (~80): suggestStartWindow, offerAutoClock, readAutoClock.
- `workspace-events.ts`: a typed `announce`.

### 1.2 `A/invoices/invoice.service.ts` — 1,562 lines, 3 deps
Responsibilities:
- **Currency and FX**: `organizationCurrency`, `todayFor`, `exchangeRate`, `currencyFields`@75.
- **Invoice CRUD and status**: `create`@113 (**202**), `findAll`, `findOne`, `documentLocale`, `update`@408 (**119**), `updateStatus`@527 (94), `delete`.
- **Lines**: `addItem`, `removeItem`, `recalculateAndReturn`.
- **Work gathering (billing preview)**: `gather`@812 (**402**), `dayLineFields`, `unknownWorkRef`, `unknownWorker`, `gatherSiteTime`@1300 (**228**).
- **Numbering and issuer**: `generateInvoiceNumber`, `issuingEntity`, `issuerFor`.

Split:
- `invoice-currency.service.ts` (~110).
- `invoices.service.ts` (~300): CRUD.
- `invoice-status.service.ts` (~130): updateStatus, plus the issuer freeze.
- `invoice-lines.service.ts` (~170).
- `invoice-gather.service.ts` (~300), with these phases taken from the method's own comments:
  1. `resolveIssuerPreview`
  2. `loadBillableJobs` (period plus "already billed")
  3. `billingModesByPerson`
  4. `jobLines`
  5. `hourLines`
  6. `dayLines`
- `site-time.service.ts` (~240): gatherSiteTime. Share it with `statement.service.ts` (see DRY D6).
- `invoice-numbering.ts` (~40).

### 1.3 `T/technicians/technicians.service.ts` — 1,507 lines, 6 deps
Responsibilities:
- **Stats and performance**: `getStats`@66, `getPerformance`@125 (**123**), `getTaskHistory`, `buildDailyTrends`@305 (81).
- **Weekly schedule**: `setSchedule`@386, `getSchedule`, `isValidTimeFormat`.
- **Time-off requests (≈ 750 lines)**: `requestSpaces`, `requestOptions`, `assertRequestAllowed`, `requestTimeOff`@573 (**174**), `addTimeOff`@747 (92), `getTimeOff`, `requestClashes`, `countWorkingDays`, `workingDaysOf`, `countLeave`, `getLeaveBalance`, `getOrgTimeOff`@976 (97), `approveTimeOff`@1073 (**140**), `cancelTimeOff`, `updateTimeOff`, `adminDeleteTimeOff`.
- **Availability**: `getAvailability`@1327 (**121**), `availabilityDays`, `dateKeyOf`.

Split:
- `technician-performance.service.ts` (~330): stats, performance, history, trends.
- `technician-schedule.service.ts` (~110).
- `time-off-request.service.ts` (~300): request, add, assertRequestAllowed, requestSpaces/Options, requestClashes. Split `requestTimeOff` into `validate` → `count` → `routeAndPersist` → `notify`.
- `time-off-decision.service.ts` (~260): approve, cancel, update, adminDelete. `approveTimeOff` is wired to `rules.gate()`, so keep it in one file and update `approval-rules-wiring.spec.ts` to point there.
- `time-off-query.service.ts` (~200): getTimeOff, getOrgTimeOff, getLeaveBalance, countLeave, workingDaysOf.
- `availability.service.ts` (~180).

The six injected services then spread across these files: none needs more than 4.

### 1.4 `A/customers/customers.service.ts` — 1,348 lines, 1 dep
Responsibilities:
- **CRM reach and caps**: `clientCompany`, `crmReachFor`, `canReach`, `reachableWhere`, `capsOn`, `assertManage`, `assertCrmReach`, `assertMayCreateIn`, `reachable`, `reachSql`. Called about 20 times inside the file.
- **Contacts**: `decorateContacts`@273 (68), `listContacts`, `listContactCompanies`, `addContact`@400 (**147**), `updateContact`, `removeContact`, `promoteContact`.
- **Client CRUD**: `list`@624 (**120**), `get`, `create`@790 (79), `update`@877 (**103**), `remove`, `assertCustomer`, `assertRefsInOrg`, `keepOrgUserIds`.
- **Activities and reminders**: `listActivities`, `addActivity`, `updateActivity`@1085 (80), `deleteActivity`, `due`@1165 (**154**), plus the helper functions `normalizeReminderKind`, `normalizeRepeat`, `advanceDate`.
- **Sanitizers**: `sanitizeLabelValueRows`, `clientLocaleFrom`, `clientCurrencyFrom`, `sanitizeIds`, `withContactKeys`.

Split:
- `crm-reach.service.ts` (~180): every reach and caps assertion. `portal.service.ts` and `contact-import.service.ts` should also depend on this, instead of on all of `CustomersService`.
- `customer-contacts.service.ts` (~280).
- `customers.service.ts` (~300): CRUD.
- `customer-activities.service.ts` (~200).
- `customer-due.service.ts` (~160): the home Clients card.
- `customer-input.ts` (~90): the pure sanitizers.

### 1.5 `A/portal/portal.service.ts` — 1,268 lines, 2 deps (Prisma, CustomersService)
Responsibilities:
- **Portal configuration**: `cacheConfig`, `shapeConfig`, `listPortals`, `createPortal`, `createSpacePortal`, `ensurePortalForSpace`, `getSpacePortal`, `updateSpacePortal`, `getPortal`, `updatePortal`@311 (71), `deletePortal`, `getConfigForCustomer`, `assertApartmentsModule`.
- **Units**: `unitScope`, `getUnit`, `withResidentUsers`, `listSpaceUnits`, `listCustomerUnits`, `setPrimaryUnit`, `listUnits`, `listAssets`, `createUnit`@806 (70), `updateUnit`@876 (**96**), `deleteUnit`, `setMemberApartment`, `listAvailableUnitsForPortal`, `listAssignableCustomersForPortal`, `removePortalClient`.
- **Unit activity**: `logUnitActivity`, `residentDisplayName`, `listUnitActivities`, `addUnitActivity`.
- **Scope assertions**: `assertCustomerInOrg`, `assertUnitRefsInOrg`, `assertSpaceRefInScope`, `assertUnitRefsInScope`, `assertCustomerInScope`, `assertPortalReach`@720 (50), `assertClientAddressesEditable`, `clearMemberElsewhere`, `keepOrgUserIds`.
- **Intake categories**: `createCategory`, `updateCategory`, `deleteCategory`, `categoryScope`, `reorderCategories`.

Split:
- `portal-config.service.ts` (~300).
- `portal-units.service.ts` (~300).
- `portal-unit-members.service.ts` (~170): setMemberApartment, removePortalClient, the available/assignable lists.
- `portal-unit-activity.service.ts` (~70).
- `portal-scope.service.ts` (~180): all assertions.
- `intake-categories.service.ts` (~140).

### 1.6 `T/space-roles/space-roles.service.ts` — 1,248 lines, 1 dep
Responsibilities:
- **Role catalogue**: `listRoles`, `listSpaceRoles`@160 (56), `createRole`, `updateRole`@252 (**96**), `mergeRole`@348 (63), `deleteRole`, `ensureBuiltInRoles`, `normalizePermissions`, `assertNameFree`, `getOwnedRole`, `uniqueSlug`.
- **Work roles and day rates**: `setWorkRoleHere`, `useWorkRoleIn`, `setRoleDayRate`, `withRateErrors`.
- **Members**: `listMembers`@503 (**99**), `assignMember`@602 (**143**), `updateMemberRoles`@745 (**114**), `removeMember`.
- **Permission builder**: `getMemberPermissions`, `setMemberPermissions`, `dropStalePersonalRole`.
- **Member rates and routing**: `updateMemberRate`@945 (76), `listRateHistory`, `updateMemberRouting`@1054, `assertRoutingInOrg`.

Split:
- `space-role-catalogue.service.ts` (~300).
- `space-work-roles.service.ts` (~120).
- `space-members.service.ts` (~300): listMembers, assignMember, removeMember. Split `assignMember` into `resolveRoles` → `assertCeiling` → `upsertAssignment` → `afterAssign` (rebill hook).
- `space-member-roles.service.ts` (~200): updateMemberRoles plus the permission builder.
- `space-member-terms.service.ts` (~200): rates, rate history, routing.

The grant-ceiling checks must stay in the services they are in today. `space-role-grant-ceiling` memory says every grant path enforces `permissionsExceed`.

### 1.7 `N/modules/websocket/websocket.gateway.ts` — 1,184 lines, 1 dep, 25 `any`
Responsibilities:
- **Connection lifecycle and presence**: afterInit, onModuleDestroy, handleConnection, handleDisconnect, refreshConnectedPresence, scheduleOfflineCheck, markOnline, markOfflineIfIdle, userHasActiveSocket.
- **Authentication**: `handleAuthenticate`@316 (**173**), `handleAuthenticateAgent`@489, `armExpiry`, `freshAccess`.
- **Support agents**: anyAgentOnline, handleSupportTyping, ticketCreator, handleSupportAgentPresenceQuery, emitSupport*.
- **Chat**: handleChatView, isViewingConversation, handleChatTyping, emitChat*.
- **Task rooms**: `handleJoinTask`@646 (50), handleLeaveTask, and the emitTask* methods (10).
- **Admin and monitoring**: verifyStatsAccess, getStats, getConnectedClients, forceDisconnectUser, disconnectOrganization, disconnectWhere.
- **Attendance and space emits**: about 12 one-line emitters.
- **Generic emits**: emitToOrganization, emitToUser (34 callers), emitToRole.

Split:
- Keep `websocket.gateway.ts` as a thin `@WebSocketGateway` (~250): lifecycle plus `@SubscribeMessage` handlers that delegate.
- `socket-auth.service.ts` (~230): the handleAuthenticate body split into `verifyToken` / `loadAccess` / `joinRooms` / `armExpiry`.
- `socket-presence.service.ts` (~120).
- `socket-emitter.service.ts` (~150): emitToUser, emitToOrganization, emitToRole, plus typed event maps. The 24 handlers that inject the gateway only to emit should inject this instead.
- `task-socket-events.ts`, `chat-socket-events.ts`, `support-socket-events.ts` (~100 each).
- `socket-admin.service.ts` (~100).

### 1.8 `A/onboarding/onboarding.service.ts` — 1,134 lines, 3 deps
Responsibilities:
- **Create an organization**: `createOrganization`@109 (**99**).
- **Join by code**: `validateOrgCode`, `submitJoinRequest`@234 (**153**), `notifyJoinRequestSubmitted`.
- **Accept an invitation**: `acceptInvitationForExistingUser`@387 (**138**). This duplicates the flow in `invitation.service.acceptInvitation` (see D7).
- **Status**: `getOnboardingStatus`.
- **Join-request administration**: list, `approveJoinRequest`@641 (**124**), reject, cancel.
- **Organization settings**: regenerateJoinCode, getJoinCode, updateJoinPolicy, updateLeavePolicy, profile badges, `getOrgProfile`, `updateOrgProfile`@1018 (87), updateNotificationPrefs, updateSecuritySettings.

Split:
- `org-creation.service.ts` (~150).
- `join-by-code.service.ts` (~230).
- `join-requests.service.ts` (~260).
- `org-settings.service.ts` (~300). This is not onboarding at all, so give it its own `organizations` module in auth-service.
- `onboarding-status.service.ts` (~70).
- Move the invitation path into `invitations/`.

### 1.9 `T/attendance/clock-in.service.ts` — 1,115 lines, 7 deps
Responsibilities:
- **Zone and context**: `resolveEntryTimezone`, `noShiftAllowanceFor`, `tagClockInContext`@148 (61), `buildShiftStamp`, `unscheduledStamp`, `tagAwayAllowed`@300 (61).
- **Where may I clock in**: `listClockInLocations`, `clockableWorkspaces`.
- **The clock-in itself**: `clockIn`@429 (**611 lines — the largest method in the backend**), `applyDayRequests`, `createEntryOnce`, `getOrCreateRemoteBucket`.

Split `clockIn` into a pipeline: `clock-in.service.ts` stays as the orchestrator (~150) and calls these new files.
- `clock-in-identity.ts`: replay by id (466), occurrence and tap fix (484–499), load the staff user (504).
- `remote-clock-in.service.ts` (~150): the `if (data.isRemote)` branch, lines 565–683, about 120 lines.
- `onsite-clock-in-guard.service.ts` (~150): active assignment (696), already clocked in (707), location (720), GPS accuracy (733), `isAtSite` and away rules (746–800).
- `clock-in-shift-plan.service.ts` (~200): resolve shift, overtime agreed in advance, presence window, schedule flags (803–960). It absorbs `buildShiftStamp`, `unscheduledStamp` and `noShiftAllowanceFor`.
- `clock-in-persist.service.ts` (~120): createEntryOnce, then emit, then arm reminders (960–1040).
- `clock-in-locations.service.ts` (~90): the list endpoint.

### 1.10 `T/attendance/approval.service.ts` — 1,096 lines, 3 deps
Responsibilities:
- **Queue**: getPendingApprovals.
- **Decisions**: approveEntry, rejectEntry, bulkApprove.
- **Edit**: `editEntry`@339 (**283**), `auditEntry`, `getEntryHistory`, `shiftDurationMinutes`, `expectationFor`.
- **Delete**: deleteEntry.
- **Manual back-fill**: `addManualEntries`@731 (**329**).

Split:
- `entry-approval.service.ts` (~250).
- `entry-edit.service.ts` (~300): split `editEntry` into `loadAndAuthorize` → `applyTimes` → `recomputeFlags` → `recount` → `audit`.
- `entry-history.service.ts` (~80).
- `manual-entries.service.ts` (~300): split `addManualEntries` into `assertNotSelf` → `targetDates` → `skipExisting` → `zonedWindow` → `createRows` → `afterCreate` (no-show settle).

### 1.11 `T/attendance/clock-out.service.ts` — 1,075 lines, 7 deps
Responsibilities:
- **Clock-out**: `clockOut`@142 (**350**).
- **Forgotten clock-out**: `resolveForgotClockOut`@492 (**105**).
- **Sweep closers**: closeAbandonedShifts, closeAutoShiftsPastEnd, closePresencePastHours, `closeProvisionally`@721, `closeByDecision`@787.
- **The single close**: `closeEntry`@845 (**131**, with 2 overloads).
- **Alerts**: `sendGeofenceAlert`@983, `sendPendingApprovalAlert`@1035.

Split:
- `clock-out.service.ts` (~250): `clockOut` split into `locate` → `judgeGeofence` → `earlyLeave` → `close` → `announce`.
- `shift-close.service.ts` (~220): closeEntry plus closeByDecision. This is the one writer; the sweeps call it.
- `shift-close-sweeps.service.ts` (~220): the abandoned, auto, presence and provisional closers.
- `forgot-clock-out.service.ts` (~120).
- `attendance-alerts.service.ts` (~110): the two senders. They use `notificationRouting.resolveWatchers` directly even though an `AttendanceRoutingService` exists; merge them there.

### 1.12 `A/billing/billing.service.ts` — 1,050 lines, 3 deps
Responsibilities:
- **Operator**: adminListOrgs, adminSetOrgAddOns.
- **Bill and add-ons**: getBill, setAddOns.
- **Trial**: startTrial@237 (75), expireTrials(+Cron).
- **Reconcile**: scheduleReconcile, countOrgSeats, `reconcileSeats`@718 (**138**), reconcileUsageDaily(+Cron), recordSyncFailure.
- **Agreements**: sweepAgreements, openAgreementAlert.
- **Checkout and portal**: getSubscription, `createCheckout`@532 (**143**), createPortal, cancel.
- **Webhooks**: applyWebhook, handleEvent, orgIdByCustomer, setStatusByCustomer, `syncSubscription`@960 (**91**).

Split:
- `billing-reconcile.service.ts` (~260).
- `billing-checkout.service.ts` (~250).
- `billing-webhook.service.ts` (~200).
- `billing-trial.service.ts` (~130).
- `billing-agreements.service.ts` (~100).
- `billing.service.ts` (~150): bill, add-ons, operator.

Put all `@Cron` handlers in `billing-cron.ts` with the `cron_locks` lease.

### 1.13 `T/attendance/break.service.ts` — 1,025 lines, 3 deps
Responsibilities:
- **The member's own rests**: `startBreak`@55 (**161**), `endBreak`@422 (**146**), snoozeBreak, getBreakStatus.
- **Office actions**: `addBreakForMember`@216 (**130**), `deleteBreak`@346 (76), `endBreakManually`@849 (**98**).
- **Reads**: getBreaksForEntry, getActiveBreaks, `getBreakHistory`@767 (82), getBreakSummary@947 (79).

Split:
- `break-self.service.ts` (~300).
- `break-admin.service.ts` (~300).
- `break-query.service.ts` (~260).

`startBreak` and `addBreakForMember` share an overlap and recount tail; extract it as `insertBreakAndRecount()`. Likewise `endBreak` and `endBreakManually` share `closeBreakAndRecount()`.

### 1.14 `N/handlers/attendance-notification.handler.ts` — 1,016 lines, 5 deps
It holds 31 `@EventPattern` handlers in five families:
- **Shift**: reminder, escalation, closed provisionally, left early, resolved.
- **Rests**: due, over, started, ended.
- **No-show**: reminder, escalation, resolved.
- **Overtime and auto-clock**.
- **Excursion**: 6 handlers.
- **Presence and roster socket relays**: about 8 one-liners.

22 `try { await push } catch { log }` blocks repeat the same shape.

Split:
- `shift-notification.handler.ts` (~250).
- `rest-notification.handler.ts` (~150).
- `no-show-notification.handler.ts` (~150).
- `excursion-notification.handler.ts` (~200).
- `attendance-socket-relay.handler.ts` (~120).

Add a helper `deliver({ push, socket, store, email })` in `N/handlers/deliver.ts`, so each handler is about 15 lines.

### 1.15 `A/invitations/invitation.service.ts` — 949 lines, 3 (+1 optional) deps
Responsibilities:
- **Create**: `createInvitation`@125 (**344**), `capAccessProfilePerms`, `generateCode`, `checkExternalSpaceGrant`@469 (**119**), `clientInviteLocale`.
- **Lifecycle**: resendInvitation, validateCode, `acceptInvitation`@659 (**154**), issueJoiningContract, listInvitations, revokeInvitation.

Split:
- `invitation-create.service.ts` (~300): split `createInvitation` into `assertInviter` → `resolveTarget` → `assertExternalGrant` → `persist` → `send`.
- `invitation-external-grant.service.ts` (~130).
- `invitation-accept.service.ts` (~220): shared with onboarding's existing-user path.
- `invitations.service.ts` (~200): list, validate, resend, revoke.

### 1.16 Second tier (also > 700 lines), shorter proposals
- **`T/workflows/workflows.service.ts`** (948):
  - `workflows.service.ts`: CRUD and default.
  - `workflow-statuses.service.ts`: add, update, reorder, remove, stepOf.
  - `definition-of-done.service.ts`.
  - `space-workflows.service.ts`: list, `attachSpaceWorkflow`@689 (**113**), share, fork, detach, setSpaceDefault.
- **`T/tasks/task-status.service.ts`** (826, 7 deps): `updateStatus`@125 is **616 lines**. Split it into `status-authority.ts` (role, crew and cross-org checks), `status-transition.ts` (workflow vs canonical machine), `execution-guards.service.ts` (clock gate, geofence, single active task), `status-effects.service.ts` (route stamps, pause end, crew join, role pool close, notify, blocked-task reminder) and `step-form-crm.service.ts` (`applyStepFormCrm`, `runsCrm`). Target: an orchestrator under 120 lines.
- **`T/calendar/events.service.ts`** (825, 34 lines > 140 chars):
  - `calendar-events.service.ts`: create, update, cancel, get.
  - `event-attendance.service.ts`: respond, snooze, done.
  - `calendar-people.service.ts`: inviteable, circleOf, people, availability, teamOf, freeSlots.
  - `event-reminder-sweep.service.ts`: sweepDue.
- **`T/assets/assets.service.ts`** (771): `update`@445 is **234 lines**. Extract `asset-update.service.ts` with a `moveKind` step (`keepFieldsForKind`) and the custody hand-off. Move `getMaintenanceHistory` to the reports module.
- **`T/reports/reports.service.ts`** (744): `create`@71 (**185**). Split into `service-reports.service.ts` (create, update, find), `report-parts.service.ts` and `report-attachments.service.ts`.

---

## 2. DRY — logic repeated across services

**D1. Timezone fallback is hand-written 59 times, with two different defaults.**
- `X.timezone || 'UTC'` and `?? 'UTC'` appear in: `T/attendance/clock-in.service.ts` (11×: 168, 338, 531, 557, 772, 863, 888, 948, 969, 979, 1020), `clock-out.service.ts:398,760`, `extra-time.service.ts:117`, `auto-clock.service.ts:306,315`, `shift-sweep.service.ts:292-293`, `presence/presence.service.ts:236`, `shift-resolver.service.ts:86`, `A/invoices/invoice.service.ts:1038`, `A/invoices/statement.service.ts:167,310`.
- `'Europe/Berlin'` is the fallback in `T/attendance/approval.service.ts:848`, `T/tasks/role-pool.service.ts:252`, `T/calendar/calendar.service.ts:207` and `T/technicians/cover.service.ts:335,374,395,445`. **This is a latent inconsistency:** one space with no zone gets two different "todays" depending on the code path.
- The shared `workspaceZone()` (workspace → org → UTC) is used in only 5 files.
- Fix: add `entryZone(entry)`, `spaceZone(space, org?)` and `memberZone(user, space?)` to `packages/shared/src/timezone/` next to `workspaceZone`. Then add a guard spec in the style of `distance-display-guard`: no `timezone || '`.

**D2. The "assignment active now" window is inlined about 21 times.**
- The pattern is `effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }]`.
- It appears in: `A/auth/sign-in.service.ts:223`, `A/auth/session-tokens.service.ts:243`, `A/auth/token-validation.service.ts:105` (the three session builders), `T/common/own-request-route.ts:31`, `T/common/approval-rules/approval-rules.service.ts:251,270`, `approval-route.service.ts:121`, `T/attendance/shift-sweep.service.ts:272`, `shift-resolver.service.ts:114,236`, `T/tasks/role-pool.service.ts:696`, `T/space-roles/space-roles.service.ts:546`, `T/technicians/request-precheck.service.ts:50,105`, `T/approvals/stand-ins.service.ts:94,99,118,231`, `T/shifts/shifts.service.ts:395`, `N/modules/websocket/socket-access.ts:56`.
- `activeAssignmentWhere(userId, now)` in `packages/shared/src/access/assignment-window.ts:16` requires a userId, so nested relation filters cannot use it.
- Fix: add `activeWindowWhere(now)` (no userId) to the same file, have `activeAssignmentWhere` compose it, and replace all ~21 copies. CLAUDE.md already warns that the list and the check must not drift.

**D3. Fire-and-forget notification emits.**
- 112 `.emit('literal'` calls. Five private wrappers do the same thing:
  - `approval.service.ts:60` `emitChanged`
  - `shift-issues.service.ts:125` `emit`
  - `events.service.ts:330` `notify` (with no try/catch)
  - `locations.service.ts:77` `announce`
  - `overtime.service.ts:57` `notify` (the typed, correct one)
- Other places emit raw, e.g. `clock-out.service.ts:393,415,754,959,1010,1056`.
- Fix: a `NotificationBus` in `T/common/notification-bus.ts` (and its auth-service twin), typed by an event map in `packages/shared/src/notifications/events/<domain>.ts` (`{ name: const, payload: interface }`), with try/catch and logging built in. Model it on `OVERTIME_NOTICE_EVENT` in `packages/shared/src/attendance/overtime-notice.ts`. The notification-service `@EventPattern` then imports the same constant and type.

**D4. "Look up the name, resolve watchers, emit".**
- `clock-out.service.ts:1035-1075` and `:983` do `prisma.user.findUnique({select:{firstName,lastName}})`, then `notificationRouting.resolveWatchers(...)`, then emit.
- The select `{ firstName: true, lastName: true }` appears 41 times. `${x.firstName} ${x.lastName}` is hand-built 73 times (task-assignment.service ×8, document-routing ×5, document-registers ×5, shift-sweep ×4, clock-out ×4, role-pool ×3).
- `personName()` already exists in `packages/shared/src/people/person-name.ts:17` (28 callers).
- Fix: route all of these through `personName` and add a guard spec. Also add `AttendanceRoutingService.notifyWatchers(event, subjectUserId, payload)`; it already exists as a service and is bypassed.

**D5. Code hashing is duplicated.**
- `A/invitations/invitation.service.ts:41` redefines `hashCode`, which is identical to `packages/shared/src/utils/crypto.ts:7` (onboarding imports the shared one).
- `A/auth/auth-common.ts:34` `hashToken` is the same SHA-256 hex.
- `code.toUpperCase().trim()` appears 5 times in onboarding.
- Fix: delete the local copy and add `normalizeJoinCode()` beside `joinCodeCandidates()` in shared.

**D6. Days-worked and site-time gathering is done twice.**
- `A/invoices/invoice.service.ts:1300` `gatherSiteTime` (time entries plus tasks, per space zone, `dayKeyIn`, `workedDays`) and `A/invoices/statement.service.ts:129-315` both query `timeEntry.findMany` and `task.findMany` and bucket by `dayKeyIn(at, tzOfSpace)`.
- `work-source.ts` (123 lines) already holds part of this.
- Fix: one `SiteTimeService` (or extend `work-source.ts`) that returns `{ hoursRuns, dayRuns, jobs }` per person and space. The invoice and the statement then cannot disagree about a "day worked".

**D7. Accepting an invitation is implemented twice.**
- `A/onboarding/onboarding.service.ts:387` `acceptInvitationForExistingUser` (138 lines) and `A/invitations/invitation.service.ts:659` `acceptInvitation` (154 lines).
- They already share `invitation-apply.ts` (`claimInvitation`, `applyInvitationPlacement`), but each still does its own validate → claim → place → contract → notify orchestration.
- Fix: one `InvitationAcceptService.accept(user | newUser, code)`.

**D8. Organization-scope assertions and lookups.**
- Private `assert*InOrg` helpers in `customers.service.ts:1016`, `portal.service.ts:622,641`, `document-types.service.ts`, `break-rules.service.ts`, `space-roles.service.ts:1110`.
- 22 hand-written `findFirst({ where: { id, organizationId } })` followed by NotFound, while `assertFoundInOrg` already has 48 callers. Examples: `T/tasks/task-scope.ts` ×4, `chat-reach.service.ts` ×2, `events.service.ts` ×2, `approval-rules.service.ts` ×2, `portal.service.ts` ×2, `customers.service.ts` ×2.
- `keepOrgUserIds` is wrapped privately twice: `customers.service.ts:1004` and `portal.service.ts:802`.
- Fix: add `assertIdsInOrg(prisma, model, ids, orgId)` to `packages/shared/src/records/`. Extend `found-in-org-guard.spec.ts` to catch the `findFirst` + `throw new NotFoundException` shape.

**D9. Counted-time recount after a mutation.**
- `countedTime.*` is called after break, edit, extra-time and clock-out writes: `break.service.ts` ×4, `approval.service.ts` ×2, `extra-time.service.ts` ×3, `clock-out.service.ts` ×2, `shift-rematch.service.ts` ×1.
- Each site re-reads the entry, recomputes and emits `attendance_changed`.
- Fix: `CountedTimeService.recountAndAnnounce(entryId, reason)`.

**D10. Schedule flags.**
- `computeScheduleFlags` is called with hand-assembled inputs at `approval.service.ts:453`, `open-shift-close.ts:115`, `clock-in.service.ts:918` and `shift-rematch.service.ts:155`.
- Fix: one adapter, `scheduleFlagsForEntry(entry, shiftWindow)`, in `T/attendance/schedule-flags.ts`.

---

## 3. Typing — `any` hot spots

Counts of `: any` in non-test code: task-service 278, auth-service 187, notification-service 55, tracking-service 2. 300 of 700 `@Payload()` parameters are `any`. By directory:

| Module | `@Payload() any` |
|---|---|
| `T/assets` (assets.controller.ts) | 45 |
| `A/documents` (documents.controller.ts) | 41 |
| `A/platform-admin` (3 controllers) | 33 |
| `T/chat` | 19 |
| `T/calendar` | 18 |
| `A/auth` | 14 |
| `N/handlers` | 13 |
| `T/tasks` | 11 |
| `A/space-sharing`, `A/customers` | 9 each |
| `T/support`, `T/shift-issues` | 8 each |

Other hot spots:
- `N/modules/websocket/websocket.gateway.ts` has 25: `emitTask*(task: any)` (861–951), `emitClockIn/Out(timeEntry: any)` (1016, 1024), `emitBreak*` (1034, 1040), `emitToUser/Organization/Role(data: any)` (1158–1184), and `decoded: any` from `jwt.verify` (326, 729).
- `T/tasks/task-report.service.ts` 13, `T/sprints/sprints.service.ts` 12, `A/invoices/invoice.service.ts` 8, `T/technicians/technicians.service.ts` 7.
- `(data as any).reason` at `T/tasks/task-assignment.service.ts:346` and `(task as any).openSpots` at `T/tasks/task-records.service.ts:355` are casts that hide a missing DTO field.

Proposal: a typed RPC contract per module in `packages/shared/src/rpc/<module>.ts`.

```ts
export const ASSETS_RPC = {
  findAllCategories: 'find_all_asset_categories',
  ...
} as const;
export interface AssetsRpc {
  findAllCategories: { req: CallerCtx & { spaceId?: string }; res: AssetCategory[] };
  ...
}
```

- `CallerCtx` (`{ userId, organizationId, userRole, access?, spaceIds? }`) is defined once. Nearly every payload starts with it.
- The service writes `@MessagePattern({ cmd: ASSETS_RPC.findAllCategories }) find(@Payload() d: AssetsRpc['findAllCategories']['req'])`. The gateway's `BaseGatewayService.send<K>(ASSETS_RPC[K], req)` infers the response type.
- This also removes the 615 duplicated `cmd` string literals.
- Order of work by count: assets, documents, platform-admin, chat, calendar, auth, tasks.
- For events: `packages/shared/src/notifications/events/{attendance,task,chat,support}.ts`, as in D3.
- For sockets: add a `ServerToClientEvents` map and type the gateway as `Server<…, ServerToClientEvents>`, so `emitToUser(userId, 'task.updated', payload)` is checked.
- Add a lint rule, `@typescript-eslint/no-explicit-any` set to warn, on `*.controller.ts` and `*.handler.ts` in these four services, and ratchet it down.

---

## 4. Risky couplings

**Constructor dependency counts (≥ 7):**

| Deps | File | Note |
|---|---|---|
| 14 | `A/documents/documents.service.ts` (356 lines) | A facade over the document sub-services. Acceptable as a facade, but every caller pulls in 14 services. Callers such as `invitation.service` should depend on the specific sub-service (`document-templates`, for `issueJoiningContract`). |
| 10 | `T/tasks/tasks.service.ts` (227) | A facade. It is also the source of the cycle below. |
| 10 | `T/tasks/task-report.service.ts` (603) | Composes 10 reads, which is by design. Fine, but it has 13 `any` and 20 lines > 140 chars. |
| 9 | `T/attendance/attendance.service.ts` (196) | A facade. |
| 7 each | `task-status.service.ts`, `handover/crew.service.ts`, `chat/chat.service.ts`, `attendance/clock-out.service.ts`, `attendance/clock-in.service.ts`, `assets/asset-proposal.service.ts`, `A/users/users.service.ts`, `A/auth/auth.service.ts` | The splits in section 1 bring each piece to 3–4. |

**The forwardRef cycle:**
- `T/tasks/role-pool.service.ts:71` injects `forwardRef(() => TasksService)` and uses only three methods: `assertMayAssignTask` (147), `assertCanReceiveTasks` (361) and `onAssigneesChanged` (398, 452). All three are facade pass-throughs to `TaskAssignmentService` (`tasks.service.ts:150-159`).
- `T/tasks/task-assignment.service.ts:42` and `T/tasks/task-records.service.ts:38` inject `forwardRef(() => RolePoolService)` for `returnToRole` (346), `syncSpots` (623), `resolveOpenRole` (250), `openColumns` (257) and `afterOpened` (355).
- Fix:
  - Split `RolePoolService` into `role-pool-spots.service.ts` (syncSpots, openColumns, resolveOpenRole, afterOpened, returnToRole; Prisma only) and `role-pool.service.ts` (take, sweep, offers), which depends on `TaskAssignmentService` directly rather than on the facade.
  - Assignment and records then depend on `RolePoolSpotsService`. No forwardRef remains.

**Other couplings:**
- `PortalService` injects the whole of `CustomersService` (1,348 lines) for reach checks. It should depend on the `crm-reach.service.ts` from 1.4.
- 24 notification handlers inject the full `WebsocketGateway` (emitToUser has 34 call sites). This couples every handler to socket lifecycle code. It should be the `socket-emitter.service.ts` from 1.7.
- `clock-out.service.ts` injects both `NotificationRoutingService` and `AttendanceRoutingService`, which is two routing paths for one domain (see D4).

---

## 5. Prioritized refactors (highest value first)

| # | Refactor | Size | Risk | Why first |
|---|---|---|---|---|
| 1 | **Timezone fallback unification (D1)**: shared `entryZone/spaceZone/memberZone` plus a guard spec; settle UTC vs `Europe/Berlin`. | M | Med. Behaviour changes for zone-less spaces on the `Europe/Berlin` paths, so count prod spaces with a null timezone first. | It is a correctness bug, not only style: two "todays" for the same space. |
| 2 | **`activeWindowWhere(now)` (D2)** replacing about 21 inline windows, the three session builders included. | S | Low. Same predicate, plus a spec. | CLAUDE.md requires that the list and the check never drift. |
| 3 | **Typed RPC contracts plus cmd constants (section 3)**, starting with assets (45) and documents (41). | L (incremental) | Low per module, because it is types only. | Removes 300 `any` and 615 duplicated strings, and catches gateway/service drift at compile time. |
| 4 | **Typed notification event bus (D3)**: shared event map, `NotificationBus`, and handlers importing the same types. | M | Low–Med: event names must stay byte-identical. | 112 emits and 99 patterns are agreed only by convention today. |
| 5 | **Break up `ClockInService.clockIn` (611 lines) and `TaskStatusService.updateStatus` (616)** into pipelines (1.9, 1.16). | L | **High**. They are the hottest paths, with offline replay and evidence semantics. Do it only behind `tools/clock-audit.py`, `auto-clock-e2e.py` and `crew-e2e.py`. | The two largest methods. Every attendance or crew change lands here. |
| 6 | **Remove the forwardRef cycle** by splitting `RolePoolService` (section 4). | S | Low; `role-tasks-e2e.py` covers it. | Removes the only circular dependency. |
| 7 | **Split `locations.service.ts`** (1,651) into workspace / roster / auto-clock-offer (1.1). | M | Low–Med: mostly moving methods. Watch the `rebill()` hooks on assignment routes. | The largest file. Roster logic is reused by clock-in. |
| 8 | **Split `technicians.service.ts` time-off (about 750 lines) into request / decision / query (1.3).** | M | Med. `approval-rules-wiring.spec.ts` asserts that `approveTimeOff` calls `rules.gate()`, so update its path. | Leave is a large, actively changing domain hidden inside "technicians". |
| 9 | **Shared site-time gathering (D6) plus the invoice service split (1.2).** `gather` is 402 lines. | M | Med. Money: snapshot-test the gather output of a real invoice before and after. | The invoice and the worker's statement must agree on days worked. |
| 10 | **Notification-service: `socket-emitter` plus a `deliver()` helper, and split the attendance handler (1.7, 1.14).** | M | Low. | Removes 22 copy-pasted try/catch blocks and 25 `any`, and decouples 24 handlers from the gateway's lifecycle. |

Quick wins under 1 hour each: D5 (delete the duplicate `hashCode`, `invitation.service.ts:41`); route the 73 hand-built names through `personName`; the `(data as any).reason` at `task-assignment.service.ts:346`.
