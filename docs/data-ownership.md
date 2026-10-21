# Who owns which table — the data ownership map

> **Status: APPROVED by the owner (2026-10-20)** — decisions below. Phase 3.1 of `docs/plans/code-structure-fix.md`.
> Generated from the code: every `prisma.<model>.create/update/upsert/delete…` and every raw `INSERT/UPDATE/DELETE`
> in `apps/api/*/src` (tests excluded). **Owner = the one service allowed to write a table.** Reading another
> service's table stays allowed for now (Phase 3.4 shrinks it); writing one is what Phase 3.3 removes.

## The picture

- **124 tables**, one schema (`apps/api/auth-service/prisma/schema.prisma`, 6,145 lines).
- **108 tables are already written by exactly one service.** 16 are written by two or three — **30 places in the code** (below).
- **8 tables are never read or written** by the services' code: Alert, DailyMetric, HealthMetric, ModulePrice, OrganizationAccess, PricingConfig, ScheduleTemplate, SeatPrice — candidates to delete after a check (the operator console or a raw query could still use one). Epic and Phase are written through `common/planning-items.ts`, SyncTombstone by a database trigger — all three are task-service's.
- The gateway writes no table (correct — it has no database).

| Service | Owns |
|---|---|
| **auth** (40) | AccessRole, ActivityLog, BillingAlert, BillingEvent, BlogImage, BlogPost, Customer, CustomerActivity, CustomerContact, CustomerSignLink, CustomerUnit, DeviceKey, Document, DocumentEvent, DocumentSignature, DocumentSigner, DocumentTemplate, DocumentType, IntakeCategory, Invitation, Invoice, InvoiceItem, JoinRequest, LegalEntity, LegalEntityBankAccount, NotificationWatch, Organization, PasswordResetToken, PlatformAuditLog, PlatformUser, Portal, RefreshToken, SpaceShare, SpaceShareRequest, Subscription, SupportRoutingRule, SupportTeam, SupportTeamMember, UnitActivity, User |
| **task** (71) | ApprovalDelegation, ApprovalNotice, ApprovalRule, ApprovalStep, Asset, AssetActivity, AssetCategory, AssetCustody, AssetHolder, AssetListRow, AssetLogReminder, AssetMoney, AssetProposal, AssetType, Attachment, Break, BreakRule, CalendarAttendee, CalendarEvent, CalendarFeedToken, CalendarHoliday, ChecklistItem, Comment, CompanyLocation, Conversation, ConversationMember, CustomFieldDefinition, CustomFieldValue, DefinitionOfDone, Epic, GeofenceExcursion, LabelCheckFinding, LabelCheckRun, LeaveAdjustment, Message, OvertimeRequest, PartUsed, Phase, RateHistory, RecurringTaskTemplate, ReportAttachment, ReportDefinition, ReportSchedule, ServiceReport, Shift, ShiftAssignment, ShiftInstance, ShiftIssue, ShiftIssueEvent, SpaceAssignment, SpaceWorkflow, Sprint, SprintReport, StatusWorkflow, SupportMessage, SupportTicket, SyncTombstone, Task, TaskAssignee, TaskDependency, TaskEvent, TaskHandover, TaskStepSubmission, TechnicianSchedule, TimeEntry, TimeEntryNote, TimeEntryNoteAttachment, TimeEntryPresence, TimeOff, WorkflowStatus, WorkflowTemplate |
| **notification** (2) | NotificationDelivery, UserPushToken |
| **tracking** (3) | LocationHistory, TaskRoute, WorkerLastLocation |
| **shared infrastructure** (1) | CronLock — the scheduled-job lease, written by raw SQL in `packages/shared/src/scheduling/cron-lock.ts` from every service that runs a sweep |
| **(nobody uses it)** (8) | Alert, DailyMetric, HealthMetric, ModulePrice, OrganizationAccess, PricingConfig, ScheduleTemplate, SeatPrice |

## The 30 writes across a boundary, and the proposed fix

### A. Deleting an account (auth deletes other services' rows)

Each owner gets an **erase-member** handler (`member_erase` RPC) and auth calls them in order; auth keeps the order and the audit row. Erasure stays complete because auth waits for every answer before it reports done.

| Table | Written by | Owner | Where |
|---|---|---|---|
| UserPushToken | auth | notification | `auth-service/src/modules/auth/account-deletion.service.ts:82` (deleteMany) |
| WorkerLastLocation | auth | tracking | `auth-service/src/modules/auth/account-deletion.service.ts:83` (deleteMany) |
| LocationHistory | auth | tracking | `auth-service/src/modules/auth/account-deletion.service.ts:84` (deleteMany) |
| Comment | auth | task | `auth-service/src/modules/auth/account-deletion.service.ts:85` (deleteMany) |

### B. Removing a workspace (task deletes auth's portal categories and shares)

task-service asks auth-service to drop them (`space_purge_auth_side` RPC) inside the same purge.

| Table | Written by | Owner | Where |
|---|---|---|---|
| IntakeCategory | task | auth | `task-service/src/modules/spaces/space-lifecycle.service.ts:203` (deleteMany) |
| SpaceShare | task | auth | `task-service/src/modules/spaces/space-lifecycle.service.ts:207` (deleteMany) |

### C. Accepting an invitation (auth places the new member in task's tables)

**Kept as an agreed exception (owner, 2026-10-20).** Joining is the account, the spent invitation code and the placement in ONE transaction; behind a message, a task-service outage would leave an account in no workspace with its code already used — nothing on screen explains or repairs that. Only `invitation-apply/placement.ts` may write these two tables from auth-service (the structure check names the file).

| Table | Written by | Owner | Where |
|---|---|---|---|
| TechnicianSchedule | auth | task | `auth-service/src/modules/invitations/invitation-apply/placement.ts:101` (createMany) |
| SpaceAssignment | auth | task | `auth-service/src/modules/invitations/invitation-apply/placement.ts:137` (upsert) |

### D. Workspace roles (task-service writes `AccessRole`) — DONE, two kept exceptions

Auth owns `AccessRole`. Seeding the built-ins, creating and editing a role now go through auth
(`access_roles_ensure_builtins`, `space_role_create`, `space_role_update`; task-service `RoleWriter`).

**Kept where they are (owner decision):** deleting a role and merging one into another
(`role-admin.service.ts`) and dropping a stale personal role (`space-roles.base.ts`). Each moves the
holders and deletes the role in ONE transaction; split across a message, a failure would leave
people on a deleted role or a role nobody can remove. Listed in `ALLOWED` in `tools/structure/ownership.mjs`.

### E. The activity log (both services append to `ActivityLog`)

**Proposed exception:** an append-only log any service may INSERT into, never update or delete. With `CronLock` (the shared scheduled-job lease) these are the only two tables more than one service may write.

| Table | Written by | Owner | Where |
|---|---|---|---|
| ActivityLog | task | auth | `task-service/src/modules/attendance/auto-clock-undo.service.ts:105` (create) |
| ActivityLog | task | auth | `task-service/src/modules/attendance/entry-service.base.ts:103` (create) |
| ActivityLog | task | auth | `task-service/src/modules/attendance/shift-rematch.service.ts:264` (create) |

### F. Single fields owned elsewhere — DONE

Moved to the owner (one message each):

| What | Was written by | Now |
|---|---|---|
| The in-app inbox (`NotificationDelivery`: list, mark read) | auth | notification-service answers `list_notifications` / `mark_notifications_read` itself; the gateway asks it |
| A signed-out phone's push token (`UserPushToken`) | auth | `remove_push_token` to notification-service, scoped to the member, awaited (5 s) |
| A deleted support team's tickets (`SupportTicket`) | auth | `support.unassign_team` to task-service FIRST; the team is deleted only after it answers |
| Auto-clock consent (`User.autoClockConsentAt`) | task | `user_set_auto_clock_consent` to auth; the member sees 503 if it cannot be kept |
| The language an app reports (`User.locale`) | notification | `user_set_locale` to auth, best effort |
| Presence (`User.lastActiveAt`, connect + heartbeat + gone) | notification | `users_mark_active` / `user_mark_inactive` to auth, best effort |

Kept where they are (listed in `ALLOWED`, reason at the code):

- `task-service/.../calendar/holidays.service.ts` → `Organization`: the calendar's own columns, read only by task-service; switching feeds off goes with the token wipe.
- `task-service/.../technicians/leave-opening.service.ts` → `Organization`: the tracking-start day commits with the first starting balances.
- `auth-service/src/common/seed-default-workflow.ts` → `StatusWorkflow`: sign-up creates the organization and its default task type in one transaction — the same reason as group C.

**The job's trip distance** (decision 2) → `TaskRoute` (`task_routes`), written only by tracking-service
(`trip-distance.ts`: one upsert statement per batch, the late-points recount as an upsert). Migration
`20261021090000_task_routes` is additive: it copies every recorded distance against its trip (110/110
locally) and keeps `tasks."routeDistance"` — now `legacyRouteDistance` in Prisma, never written — for a later
checked drop. The start/end times stay on the job: task-service sets them on the status change. A new trip
needs no reset — the row names the trip it counted (`legStartedAt`), and every reader asks `tripDistanceOf`
/ `TRIP_DISTANCE_SQL` in shared (route reads, member performance, the report's km column).

## Reading another service's tables (Phase 3.4 — later)

Most read by services that do not own them:

| Table | Owner | Reads elsewhere |
|---|---|---|
| User | auth | task 126, notification 5, tracking 1 |
| Organization | auth | task 26 |
| Task | task | auth 12, notification 2, tracking 5 |
| CompanyLocation | task | auth 17 |
| AccessRole | auth | task 16 |
| SpaceAssignment | task | auth 6 |
| Customer | auth | task 6 |
| TimeEntry | task | auth 4, notification 1 |
| SpaceShare | auth | task 4, notification 1 |
| WorkerLastLocation | tracking | task 3 |
| TaskEvent | task | auth 2 |
| ServiceReport | task | auth 2 |
| Portal | auth | task 2 |
| PlatformUser | auth | task 1, notification 1 |
| NotificationDelivery | notification | auth 2 |

`User` and `Organization` are read everywhere because every rule needs a name, a timezone or a role. Phase 3.4 does not forbid that — it replaces the direct reads with one small cached reader per owner.

## Decisions (owner, 2026-10-20)

- **AccessRole → auth owns it**; task-service's role screens ask auth through a message.
- **A job's route → its own `TaskRoute` table, owned by tracking** (additive migration); the job page reads it through the existing route request.
- **The 8 unused tables stay for now**; removed later in a separate, checked migration.
- **ActivityLog (insert only) and CronLock (through the shared lease helper) may be written by any service.**
- **Accepting an invitation keeps writing the new member's workspace assignment and schedule** inside auth's join transaction (group C) — the one file-level exception.

## The questions that were asked

1. **Workspace roles (`AccessRole`).** The roles are *read* by auth-service on every sign-in (the session is built from them) but *written* by task-service's space-roles screens (7 places). Either **auth owns them** and task-service asks auth to change a role (recommended — who-may-do-what belongs with sign-in), or task-service owns them and auth only reads.
2. **A job's route** (`Task.routeDistance`, `routeStartedAt`, `routeEndedAt`). tracking-service writes these three fields on every GPS batch. Either task-service owns them and tracking sends an event (one more hop per batch), or **the route moves into tracking's own table** (`TaskRoute`, recommended — tracking is the only writer and reader of the numbers; the job page reads them through the existing route RPC).
3. **The 8 unused tables** — delete them in a migration after checking the operator console, or keep them?
4. **The two shared tables (E)** — agree that `ActivityLog` (append-only) and `CronLock` (the job lease) may be written by any service?

## Appendix — every table

Writes / reads per service (code, not tests).

| Table | Owner | auth | task | gateway | notification | tracking |
|---|---|---|---|---|---|---|
| AccessRole | auth | 4 / 14 | 7 / 16 |  |  |  |
| ActivityLog | auth | 4 / 2 | 3 / 2 |  |  |  |
| Alert | — |  |  |  |  |  |
| ApprovalDelegation | task |  | 2 / 4 |  |  |  |
| ApprovalNotice | task |  | 1 / 1 |  |  |  |
| ApprovalRule | task |  | 3 / 7 |  |  |  |
| ApprovalStep | task |  | 5 / 2 |  |  |  |
| Asset | task | 0 / 2 | 8 / 26 |  |  |  |
| AssetActivity | task |  | 3 / 1 |  |  |  |
| AssetCategory | task |  | 3 / 13 |  |  |  |
| AssetCustody | task |  | 2 / 8 |  |  |  |
| AssetHolder | task |  | 2 / 1 |  |  |  |
| AssetListRow | task |  | 3 / 4 |  |  |  |
| AssetLogReminder | task |  | 1 / 0 |  |  |  |
| AssetMoney | task |  | 6 / 22 |  |  |  |
| AssetProposal | task |  | 6 / 9 |  |  |  |
| AssetType | task |  | 3 / 8 |  |  |  |
| Attachment | task | 0 / 1 | 3 / 8 |  |  |  |
| BillingAlert | auth | 7 / 4 |  |  |  |  |
| BillingEvent | auth | 2 / 1 |  |  |  |  |
| BlogImage | auth | 1 / 1 |  |  |  |  |
| BlogPost | auth | 3 / 4 |  |  |  |  |
| Break | task |  | 9 / 13 |  |  |  |
| BreakRule | task |  | 3 / 5 |  |  |  |
| CalendarAttendee | task |  | 9 / 3 |  |  |  |
| CalendarEvent | task |  | 3 / 5 |  |  |  |
| CalendarFeedToken | task |  | 3 / 2 |  |  |  |
| CalendarHoliday | task |  | 4 / 3 |  |  |  |
| ChecklistItem | task |  | 6 / 8 |  |  |  |
| Comment | task | 1 / 1 | 1 / 3 |  |  |  |
| CompanyLocation | task | 0 / 17 | 10 / 70 |  |  |  |
| Conversation | task |  | 7 / 7 |  |  |  |
| ConversationMember | task |  | 12 / 8 |  | 0 / 1 |  |
| CronLock | — |  |  |  |  |  |
| CustomFieldDefinition | task |  | 3 / 7 |  |  |  |
| CustomFieldValue | task |  | 1 / 1 |  |  |  |
| Customer | auth | 10 / 30 | 0 / 6 |  |  |  |
| CustomerActivity | auth | 8 / 7 | 0 / 1 |  |  |  |
| CustomerContact | auth | 6 / 6 | 0 / 1 |  |  |  |
| CustomerSignLink | auth | 4 / 6 |  |  |  |  |
| CustomerUnit | auth | 11 / 15 | 0 / 2 |  |  |  |
| DailyMetric | — |  |  |  |  |  |
| DefinitionOfDone | task |  | 3 / 3 |  |  |  |
| DeviceKey | auth | 7 / 2 |  |  |  |  |
| Document | auth | 19 / 40 | 0 / 2 |  |  |  |
| DocumentEvent | auth | 16 / 3 |  |  |  |  |
| DocumentSignature | auth | 2 / 3 |  |  |  |  |
| DocumentSigner | auth | 7 / 11 |  |  |  |  |
| DocumentTemplate | auth | 3 / 5 |  |  |  |  |
| DocumentType | auth | 3 / 6 | 0 / 1 |  |  |  |
| Epic | — |  | 0 / 1 |  |  |  |
| GeofenceExcursion | task |  | 14 / 7 |  |  |  |
| HealthMetric | — |  |  |  |  |  |
| IntakeCategory | auth | 7 / 5 | 1 / 0 |  |  |  |
| Invitation | auth | 5 / 9 |  |  |  |  |
| Invoice | auth | 5 / 11 |  |  |  |  |
| InvoiceItem | auth | 2 / 4 |  |  |  |  |
| JoinRequest | auth | 7 / 10 |  |  |  |  |
| LabelCheckFinding | task |  | 1 / 0 |  |  |  |
| LabelCheckRun | task |  | 2 / 0 |  |  |  |
| LeaveAdjustment | task |  | 4 / 5 |  |  |  |
| LegalEntity | auth | 6 / 7 | 0 / 1 |  |  |  |
| LegalEntityBankAccount | auth | 2 / 0 |  |  |  |  |
| LocationHistory | tracking | 1 / 0 |  |  |  | 3 / 8 |
| Message | task | 0 / 1 | 3 / 6 |  |  |  |
| ModulePrice | — |  |  |  |  |  |
| NotificationDelivery | notification | 1 / 2 |  |  | 1 / 0 |  |
| NotificationWatch | auth | 2 / 1 | 0 / 1 |  |  |  |
| Organization | auth | 29 / 52 | 2 / 26 |  |  |  |
| OrganizationAccess | — |  |  |  |  |  |
| OvertimeRequest | task | 0 / 1 | 13 / 22 |  |  |  |
| PartUsed | task |  | 3 / 2 |  |  |  |
| PasswordResetToken | auth | 5 / 1 |  |  |  |  |
| Phase | — |  | 0 / 1 |  |  |  |
| PlatformAuditLog | auth | 1 / 1 |  |  |  |  |
| PlatformUser | auth | 13 / 19 | 0 / 1 |  | 0 / 1 |  |
| Portal | auth | 5 / 17 | 0 / 2 |  |  |  |
| PricingConfig | — |  |  |  |  |  |
| RateHistory | task |  | 3 / 5 |  |  |  |
| RecurringTaskTemplate | task | 0 / 1 | 5 / 5 |  |  |  |
| RefreshToken | auth | 20 / 7 |  |  |  |  |
| ReportAttachment | task |  | 2 / 2 |  |  |  |
| ReportDefinition | task | 0 / 1 | 3 / 3 |  |  |  |
| ReportSchedule | task | 0 / 1 | 4 / 4 |  |  |  |
| ScheduleTemplate | — |  |  |  |  |  |
| SeatPrice | — |  |  |  |  |  |
| ServiceReport | task | 0 / 2 | 2 / 8 |  |  |  |
| Shift | task |  | 3 / 9 |  |  |  |
| ShiftAssignment | task |  | 6 / 14 |  |  |  |
| ShiftInstance | task |  | 9 / 12 |  |  |  |
| ShiftIssue | task |  | 5 / 3 |  |  |  |
| ShiftIssueEvent | task |  | 4 / 3 |  |  |  |
| SpaceAssignment | task | 1 / 6 | 14 / 63 |  |  |  |
| SpaceShare | auth | 5 / 8 | 1 / 4 |  | 0 / 1 |  |
| SpaceShareRequest | auth | 2 / 2 |  |  |  |  |
| SpaceWorkflow | task |  | 4 / 8 |  |  |  |
| Sprint | task |  | 5 / 10 |  |  |  |
| SprintReport | task |  | 1 / 1 |  |  |  |
| StatusWorkflow | task | 1 / 1 | 7 / 25 |  |  |  |
| Subscription | auth | 10 / 1 |  |  |  |  |
| SupportMessage | task |  | 2 / 2 |  |  |  |
| SupportRoutingRule | auth | 3 / 0 | 0 / 1 |  |  |  |
| SupportTeam | auth | 3 / 1 |  |  |  |  |
| SupportTeamMember | auth | 2 / 1 |  |  |  |  |
| SupportTicket | task | 1 / 1 | 5 / 10 |  |  |  |
| SyncTombstone | — |  | 0 / 4 |  |  |  |
| Task | task | 0 / 12 | 37 / 115 |  | 0 / 2 | 3 / 5 |
| TaskAssignee | task |  | 12 / 24 |  |  |  |
| TaskDependency | task |  | 2 / 3 |  |  |  |
| TaskEvent | task | 0 / 2 | 20 / 17 |  |  |  |
| TaskHandover | task |  | 1 / 2 |  |  |  |
| TaskStepSubmission | task |  | 1 / 1 |  |  |  |
| TechnicianSchedule | task | 1 / 0 | 3 / 5 |  |  |  |
| TimeEntry | task | 0 / 4 | 34 / 84 |  | 0 / 1 |  |
| TimeEntryNote | task |  | 3 / 3 |  |  |  |
| TimeEntryNoteAttachment | task |  | 2 / 4 |  |  |  |
| TimeEntryPresence | task |  | 1 / 2 |  |  |  |
| TimeOff | task |  | 7 / 22 |  |  |  |
| UnitActivity | auth | 1 / 1 |  |  |  |  |
| User | auth | 32 / 96 | 1 / 126 |  | 3 / 5 | 0 / 1 |
| UserPushToken | notification | 1 / 0 |  |  | 2 / 2 |  |
| WorkerLastLocation | tracking | 1 / 0 | 0 / 3 |  |  | 2 / 2 |
| WorkflowStatus | task |  | 5 / 10 |  |  |  |
| WorkflowTemplate | task |  | 8 / 8 |  |  |  |
