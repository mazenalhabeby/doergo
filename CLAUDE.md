# HBCFIELD - Project Reference Document
> **Purpose**: Single source of truth for AI assistants. Read this first before any task.
> **Last Updated**: 2026-09-06 (shift clock: two clocks, planned rests, away-from-site; per-type document visibility)

---

## 1. PROJECT IDENTITY

| Key | Value |
|-----|-------|
| Name | HBCField |
| Type | Role-based task management & field execution platform |
| Monorepo | pnpm workspaces |
| Root | `/Users/pc/work/doergo` |

**Core Flow**: `Admin creates task` → `Dispatcher assigns technician` → `Technician executes` → `Real-time updates`

---

## 2. ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                    │
├───────────────────────────────────┬─────────────────────────────────┤
│              web-app              │         mobile                  │
│         (Next.js + RBAC)          │     (React Native/Expo)         │
│   :3000 (ADMIN & DISPATCHER)      │       (TECHNICIAN only)         │
└─────────────────┬─────────────────┴──────────────┬──────────────────┘
                  │                                │
                  └────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ API Gateway │ :4000/api/v1
                    │  (NestJS)   │ Swagger: /docs
                    │             │ Bull Board: /admin/queues
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         │ Redis Pub/Sub   │ BullMQ Queues   │
         │ (auth,tracking) │ (tasks)         │
         │                 │                 │
         ┌─────────────────┼─────────────────┬──────────────────┐
         ▼                 ▼                 ▼                  ▼
┌─────────────┐   ┌─────────────┐   ┌──────────────┐   ┌──────────────┐
│auth-service │   │task-service │   │notification- │   │tracking-     │
│             │   │ (BullMQ     │   │service       │   │service       │
│             │   │  Processor) │   │(Socket.IO)   │   │(GPS/Maps)    │
└─────────────┘   └─────────────┘   └──────────────┘   └──────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        ┌──────────┐              ┌──────────┐
        │PostgreSQL│              │  Redis   │
        │(PostGIS) │              │ (Cache + │
        │  :5432   │              │  Queues) │
        └──────────┘              │  :6379   │
                                  └──────────┘
```

---

## 3. DIRECTORY STRUCTURE

```
hbcfield/
├── apps/
│   ├── api/
│   │   ├── gateway/           # API Gateway - routes to microservices
│   │   │   └── src/
│   │   │       ├── main.ts    # Entry: port 4000, prefix /api/v1
│   │   │       └── modules/   # auth/, tasks/, tracking/, users/, technicians/
│   │   ├── auth-service/      # Auth microservice
│   │   │   ├── prisma/
│   │   │   │   ├── schema.prisma  # ⭐ MAIN DATABASE SCHEMA
│   │   │   │   ├── seed.ts
│   │   │   │   └── migrations/
│   │   │   └── src/modules/auth/
│   │   ├── task-service/      # Task CRUD + assignment
│   │   ├── notification-service/  # Socket.IO + Email + Push
│   │   └── tracking-service/  # GPS location updates
│   ├── web-app/               # Unified web portal (Next.js) :3000
│   │   └── src/app/           # App Router with role-based views
│   │                          # ADMIN sees: Dashboard, My Tasks, Create Task, Invoices
│   │                          # DISPATCHER sees: Dashboard, All Tasks, Technicians, Live Map, Managed Orgs
│   └── mobile/                # Technician app (Expo)
│       └── src/
├── packages/
│   └── shared/                # Shared types, modules, utilities
│       └── src/
│           ├── types/         # Enums, interfaces, API types
│           ├── prisma/        # Shared PrismaService & PrismaModule
│           ├── microservices/ # Redis config factories, service names
│           ├── queues/        # BullMQ queue config, constants, job types
│           ├── api/           # Response helpers, error codes
│           ├── constants/     # Auth & task constants (configurable values)
│           ├── validators/    # Shared validation decorators (class-validator)
│           ├── decorators/    # NestJS decorators (Roles, Public, CurrentUser)
│           ├── guards/        # NestJS guards (RolesGuard)
│           ├── design/        # Design tokens, Tailwind preset
│           └── components/    # Shared React components (AnimatedLogo)
├── infra/
│   └── docker/
│       └── docker-compose.dev.yml
└── package.json               # Root workspace scripts
```

---

## 4. ROLES & PERMISSIONS

### Role Definitions

| Role | Platform | Description |
|------|----------|-------------|
| **ADMIN** | WEB, MOBILE (BOTH) | Organization owner with full control. Formerly "CLIENT". |
| **DISPATCHER** | WEB only | Office manager, operation coordinator. Can view all tasks and assign technicians. |
| **TECHNICIAN** | MOBILE only | Field worker, task executor. Can only see and execute assigned tasks. |

**External members** (`User.isExternal`) work for a client or partner, not for you. Their whole authority is ONE space role; an org-wide role is refused, because it would reach every space. They hold no clock, no time off and no personnel file, and `@DenyExternal()` closes the organization's own property to them regardless of permission. Two built-in space roles:

| Space role | Grants | Seat |
|---|---|---|
| **External Supervisor** | canViewAllTasks, canApproveOvertime, canReconcileAttendance, canViewSpaceAttendance | €9.99 |
| **External Observer** | canViewAllTasks, canCreateTasks — watches, and can raise a job | **€2** |

> **Note**: The `CLIENT` role has been deprecated and migrated to `ADMIN`. A backward compatibility layer (`LegacyRoleMap`, `normalizeRole()`) handles legacy data.

### Granular Permission System

Each user now has individual permission flags in addition to their role:

| Permission Field | ADMIN Default | DISPATCHER Default | TECHNICIAN Default | Description |
|------------------|---------------|--------------------|--------------------|-------------|
| `platform` | BOTH | WEB | MOBILE | Which platforms the user can access |
| `canCreateTasks` | ✅ true | ❌ false | ❌ false | Can create new tasks |
| `canViewAllTasks` | ✅ true | ✅ true | ❌ false | Can view all tasks in organization |
| `canAssignTasks` | ✅ true | ✅ true | ❌ false | Can assign technicians to tasks |
| `canManageUsers` | ✅ true | ❌ false | ❌ false | Can manage organization users |

### Role-Permission Matrix

| Role | Platform | Create Tasks | View All Tasks | Assign Tasks | Manage Users | Execute Tasks |
|------|----------|--------------|----------------|--------------|--------------|---------------|
| **ADMIN** | BOTH | ✅ | ✅ | ✅ | ✅ | ❌ |
| **DISPATCHER** | WEB | ❌ | ✅ | ✅ | ❌ | ❌ |
| **TECHNICIAN** | MOBILE | ❌ | ❌ (own only) | ❌ | ❌ | ✅ |

### Platform Access Control

Users are restricted to specific platforms based on their `platform` field:

| Platform Value | Web Access | Mobile Access |
|----------------|------------|---------------|
| `BOTH` | ✅ | ✅ |
| `WEB` | ✅ | ❌ |
| `MOBILE` | ❌ | ✅ |

### Permission Helper Functions

Available from `@hbcfield/shared/guards`:

```typescript
import {
  hasRole, isAdmin, isDispatcher, isTechnician,
  canAccessPlatform, canAccessWeb, canAccessMobile,
  canCreateTasks, canViewAllTasks, canAssignTasks, canManageUsers
} from '@hbcfield/shared';

// Role checks (with legacy CLIENT → ADMIN normalization)
hasRole(user, Role.ADMIN, Role.DISPATCHER)  // true if user has any of these roles
isAdmin(user)      // true for ADMIN or legacy CLIENT
isDispatcher(user) // true for DISPATCHER
isTechnician(user) // true for TECHNICIAN

// Platform access checks
canAccessPlatform(user, Platform.WEB)  // true if user can access web
canAccessWeb(user)    // shorthand for web access
canAccessMobile(user) // shorthand for mobile access

// Permission checks (with role fallback if field undefined)
canCreateTasks(user)   // check canCreateTasks field or ADMIN role
canViewAllTasks(user)  // check canViewAllTasks field or ADMIN/DISPATCHER role
canAssignTasks(user)   // check canAssignTasks field or ADMIN/DISPATCHER role
canManageUsers(user)   // check canManageUsers field or ADMIN role
```

### Multi-Tenant SaaS Delegation
Organizations can grant access to other organizations:
- **DISPATCHER** from Org A can access Org B's data only if B grants access via `OrganizationAccess`
- Access levels: `NONE`, `TASKS_ONLY`, `TASKS_ASSIGN`, `FULL`

---

## 5. DATABASE SCHEMA (Prisma)

**Location**: `apps/api/auth-service/prisma/schema.prisma`

### Core Models
```
Organization { id, name, isActive, addOns[], billingMode, invoiceDueDays, billedExternally (kept in step, read by nothing), agreedMonthlyCents?, agreedListCents?, agreedUntil?, agreedNote?, agreedSetAt?, agreedSetById?, suspendedAt?, grantedAccess[], receivedAccess[], companyLocations[] }
BillingAlert { id, organizationId, kind (DROP|SYNC_FAILED), fromCents?, toCents?, dropCents?, detail?, occurrences, lastSeenAt, acknowledgedAt?, acknowledgedBy? }
OrganizationAccess { id, grantorOrgId, granteeOrgId, accessLevel, canViewTasks, canAssignWorkers, canViewWorkers, canViewTracking }
User { id, email, passwordHash, firstName, lastName, role, organizationId, failedLoginAttempts, lockedUntil, platform, canCreateTasks, canViewAllTasks, canAssignTasks, canManageUsers, technicianType, workMode }
RefreshToken { id, tokenHash, expiresAt, userId, usedAt, replacedByTokenHash, cachedAccessToken, cachedRefreshToken }
PasswordResetToken { id, tokenHash, expiresAt, used, userId }
Task { id, title, description, status, priority, dueDate, locationLat, locationLng, locationAddress, organizationId, createdById, assignedToId, routeStartedAt, routeEndedAt, routeDistance, assetId }
AssetCustody { id, organizationId, assetId, userId?, customerId?, startedAt, endedAt?, reason?, openedById?, closedById? }  # endedAt NULL = holds it now
AssetProposal { id, organizationId, raisedById, holderUserId?, categoryId?, fields, documentKind, signals?, fileKey?, status (PENDING|ACCEPTED|REJECTED|WITHDRAWN), reviewedById?, reviewNote?, createdAssetId? }
AssetMoney { …, receiptKey?, receiptName?, receiptMime?, status (RECORDED|SUBMITTED|REJECTED), reviewedById?, reviewedAt?, reviewNote? }
CustomerContact { id, organizationId, companyId, personId, role?, isPrimary }  # a person who works at a company (@@unique companyId+personId)
Comment { id, content, taskId, userId }
Attachment { id, fileName, fileUrl, fileType, fileSize, taskId, uploadedById }
TaskEvent { id, eventType, metadata, taskId, userId }
WorkerLastLocation { id, lat, lng, accuracy, userId }
LocationHistory { id, lat, lng, accuracy, timestamp, userId, taskId }  # Route tracking points
ServiceReport { id, taskId, assetId, summary, workPerformed, workDuration, technicianSignature, customerSignature, customerName, completedAt, completedById, organizationId }
ReportAttachment { id, reportId, type, fileName, fileUrl, fileSize, caption }
PartUsed { id, reportId, name, partNumber, quantity, unitCost, notes }
CompanyLocation { id, name, address, lat, lng, geofenceRadius, isActive, organizationId }  # For attendance tracking
UserPushToken { id, userId, token, platform, deviceId, createdAt, updatedAt }  # Push notification tokens
TechnicianSchedule { id, technicianId, dayOfWeek, startTime, endTime, isActive, notes }  # Weekly work schedule
TimeOff { id, technicianId, startDate, endDate, reason, status, approvedById, approvedAt, rejectionReason }  # Time-off requests
DocumentType { id, key, label, direction, cadence, signatureMode, requiredFromAll, requiredFromRoleIds, visibleToRoleIds (empty = NO restriction), signerRoute?, retentionMonths?, ... }
Invitation { id, codeHash, targetRole, organizationId, technicianType?, workMode?, specialty?, maxDailyJobs?, status, expiresAt, usedAt?, acceptedById?, createdById, createdAt, updatedAt }  # Code-based invitations
```

### Enums
```typescript
Role: ADMIN | DISPATCHER | TECHNICIAN  // Note: CLIENT deprecated, maps to ADMIN
Platform: WEB | MOBILE | BOTH
TechnicianType: FREELANCER | FULL_TIME  // Billing/employment type (who pays expenses)
WorkMode: ON_SITE | ON_ROAD | HYBRID  // Where the technician works (decoupled from TechnicianType)
AccessLevel: NONE | TASKS_ONLY | TASKS_ASSIGN | FULL
TaskStatus: DRAFT | NEW | ASSIGNED | ACCEPTED | EN_ROUTE | ARRIVED | IN_PROGRESS | BLOCKED | COMPLETED | CANCELED | CLOSED
TaskPriority: LOW | MEDIUM | HIGH | URGENT
TaskEventType: CREATED | UPDATED | ASSIGNED | UNASSIGNED | STATUS_CHANGED | COMMENT_ADDED | ATTACHMENT_ADDED | ATTACHMENT_REMOVED
AttachmentType: IMAGE | DOCUMENT | OTHER
ReportAttachmentType: BEFORE | AFTER
TimeOffStatus: PENDING | APPROVED | REJECTED | CANCELED
InvitationStatus: PENDING | ACCEPTED | EXPIRED | REVOKED
BillingMode: AUTOMATIC | INVOICE | EXTERNAL   // card / Stripe-issued invoice / by agreement
BillingAlertKind: DROP | SYNC_FAILED | CONTRACT_DRIFT | CONTRACT_EXPIRING
```

### Task Status Flow
```
                                    ┌─────────────────────────────────────────┐
                                    │         TECHNICIAN EXECUTION            │
                                    │                                         │
DRAFT ──► NEW ──► ASSIGNED ──► ACCEPTED ──► EN_ROUTE ──► ARRIVED ──► IN_PROGRESS ──► COMPLETED ──► CLOSED
                      │                         │           │              │
                      │                         │           │              ▼
                      │                         │           │          BLOCKED ───► IN_PROGRESS
                      │                         │           │              │
                      ▼                         ▼           ▼              ▼
                  CANCELED ◄───────────────────────────────────────────────┘

Route tracking: EN_ROUTE → ARRIVED (records distance, time, GPS points)
```

---

## 6. API ENDPOINTS REFERENCE

**Base URL**: `http://localhost:4000/api/v1`
**Swagger**: `http://localhost:4000/docs`

### Auth (`/auth`)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/login` | Login, returns tokens | No |
| POST | `/auth/register` | Register new ADMIN account (org owner) | No |
| POST | `/auth/refresh` | Refresh access token | No |
| POST | `/auth/logout` | Invalidate refresh token | Yes |
| POST | `/auth/forgot-password` | Request password reset email | No |
| POST | `/auth/reset-password` | Reset password with token | No |
| GET | `/auth/me` | Get current user | Yes |

### Tasks (`/tasks`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/tasks` | List tasks | ALL |
| POST | `/tasks` | Create task | ADMIN, DISPATCHER |
| GET | `/tasks/:id` | Get task detail | ALL |
| PATCH | `/tasks/:id` | Update task | ADMIN, DISPATCHER |
| DELETE | `/tasks/:id` | Delete task | ADMIN (org owner only) |
| POST | `/tasks/:id/assign` | Assign technician | ADMIN, DISPATCHER |
| POST | `/tasks/:id/start` | Start task | TECHNICIAN |
| POST | `/tasks/:id/block` | Block task | TECHNICIAN |
| POST | `/tasks/:id/complete` | Complete task | TECHNICIAN |
| POST | `/tasks/:id/attachments/presign` | Get presigned upload URL | ALL |
| POST | `/tasks/:id/attachments` | Confirm upload after S3 upload | ALL |
| GET | `/tasks/:id/attachments` | List task attachments | ALL |
| DELETE | `/tasks/:id/attachments/:attachmentId` | Delete attachment | ALL |

### Tracking (`/tracking`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/tracking/location` | Update technician location (stores history if EN_ROUTE) | ADMIN, MANAGER, EMPLOYEE |
| POST | `/tracking/location/batch` | Batch-flush buffered route points (mobile background tracker) | ADMIN, MANAGER, EMPLOYEE |
| GET | `/tracking/workers` | Get all technician locations | ADMIN, DISPATCHER |
| GET | `/tracking/workers/:id` | Get specific technician | ADMIN, DISPATCHER |
| GET | `/tracking/workers/:id/current-route` | Get active route for worker | ADMIN, DISPATCHER |
| GET | `/tracking/tasks/:taskId/route` | Get full route for task | ADMIN, DISPATCHER |

### Reports (`/reports` & `/tasks`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/tasks/:taskId/complete` | Complete task with service report | TECHNICIAN |
| GET | `/tasks/:taskId/report` | Get task's service report | ALL |
| PATCH | `/reports/:id` | Update report (within 24h) | TECHNICIAN |
| GET | `/assets/:assetId/reports` | Get asset's maintenance history | ADMIN, DISPATCHER |
| POST | `/reports/:id/parts` | Add part to report | TECHNICIAN |
| DELETE | `/reports/:id/parts/:partId` | Remove part from report | TECHNICIAN |

### Locations (`/locations`) - Company Locations for Attendance
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/locations` | Create company location | ADMIN |
| GET | `/locations` | List organization's locations | ADMIN, DISPATCHER |
| GET | `/locations/:id` | Get location details | ADMIN, DISPATCHER |
| PATCH | `/locations/:id` | Update location | ADMIN |
| DELETE | `/locations/:id` | Deactivate location (soft delete) | ADMIN |
| POST | `/locations/:id/default` | Make this the org's default workspace (one transaction, Remote/archived refused) | canManageWorkspaces |

### Technicians (`/technicians`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/technicians` | List technicians with filters & pagination | ADMIN, DISPATCHER |
| POST | `/technicians` | Create new technician | ADMIN, DISPATCHER |
| GET | `/technicians/:id` | Get technician detail with stats | ADMIN, DISPATCHER |
| PATCH | `/technicians/:id` | Update technician profile | ADMIN, DISPATCHER |
| DELETE | `/technicians/:id` | Deactivate technician (soft delete) | ADMIN, DISPATCHER |
| GET | `/technicians/:id/performance` | Get performance metrics & trends | ADMIN, DISPATCHER |
| GET | `/technicians/:id/tasks` | Get task history for technician | ADMIN, DISPATCHER |
| GET | `/technicians/:id/attendance` | Get attendance/clock-in history | ADMIN, DISPATCHER |
| GET | `/technicians/:id/assignments` | Get location assignments | ADMIN, DISPATCHER |
| GET | `/technicians/:id/schedule` | Get weekly work schedule | ADMIN, DISPATCHER |
| POST | `/technicians/:id/schedule` | Set weekly work schedule | ADMIN, DISPATCHER |
| GET | `/technicians/:id/time-off` | Get time-off requests | ADMIN, DISPATCHER, TECHNICIAN |
| POST | `/technicians/:id/time-off` | Request time off | ADMIN, DISPATCHER, TECHNICIAN |
| PATCH | `/technicians/time-off/:id/approve` | Approve/reject time-off | ADMIN, DISPATCHER |
| DELETE | `/technicians/time-off/:id` | Cancel time-off request | TECHNICIAN |
| GET | `/technicians/availability` | Get all availability for date | ADMIN, DISPATCHER |

### Invitations (`/invitations`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/invitations` | Create invitation code | ADMIN, DISPATCHER |
| GET | `/invitations` | List organization invitations | ADMIN, DISPATCHER |
| GET | `/invitations/validate/:code` | Validate invitation code (public) | None |
| POST | `/invitations/accept` | Accept invitation & register (public) | None |
| DELETE | `/invitations/:id` | Revoke invitation | ADMIN, DISPATCHER |

### Onboarding (`/onboarding`) - Mobile Onboarding Flow
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/onboarding/create-org` | Create organization (Path A) | JWT + SkipOnboarding |
| GET | `/onboarding/validate-org-code/:code` | Validate org code (Path B) | JWT + SkipOnboarding |
| POST | `/onboarding/join-by-code` | Submit join request (Path B) | JWT + SkipOnboarding |
| POST | `/onboarding/accept-invitation` | Accept invitation (Path C) | JWT + SkipOnboarding |
| GET | `/onboarding/status` | Get onboarding status | JWT + SkipOnboarding |
| DELETE | `/onboarding/join-requests/:id` | Cancel own join request | JWT + SkipOnboarding |

### Join Requests (`/join-requests`) - Admin Management
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/join-requests` | List pending join requests | ADMIN, DISPATCHER |
| PATCH | `/join-requests/:id/approve` | Approve with role assignment | ADMIN, DISPATCHER |
| PATCH | `/join-requests/:id/reject` | Reject with optional reason | ADMIN, DISPATCHER |

### Organizations (`/organizations`) - Org Settings
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/organizations/join-code` | Get org join code info | ADMIN, DISPATCHER |
| POST | `/organizations/regenerate-join-code` | Generate new join code | ADMIN |
| PATCH | `/organizations/settings` | Update join policy | ADMIN |
| GET | `/organizations/members` | List organization members | ADMIN, DISPATCHER |
| PATCH | `/organizations/members/:id/role` | Update member role/permissions | ADMIN |
| DELETE | `/organizations/members/:id` | Remove member from organization | ADMIN |

### Attendance (`/attendance`) - Clocking in and out
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/attendance/status` | The caller's running shift, if any | ADMIN, EMPLOYEE |
| GET | `/attendance/clock-in-locations` | **Where the CALLER may clock in right now** — every space with an assignment active now, minus the Remote bucket | ADMIN, EMPLOYEE |
| POST | `/attendance/clock-in` | Start a shift (`locationId` **or** `isRemote`) — server re-checks the geofence | ADMIN, EMPLOYEE |
| POST | `/attendance/clock-out` | End the shift | ADMIN, EMPLOYEE |

> ⚠️ `clock-in-locations` is deliberately **not** `GET /locations`. That one answers "what workspaces can I SEE", and `canViewAllTasks` makes it the whole directory — offering a space the member is not assigned to produces a clock-in refused for a reason they cannot act on. The window rule (`activeAssignmentWhere`) is shared with the clock-in check so the list and the enforcement cannot drift.
>
> ⚠️ A space with **no coordinates is geofence-exempt and clocks in fine**. Never filter those out client-side — an org that never set coordinates could otherwise not clock in at all.
>
> ⚠️ **CUSTOMER spaces are workplaces.** A first version excluded them as "somebody else's premises"; in a field-service product people spend the day at a customer site and clock in there, and the clock-in has always accepted it. Excluding them made the list stricter than the check and hid two of three workspaces from a member assigned to all three. Only the Remote bucket is filtered.

### Documents — the personnel file (`/documents`)
> The whole filing cabinet: what the organization ISSUES to a member (contracts, payslips) and what a member SUPPLIES to it (passport, licence). Types are configuration; documents are records; signatures are evidence.

| Method | Endpoint | Description | Gate |
|--------|----------|-------------|------|
| GET · POST · PATCH · DELETE | `/documents/types[/:id]` | The catalogue: cadence, direction, retention, signing route, **who may see it** | read: all · write: `canManageDocumentTemplates` |
| GET | `/documents` · `/documents/browse` · `/documents/sent` | The member's own list · the folder register · the issued register | `canViewMemberDocuments` for other people's |
| POST | `/documents/upload-url` → `/documents` | Issue: presign, then file it | `canIssueDocuments` |
| POST | `/documents/mine/upload-url` → `/documents/mine` | A member supplying their own | the member themselves |
| GET · POST | `/documents/awaiting-verification` · `/documents/:id/verify` · `/reject` | The verification queue | `canIssueDocuments` |
| POST | `/documents/:id/download-url` | **Mint a link — this IS the "opened" event**, which is why no list returns a URL | `canOpenMemberDocuments` |
| POST | `/documents/:id/sign` · `/consent` · `/acknowledge` · `/send-back` | The signing chain, step by step | being ON the step |
| GET | `/documents/:id/chain` · `/:id/events` | Who has signed, and the evidence trail | in the chain, or `canViewMemberDocuments` |
| GET · POST | `/documents/templates[...]` · `/issue-contract` | Contract templates and issuing from one | `canManageDocumentTemplates` |
| GET | `/documents/compliance` · `/requirements` · `/pending` | The credential board · what is required OF me · what waits ON me | — |

> ⚠️ **A type names the roles that may SEE it** (`DocumentType.visibleToRoleIds`). **EMPTY MEANS NO RESTRICTION**, not "nobody" — the opposite default would empty every register in every organization on the day it deployed. The rule lives once in `packages/shared/src/access/document-visibility.ts`, in three shapes (one document / a list of documents / the type catalogue), because it is asked in about ten places.
>
> ⚠️ **Three exemptions, all load-bearing.** The **subject** — a restriction decides whose OTHER documents you may read, so their own file stays whole and the catalogue keeps whatever is still required OF them, or restricting a type leaves somebody unable to hand in their own passport while a screen goes on chasing them for it. A **routed signer** — being asked to sign IS the authorisation to read that one document; a shift leader countersigning a time sheet is not in HR. **Administrators**.
>
> ⚠️ **Refusals are 404, not 403.** A 403 would confirm that a payslip exists for that person on that date.
>
> ⚠️ **`document-scope-guard.spec.ts` fails if a new document read is added** without `typeScope`, `assertTypeVisible`, or a NAMED exemption carrying its reason.

### CRM contact people (`/customers`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/customers/:id/contacts` | Who works at this company | CRM caps |
| GET | `/customers/:id/companies` | Which companies this person contacts | CRM caps |
| POST | `/customers/:id/contacts` | Attach a person — existing (`personId`) or new (`person`) | `editInfo` / `manage` |
| PATCH | `/customers/contacts/:linkId` | Change the role, or make them primary | `editInfo` |
| DELETE | `/customers/contacts/:linkId` | Detach — **the person record is kept** | `editInfo` |
| POST | `/customers/:id/promote` | Make a contact a client in their own right | `manage` |

> ⚠️ **A contact is not a client.** `Customer.isContact` keeps them out of the client list AND out of `BILLABLE_CLIENT_WHERE` — the CRM ladder charges per active client, and a firm with six contacts is not six clients.
>
> ⚠️ **`Customer.locale` is "Language for emails"** (migration `20260916170000_customer_locale`). Client info under the same `editInfo` gate as the phone number. NULL = "same as the organization": resolved at SEND time by `clientEmailLocales`, never written into the record. A portal client's own app language still wins over it.
>
> ⚠️ **Linking is not gated on `Customer.type`.** A real book of clients reads "BILLA AG", "Siemens AG" — all saved as PERSON, because the Person/Company toggle is an afterthought. The two ends are told apart by their POSITION in the link; the panels split by type, the service does not. A↔B both ways round is refused.

### Custody & expenses (`/assets`) — who holds a thing, and what they spend on it
> `AssetHolder` answers "who has it NOW" and deletes the row on a handover. `AssetCustody` is the same fact as PERIODS, so "what did the Ford cost while Ahmed had it" and "which vans has Ahmed had" are both queries rather than a scan of activity JSON.

| Method | Endpoint | Description | Gate |
|--------|----------|-------------|------|
| GET | `/assets/mine` | What the CALLER holds — the phone's home | **none: the filter IS the authorization** |
| GET | `/assets/:id/custody` | Who has held it, and what each cost | `canViewAllTasks` |
| POST | `/assets/:id/custody` | Hand it over (empty `to` = take it back) | `canManageAssets` |
| GET | `/assets/custody/member/:id` | What one member holds, and has held | `canViewAllTasks` |
| POST | `/assets/:id/expenses/presign` → `/expenses` | A member files what they spent, with the slip | **custody on the RECEIPT'S date** |
| GET | `/assets/expenses/mine` | What I sent in, and what happened to it | mine |
| GET · POST | `/assets/expenses/pending` · `/expenses/:id/review` | The office's queue, and the decision | read `canViewAllTasks` · write `canManageAssets` |
| POST | `/assets/expenses/:id/receipt-url` | **Mint a link to one slip** — no list ever returns a URL | author, or `canManageAssets` |
| POST | `/assets/contracts/read` · `/preview` · `/apply` | A contract → create the thing, hand it over, retire what it replaces | **all three** `canManageAssets` |
| POST · GET | `/assets/proposals/upload-url` · `/proposals` · `/proposals/mine` · `/proposals/:id/withdraw` · `/:id/document-url` | **A member sends a page in** and watches what happened to it | **none: the caller's own id is the boundary** |
| GET · POST | `/assets/proposals/pending` · `/proposals/:id/accept` · `/reject` | The queue, and the decision | all three `canManageAssets` **in a space or org-wide**, narrowed by `mayReviewProposal` (404 outside) |

> ⚠️ **THE HOLDER IS NEVER WRITTEN ONTO A COST.** Every entry carries the date the money moved; who held the asset that day is a LOOKUP (`holderOn` in shared). Storing it too gives two versions of the truth the first time somebody corrects a handover date — the likeliest repair in the whole feature.
>
> ⚠️ **Filing an expense is authorised by CUSTODY, not by a permission.** A driver is not an asset manager and never will be; `canManageAssets` here would lock every driver out of the only screen built for them. Asked of the day the money moved, not today — so yesterday's fuel is still filable the morning after the van goes back, and a receipt for a van they never drove is not.
>
> ⚠️ **A member's expense is SUBMITTED and counts for NOTHING until the office accepts it.** Totals sum `status = RECORDED` only. Recorded on arrival, anybody holding a van could move the organization's figures by photographing a slip.
>
> ⚠️ **One writer for two tables.** `AssetCustodyService` writes `AssetCustody` AND `AssetHolder`, in one transaction, and `AssetHoldersService.set()` was DELETED so nothing else can. An edit that changes the driver goes through the same path as the button — a drift here is a ledger attributed to the wrong person with nothing on screen to suggest it. The mirror self-heals: a holder row with no open period is repaired on the next save.
>
> ⚠️ **A DRIVER NEVER CREATES AN ASSET, and the raise routes carry NO permission — that is the point.** The person holding the rental agreement is precisely the one who holds nothing and never will. What they do is bounded by their own id in the service (raise one, list your own, withdraw your own, open your own page); creating the thing stays behind `canManageAssets` on `/proposals/:id/accept`, which IS `/contracts/apply`.
>
> ⚠️ **`classifyDocument` must be hard to fool.** It needs BOTH an agreement word AND an identifier, and a page shaped like a receipt (transaction word + a total) is refused FIRST — a fuel slip from a leasing company carries "Leasing" *and* a registration. A false positive puts a van that does not exist in somebody's queue, and the third time that happens the queue stops being read, which costs the real proposals too. A false negative costs one tap ("send it anyway").
>
> ⚠️ **The proposal stores the FIELDS, not a plan.** Which custody would close and which record would be retired are recomputed at REVIEW time from what the member holds then — a page uploaded three weeks ago may name a van since given to somebody else, and a frozen plan would be executed anyway.
>
> ⚠️ **Accepting CLAIMS the row with a conditional update**, so two reviewers cannot both act on one page and create two vehicles from it. A failed accept puts it BACK to PENDING — otherwise one bad click makes a member's proposal vanish with nothing created and nothing said.
>
> ⚠️ **Routing is watchers ∪ space roles — WITH A FALLBACK**, unlike attendance. Not being told about a late clock-out is a choice; a proposal reaching nobody is *work that stops*, and the member waits forever and stops sending pages in. Where nothing is configured it goes to whoever can actually act (org roles granting `canManageAssets`, resolved through `AccessRole` — it is not a User column).
>
> ⚠️ **A contract PROPOSES; it never acts.** `read` → `preview` → `apply`, and the middle step cannot be skipped: a reader that silently creates records will eventually invent a van from a receipt. The proposal is computed on the SERVER on BOTH preview and apply from the kind and from what the member actually holds — the request carries a reading (a plate, a VIN), never "close custody X, retire asset Y". A client that could name the record to retire could retire any record.
>
> ⚠️ **All three ask `canManageAssets`, including the two that write nothing.** A preview answers a question about the organization's property — give it a kind and a member and it says what they hold and what would come off the books — and `canViewAllTasks` is held by an external supervisor. There is also no caller: nobody previews a contract they cannot apply. (A POST on a read permission also trips `external-observer-writes.spec.ts`, correctly.)
>
> ⚠️ **Only what the member holds OF THAT KIND is replaced.** Somebody holds a van and a laptop at once; a vehicle contract says nothing about the laptop.
>
> ⚠️ **A custody never STARTS in the future.** A rental beginning next Monday would leave the vehicle held by nobody until then, so every receipt in the gap falls out of both custodies. The start is clamped to today and the screen says so; the term's own dates go onto the record as the kind's fields.
>
> ⚠️ **On the phone the contract's TEXT never leaves the device** — it carries a home address, a licence number and bank details. Six confirmed fields travel; nothing else.
>
> ⚠️ Retiring the replaced record sets `RETIRED`, which is what `BILLABLE_ASSET_WHERE` excludes — so it also stops the old vehicle being billed, while its jobs and its ledger stay.
>
> ⚠️ The migration BACKFILLS an open period per existing holder row, dated from `AssetHolder.createdAt`. Without it every asset in somebody's hands reads "held by nobody" on the day it ships, and its whole ledger attributes to nobody with it.

### Users (`/users`) - Push Tokens
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/users/push-token` | Register push notification token | ALL |
| DELETE | `/users/push-token/:token` | Remove push notification token | ALL |

### Billing (`/billing`) — module pricing, no plans
> StripeService lives in **auth-service** only; the gateway forwards. All mutations ADMIN-only, **organizationId always from the token, never the body**. `addOns` / `subStatus` are server-authoritative.

| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/billing/bill` | Itemised bill: seats, every space's modules + ladders, org add-ons | ALL |
| GET | `/billing/subscription` | Stripe-side STATUS only (status, interval, trial, locked) | ALL |
| PUT | `/billing/add-ons` | Replace the org's purchased capabilities (whole list, not a delta) | ADMIN |
| POST | `/billing/checkout` | Checkout for what the org already has — body is `{interval}` only | ADMIN |
| POST | `/billing/portal` | Customer Portal (payment method, invoices, cancel) | ADMIN |
| POST | `/billing/change-plan` | Switch monthly ↔ annual (the only billing choice left) | ADMIN |
| POST | `/billing/cancel` | Cancel at period end | ADMIN |
| POST | `/billing/webhooks/stripe` | Stripe webhook (HMAC + rawBody + idempotency; 6 events) | Public (signature-verified) |
| POST | `/billing/admin/org-add-ons` | **Operator**: grant an org its capabilities (secret-gated) | Platform key |
| POST | `/platform/orgs/:id/billing-mode` | **Operator**: card / invoice / agreement (audited, Stripe moved first) | Platform key |
| GET | `/platform/billing-alerts` | **Operator**: bills that fell + Stripe syncs that failed | Platform key |
| POST | `/platform/billing-alerts/:id/ack` | **Operator**: mark one as looked at | Platform key |
| POST | `/platform/orgs/:id/agreed-price` | **Operator**: a fixed monthly price replacing the bill (`billingOps`) | Platform key |
| DELETE | `/platform/orgs/:id/agreed-price` | **Operator**: back onto the price list | Platform key |
| POST | `/platform/orgs/:id/suspend` · `/reactivate` | **Operator**: switch an organization off / on — refuses sign-in, refresh AND every request | Platform key |

> `/billing/bill` and `/billing/subscription` are deliberately separate: switching a module on moves the bill and not the status; a failed card moves the status and not the bill.

**Query Parameters for GET `/technicians`:**
- `status`: `active` | `inactive` | `all` (default: `active`)
- `type`: `FULL_TIME` | `FREELANCER` | `all` (default: `all`)
- `workMode`: `ON_SITE` | `ON_ROAD` | `HYBRID` | `all` (default: `all`)
- `specialty`: Filter by specialty (partial match)
- `search`: Search by name or email
- `page`, `limit`: Pagination (default: 1, 10)
- `sortBy`: `name` | `email` | `rating` | `taskCount` | `createdAt`
- `sortOrder`: `asc` | `desc`

---

## 7. SOCKET.IO EVENTS

**Namespace**: Default (`/`)
**Auth**: Send `authenticate` event after connection

### Client → Server
```typescript
'authenticate' → { userId, role, organizationId }
```

### Server → Client
```typescript
'task.created'        → { task }
'task.updated'        → { task }
'task.assigned'       → { task, workerId }
'task.statusChanged'  → { task, previousStatus, newStatus }
'task.commentAdded'   → { task, comment }
'task.attachmentAdded'→ { task, attachment }
'worker.locationUpdated' → { workerId, lat, lng, accuracy }
```

### Rooms
- `org:{organizationId}` - Organization-wide events
- `role:{role}` - Role-specific events
- `user:{userId}` - User-specific events
- `task:{taskId}` - Task-specific events

### Socket.IO Monitoring

**Service URL**: `http://localhost:4001` (notification-service)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/socket/stats` | Connection statistics (total, authenticated, by role/org, messages) |
| GET | `/socket/clients` | List of connected clients with details |
| GET | `/health` | Service health check |

**Socket.IO Admin UI**: https://admin.socket.io → Connect to `http://localhost:4001`

**Server Logs** (prefixes):
- `[CONNECT]` / `[DISCONNECT]` - Client connections
- `[AUTH]` - Authentication events
- `[JOIN]` / `[LEAVE]` - Room membership
- `[RECV]` / `[SEND]` - Message traffic (debug level)
- `[EMIT]` - Server broadcasts

---

## 8. TECH STACK QUICK REFERENCE

| Layer | Technology | Notes |
|-------|------------|-------|
| Web Frontend | Next.js 15 + TypeScript | App Router |
| UI Components | Tailwind CSS + shadcn/ui | |
| State/Data | TanStack Query | |
| Mobile | React Native + Expo | SDK 54 |
| Mobile Maps | react-native-maps | Google provider |
| Mobile Location | expo-location | Background tracking |
| Backend | NestJS + TypeScript | Microservices |
| API Style | REST + Swagger | |
| Realtime | Socket.IO | WebSockets |
| Auth | JWT (access + refresh) | RBAC |
| Database | PostgreSQL + PostGIS | |
| ORM | Prisma | |
| Job Queue | BullMQ | Exactly-once processing |
| Cache | Redis | |
| Job Monitor | Bull Board | `/admin/queues` |
| Storage | S3-compatible | Presigned URLs |
| Email | Nodemailer | SMTP |
| Push | Expo Notifications / FCM | |

---

## 8.1 BULLMQ JOB QUEUE ARCHITECTURE

BullMQ provides reliable job processing with exactly-once semantics, preventing duplicate task creation from multiple service instances.

### Architecture Flow
```
┌─────────────┐     ┌───────────────┐     ┌──────────────┐
│   Gateway   │────►│  BullMQ Queue │────►│ task-service │
│  (Producer) │     │    (Redis)    │     │  (Processor) │
└─────────────┘     └───────────────┘     └──────────────┘
       │                    │                     │
       │ addJob()           │ Job stored          │ process()
       │ waitUntilFinished()│ until claimed       │ return result
       ▼                    ▼                     ▼
```

### Key Benefits
| Feature | Description |
|---------|-------------|
| Exactly-once processing | Only ONE worker processes each job |
| Automatic retries | Failed jobs retry with exponential backoff |
| Job persistence | Jobs survive service restarts |
| Monitoring | Bull Board UI at `/admin/queues` |
| Horizontal scaling | Multiple workers can process jobs safely |

### Queue Configuration
```typescript
// In gateway or task-service app.module.ts
import { createBullMQConfig, QUEUE_NAMES } from '@hbcfield/shared';

@Module({
  imports: [
    BullModule.forRootAsync(createBullMQConfig()),
    BullModule.registerQueue({ name: QUEUE_NAMES.TASKS }),
  ],
})
```

### Job Types (TASK_JOB_TYPES)
| Job Type | Description |
|----------|-------------|
| `task.create` | Create new task |
| `task.update` | Update task details |
| `task.assign` | Assign technician |
| `task.updateStatus` | Change task status |
| `task.delete` | Delete task |
| `task.getTimeline` | Get task activity |
| `task.addComment` | Add comment |
| `task.getComments` | Get comments |

### Default Job Options
```typescript
DEFAULT_JOB_OPTIONS.CRITICAL = {
  attempts: 3,                    // Retry up to 3 times
  backoff: { type: 'exponential', delay: 1000 },  // 1s, 2s, 4s
  removeOnComplete: { age: 3600, count: 1000 },   // Keep 1hr or 1000 jobs
  removeOnFail: { age: 86400 },   // Keep failed 24hr for debugging
}
```

### Monitoring
- **Bull Board UI**: `http://localhost:4000/admin/queues`
- Shows active, waiting, completed, and failed jobs
- Allows retry and delete operations

---

## 9. COMMANDS REFERENCE

```bash
# Development
pnpm dev:api          # Start all API services (gateway + microservices)
pnpm dev:web          # Start web app (port 3000)
pnpm dev:mobile       # Start Expo mobile app

# Database
pnpm db:generate      # Generate Prisma client
pnpm db:migrate       # Run migrations (dev)
pnpm db:seed          # Seed database
pnpm db:studio        # Open Prisma Studio

# Docker
pnpm docker:dev       # Start PostgreSQL + Redis

# Build
pnpm build            # Build all packages
```

### Important URLs (Development)
| URL | Description |
|-----|-------------|
| `http://localhost:4000/api/v1` | API Gateway |
| `http://localhost:4000/docs` | Swagger Documentation |
| `http://localhost:4000/admin/queues` | Bull Board (Job Monitoring) |
| `http://localhost:4001` | Notification Service (Socket.IO) |
| `http://localhost:4001/socket/stats` | Socket.IO Statistics |
| `https://admin.socket.io` | Socket.IO Admin UI (connect to localhost:4001) |
| `http://localhost:3000` | Web App |
| `http://localhost:5556` | Prisma Studio |

---

## 10. ENVIRONMENT FILES

| App | File | Key Variables |
|-----|------|---------------|
| gateway | `apps/api/gateway/.env` | `PORT`, `JWT_SECRET`, `REDIS_*`, `CORS_ORIGINS`, `AUTH_CACHE_TTL_SECONDS` (optional, default 60 — TTL for the per-request token/user cache) | Mobile version gate: `MOBILE_MIN_VERSION` (unset = no gate), `MOBILE_LATEST_VERSION`, `MOBILE_ANDROID_URL`, `MOBILE_IOS_URL` — served publicly at `GET /app/version`
| auth-service | `apps/api/auth-service/.env` | `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRATION`, `JWT_REFRESH_EXPIRATION`, `REDIS_*`, **Stripe billing** (StripeService lives here only): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_AUTOMATIC_TAX` (true/false). ⚠️ **No module price IDs in env** — the 62 prices resolve by Stripe `lookup_key` (see `billing/stripe-catalog.ts`). The 8 legacy `STRIPE_PRICE_*` tier vars remain only for the operator price book |
| task-service | `apps/api/task-service/.env` | `DATABASE_URL`, `REDIS_*` |
| notification-service | `apps/api/notification-service/.env` | `REDIS_*`, `SMTP_*`, `FCM_SERVER_KEY` |
| tracking-service | `apps/api/tracking-service/.env` | `DATABASE_URL`, `REDIS_*`, `LOCATION_HISTORY_RETENTION_DAYS` (optional, default 90 — GPS history retention window) |
| web-app | `apps/web-app/.env.local` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL` |
| mobile | `apps/mobile/.env` | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` |

---

## 11. TEST CREDENTIALS (Seed Data)

> **⚠️ The running dev DB is seeded with `seed-demo.ts`, not `seed.ts`.** The accounts below are what actually exist. All use password `password123`. Roles are canonical (ADMIN/MANAGER/EMPLOYEE). The older `seed.ts` accounts (`dispatcher@`, `technician1-3@`, `newuser@`) and the `ACME2026` join code are **not** present unless you run `seed.ts`.

| Role | Email | Name | Position |
|------|-------|------|----------|
| ADMIN | client@example.com | John Owner | org owner — full access |
| MANAGER | manager@example.com | Anna Müller | Operations Manager (canViewAllTasks, canAssignTasks) |
| EMPLOYEE | mike@example.com | Mike Weber | Field Technician |
| EMPLOYEE | sarah@example.com | Sarah Wagner | Service Engineer |
| EMPLOYEE | karim@example.com | Karim Ahmad | HVAC Specialist |
| EMPLOYEE | lisa@example.com | Lisa Adler | Electrician |
| EMPLOYEE | hassan@example.com | Hassan Berger | Maintenance Worker |
| EMPLOYEE | dana@example.com | Dana Pichler | Logistics Coordinator |
| EMPLOYEE | david@example.com | David Koller | Senior Technician |
| EMPLOYEE | noor@example.com | Noor Shah | Plumber |

**Seeds:**
- `pnpm db:seed` runs `seed.ts` (the documented onboarding accounts + `ACME2026` join code + orphan `newuser@example.com`).
- `npx tsx prisma/seed-demo.ts` (run from `apps/api/auth-service`) adds the demo manager + 8 employees + 3 spaces + tasks to the existing admin's org (requires an admin to already exist).

### Sample Company Locations (from seed-demo.ts, Austria)
| Name | Address | Coordinates | Geofence |
|------|---------|-------------|----------|
| Main Office | Arbeiterheimstraße 32, Laakirchen | 47.9813, 13.8269 | 50m |
| Warehouse | 456 Industrial Blvd, Gmunden | 47.9186, 13.7991 | 80m |
| Service Center | 789 Tech Park, Vöcklabruck | 48.0037, 13.6577 | 40m |

---

## 12. IMPLEMENTATION STATUS

### Phase 1: Foundation ✅ COMPLETE
- [x] Monorepo structure (pnpm workspaces)
- [x] Docker Compose (PostgreSQL + Redis)
- [x] Prisma schema + migrations
- [x] Seed data
- [x] Environment files
- [x] API Gateway scaffold
- [x] All microservices scaffold
- [x] Web app scaffold (merged with RBAC navigation)
- [x] Mobile app scaffold
- [x] Shared types package

### Phase 2: Authentication ✅ COMPLETE
- [x] Auth service: login, refresh, logout endpoints
- [x] Auth service: forgot-password + reset-password endpoints
- [x] JWT access/refresh token generation
- [x] Refresh token rotation (DB storage with SHA-256 hashing)
- [x] Token refresh grace period (60s) for concurrent requests
- [x] Atomic token claiming to prevent race conditions
- [x] Configurable token expiration via `.env` file
- [x] Dynamic token monitor (reads expiration from JWT)
- [x] Password reset tokens (SHA-256 hashed, 1-hour expiry, one-time use)
- [x] Password hashing (bcrypt, cost factor 12)
- [x] RolesGuard + JwtAuthGuard decorators
- [x] Gateway auth proxy to auth-service
- [x] Gateway global exception filter (consistent error responses)
- [x] Web app: unified portal with role-based navigation (CLIENT & DISPATCHER)
- [x] Web app: login page + auth context + registration
- [x] Web app: forgot-password + reset-password pages
- [x] Web app: role-based dashboard views
- [x] Account lockout (5 failed attempts = 15 min lockout)
- [x] Rate limiting (Throttler: 3/sec, 20/10sec, 100/min)
- [x] Security headers (Helmet.js)
- [x] Input validation (class-validator + Zod frontend)
- [x] "Remember Me" functionality (24h default / 30d extended)
- [x] Shared AnimatedLogo component (`@hbcfield/shared/components`)
- [x] Mobile: login screen + SecureStore + auth context + tab navigation
- [x] Mobile: animated splash screen with gear rotation + button click effect
- [x] Mobile: safe area handling for Android navigation bar

### Phase 3: Task Management ✅ COMPLETE
- [x] Task CRUD endpoints (task-service)
- [x] Task status transitions (state machine)
- [x] Web CLIENT: create task UI
- [x] Web DISPATCHER: task list with filters
- [x] Web DISPATCHER: assign technician UI
- [x] TaskEvent creation on changes
- [x] Mobile TECHNICIAN: task list with pull-to-refresh
- [x] Mobile TECHNICIAN: task detail with status actions
- [x] Mobile TECHNICIAN: block task with reason input
- [x] Mobile TECHNICIAN: comments (view & add)
- [x] Web: task detail 60/40 layout (Request Details / Activity)
- [x] Web: activity timeline component with real-time updates
- [x] Web: premium comments section with scrollable list
- [x] Web: cancel request moved to dropdown menu (best practices)

### Phase 3.1: Service Reports ✅ COMPLETE
- [x] ServiceReport, ReportAttachment, PartUsed database models
- [x] Reports module in task-service (BullMQ processor)
- [x] Reports module in gateway (REST endpoints)
- [x] `POST /tasks/:taskId/complete` - Complete task with report
- [x] `GET /tasks/:taskId/report` - Get task's service report
- [x] `GET /assets/:assetId/reports` - Get maintenance history
- [x] `PATCH /reports/:id` - Update report (within 24h)
- [x] Parts CRUD endpoints
- [x] Web: ServiceReportSection component (photos, parts, signatures)
- [x] Mobile: Completion modal with summary/details input
- [x] Seed data: 4 sample reports with parts and attachments

### Phase 3.2: Role System Overhaul ✅ COMPLETE
- [x] New `ADMIN` role (replaces deprecated `CLIENT` role)
- [x] New `Platform` enum (WEB, MOBILE, BOTH)
- [x] Granular permission fields on User model:
  - [x] `platform` - Platform access restriction
  - [x] `canCreateTasks` - Task creation permission
  - [x] `canViewAllTasks` - View all org tasks permission
  - [x] `canAssignTasks` - Task assignment permission
  - [x] `canManageUsers` - User management permission
- [x] Database migrations:
  - [x] `20260126114708_add_admin_role_and_permissions`
  - [x] `20260126122816_migrate_client_to_admin_data`
- [x] Backward compatibility layer (LegacyRoleMap, normalizeRole)
- [x] Permission helper functions in `@hbcfield/shared/guards`
- [x] Updated `CurrentUserData` interface with permission fields
- [x] Controller endpoint updates with new @Roles decorators
- [x] Registration forces ADMIN role (security: never trust client input)
- [x] Seed data updated with new role and permission fields

### Phase 3.3: Technician Management ✅ COMPLETE
- [x] Gateway technicians module with full CRUD
- [x] `GET /technicians` - List with filters, pagination, sorting
- [x] `POST /technicians` - Create technician (auto-generate password if omitted)
- [x] `GET /technicians/:id` - Detail with stats (tasks, attendance, performance)
- [x] `PATCH /technicians/:id` - Update profile
- [x] `DELETE /technicians/:id` - Deactivate (soft delete)
- [x] `GET /technicians/:id/performance` - Performance metrics & trends
- [x] `GET /technicians/:id/tasks` - Task history
- [x] `GET /technicians/:id/attendance` - Attendance records
- [x] `GET /technicians/:id/assignments` - Location assignments
- [x] Shared types: `TechnicianProfile`, `TechnicianListItem`, `TechnicianStats`, `PerformanceMetrics`
- [x] Shared helpers: `getTechnicianTypeLabel`, `isTechnicianOnline`, `getAvailabilityStatus`
- [x] Web: Technicians list page (`/technicians`) with search, filters, pagination
- [x] Web: Create technician page (`/technicians/new`) with password generation
- [x] Web: Technician detail page (`/technicians/:id`) with 5 tabs:
  - [x] Overview: Stats cards + recent activity
  - [x] Tasks: Task history table
  - [x] Attendance: Clock-in/out records
  - [x] Locations: Assignment cards
  - [x] Performance: Charts (Recharts) + period comparison
- [x] Web: Availability calendar (`/technicians/availability`) with week/month views
- [x] Permission update: DISPATCHER can now manage technicians (create/edit/deactivate)

### Phase 3.4: Invitation System ✅ COMPLETE (2026-02-04)
- [x] `Invitation` model (codeHash, targetRole, status, expiresAt, technicianType, workMode, specialty, maxDailyJobs)
- [x] `InvitationStatus` enum (PENDING, ACCEPTED, EXPIRED, REVOKED)
- [x] Database migration: `add_invitation_system`
- [x] Invitation service in auth-service (create, validate, accept, revoke, list)
- [x] SHA-256 `codeHash` for lookup — ⚠️ **the plaintext code IS stored** in `Invitation.code`
  (deliberately, so an admin can re-copy a code from the list), so the hash is a lookup index,
  **not** a protection. A database dump exposes every live invitation code. Corrected 2026-08-24;
  this line previously read "plaintext never stored", which was false.
- [x] Invitation codes are **bearer credentials**: `Invitation` has no email column, so whoever
  presents the code joins the org — no approval step. Length raised 6 → 10 chars (32-symbol
  alphabet, 2^30 → 2^50) after the audit found a 500-IP pool could expect a hit in ~18 hours.
  Codes issued before the change still validate.
- [x] Gateway invitations module (controller, service, DTOs)
- [x] `POST /invitations` - Create invitation code (ADMIN, DISPATCHER)
- [x] `GET /invitations` - List organization invitations with filters
- [x] `GET /invitations/validate/:code` - Validate code (public)
- [x] `POST /invitations/accept` - Accept invitation & register (public)
- [x] `DELETE /invitations/:id` - Revoke invitation
- [x] Rate limiting: 10/min create/validate, 5/min accept
- [x] Shared types: `Invitation`, `InvitationValidation`, `CreateInvitationInput`
- [x] Web: Invitations management page (`/invitations`) with list, create dialog, revoke
- [x] Mobile: Registration screen with invitation code input
- [x] Seed data: 2 sample invitations (1 pending technician, 1 pending dispatcher)

### Phase 3.5: WorkMode Decoupling ✅ COMPLETE (2026-02-04)
- [x] `WorkMode` enum (ON_SITE, ON_ROAD, HYBRID) - decoupled from TechnicianType
- [x] `workMode` field on User model (default: HYBRID)
- [x] `workMode` field on Invitation model
- [x] Database migration: `add_work_mode` with data migration (FULL_TIME→ON_SITE, FREELANCER→ON_ROAD)
- [x] Shared types: `WorkMode` enum, helpers (`getWorkModeLabel`, `getWorkModeColor`, `canUseAttendance`, `canBeAssignedToLocation`)
- [x] Backend gate logic: attendance/locations gate on `workMode` instead of `technicianType`
- [x] Auth service: `workMode` in login response, user CRUD, invitation flow
- [x] Gateway DTOs: `workMode` in technician create/update/list and invitation DTOs
- [x] Mobile: Tab visibility gated on workMode (ON_ROAD=Tasks, ON_SITE=Clock, HYBRID=both)
- [x] Web: WorkMode filter + badge on technicians list page
- [x] Web: WorkMode select on create technician and invitation forms
- [x] Seed data: technician1=ON_SITE, technician2=ON_ROAD

### Phase 3.6: Dynamic Mobile Onboarding ✅ COMPLETE (2026-02-10)
- [x] Schema: `JoinRequest` model, `JoinPolicy`/`JoinRequestStatus` enums, `joinCodeHash`/`joinPolicy` on Organization, `onboardingCompleted` on User
- [x] Database migrations: `add_onboarding_join_system`
- [x] Shared types: `JoinPolicy`, `JoinRequestStatus`, `JoinRequest`, `OnboardingStatus`, `OrgCodeValidation`, `CreateOrganizationInput`, `SubmitJoinRequestInput`, `ApproveJoinRequestInput`, `RejectJoinRequestInput`
- [x] Shared constants: `ORG_CODE_LENGTH`, `ORG_CODE_CHARSET`, `JOIN_REQUEST_MAX_PENDING_PER_USER/ORG`, join policy/status helpers
- [x] Shared guard: `OnboardingCompleteGuard` (4th global guard), `@SkipOnboardingCheck()` decorator
- [x] Auth service: orphan user registration (no companyName → `onboardingCompleted: false`), `onboardingCompleted` in login/validateToken
- [x] Auth service: `OnboardingModule` (createOrganization, validateOrgCode, submitJoinRequest, acceptInvitation, getStatus, listJoinRequests, approve/reject/cancel, regenerateJoinCode, updateJoinPolicy)
- [x] Gateway: `OnboardingModule` (6 endpoints: create-org, validate-org-code, join-by-code, accept-invitation, status, cancel)
- [x] Gateway: `JoinRequestsModule` (3 endpoints: list, approve, reject) for ADMIN/DISPATCHER
- [x] Gateway: `OrganizationsModule` (3 endpoints: get join-code, regenerate, update settings) for ADMIN
- [x] Mobile: Simplified registration (no company name, no invitation code)
- [x] Mobile: 3-way navigation guard (auth → onboarding → app)
- [x] Mobile: Onboarding wizard with 5 screens (choose-path, create-org, join-org, use-invitation, pending-approval)
- [x] Mobile: Pending approval screen with 30-second polling
- [x] Web: Join Requests management page (`/join-requests`) with approve/reject dialogs
- [x] Web: Organization Settings page (`/settings`) with join code regeneration and policy management
- [x] Web: "Join Requests" nav item in sidebar for ADMIN/DISPATCHER
- [x] Web API client: `joinRequestsApi` and `organizationsApi` modules
- [x] Seed data: `onboardingCompleted: true` for existing users, org join code `ACME2026`, orphan user `newuser@example.com`, pending join request
- [x] Push notifications: `join_request_submitted`, `join_request_approved`, `join_request_rejected` event handlers

### Phase 3.7: Schedule & Members Web UI ✅ COMPLETE (2026-02-11)
- [x] Technician detail page refactored: 5 inline tabs extracted into `_components/` directory
- [x] **Schedule Tab**: Weekly schedule editor with read/edit modes, time inputs, active toggle, notes
- [x] **Time-Off Tab**: Time-off request management with create (date range picker), approve/reject/cancel actions, status filters
- [x] **Members Management Backend**: `listOrgMembers`, `updateMemberRole`, `removeMember` in auth-service
- [x] Backend guards: can't change own role, can't demote/remove last ADMIN
- [x] Gateway endpoints: `GET /organizations/members`, `PATCH /organizations/members/:id/role`, `DELETE /organizations/members/:id`
- [x] **Members Page** (`/members`): Organization members list with role/search filters, edit role dialog with permission checkboxes, remove confirmation
- [x] Sidebar updates: "Members" + "Schedule" nav items for ADMIN, "Members" for DISPATCHER, Schedule URL normalized to `/technicians/availability`

### Phase 4: Comments & Attachments ✅ COMPLETE
- [x] Comments: list/add API (task-service)
- [x] Attachments: S3 presigned URL upload (Hetzner Object Storage)
- [x] Task-service: AttachmentsService with S3 presigned URL generation, org authorization, file validation
- [x] Task-service: BullMQ processor wired for ADD_ATTACHMENT, DELETE_ATTACHMENT, GET_PRESIGNED_URL
- [x] Gateway: 4 attachment endpoints (presign, confirm, list, delete)
- [x] Web: attachment upload dropzone with drag-and-drop
- [x] Web: attachment gallery with image thumbnails, document cards, delete confirmation
- [x] Web: upload progress indicators
- [x] Mobile: camera + gallery attachment upload via existing useImagePicker hook
- [x] Mobile: attachment list with long-press to delete, tap to open
- [x] Mobile: upload progress indicator

### Phase 5: Real-time & Tracking ✅ COMPLETE
- [x] Socket.IO gateway setup (notification-service)
- [x] Socket.IO Admin UI integration (@socket.io/admin-ui)
- [x] Socket.IO monitoring endpoints (/socket/stats, /socket/clients, /health)
- [x] Enhanced logging (connect/disconnect/auth/emit events)
- [x] Event emission on task changes
- [x] Location tracking API (POST /tracking/location)
- [x] LocationHistory model for route tracking
- [x] Route fields on Task (routeStartedAt, routeEndedAt, routeDistance)
- [x] Haversine distance calculation
- [x] Route API endpoints (getTaskRoute, getWorkerCurrentRoute)
- [x] Mobile: auto-start tracking on EN_ROUTE status
- [x] Mobile: auto-stop tracking on ARRIVED
- [x] Web DISPATCHER: live map with technician markers
- [x] Web DISPATCHER: route visualization (polyline on map)
- [x] Web DISPATCHER: route info panel (distance, time, points)
- [x] Web: task detail shows route tracking data
- [x] Web: route map snaps GPS points to roads via OSRM map-matching (`route-map-view.tsx`)
- [x] **Background route capture** ✅ (2026-06-18) — exact path, not a start→end line
  - [x] Mobile: `src/services/background-route-tracking.ts` — `expo-location` background updates via a `TaskManager` task (`ROUTE_TRACKING`); keeps recording when phone is locked / app backgrounded
  - [x] Battery-aware: distance-based sampling (`distanceInterval: 25m`, only fires while moving), `deferredUpdatesInterval: 12s` to batch radio wake-ups, `Accuracy.High`, AutomotiveNavigation, Android foreground service
  - [x] Active task id persisted in SecureStore (`active_route_task_id`) so the headless task knows which task to attribute points to
  - [x] `useLocationTracking.ts` rewritten as a thin controller (same public interface); seeds one immediate point on EN_ROUTE then hands off to the background task; one-shot helpers (clock-in/geofence) stay foreground-only
  - [x] Batch upload: `POST /tracking/location/batch` → `update_location_batch` → `LocationService.updateLocationBatch` (one ownership/EN_ROUTE check, points sorted by device timestamp, single `routeDistance` increment in one transaction)
  - [x] Graceful fallback: if the batch endpoint is missing (404) or fails, `flushPoints()` falls back to sequential per-point `POST /tracking/location`
  - [x] Native config already in `app.config.ts` (iOS `UIBackgroundModes: location`, Android `ACCESS_BACKGROUND_LOCATION` + foreground service, expo-location plugin)
  - ⚠️ Requires a dev/production (EAS) build — background location does NOT run in Expo Go; member must grant "Always allow" location

### Phase 6: Notifications ✅ COMPLETE (Push) 🔶 PARTIAL (Email)
- [x] BullMQ job queue (task queue)
- [ ] Email templates
- [x] **Push Notification System** ✅ COMPLETE (2026-01-30)
  - [x] `UserPushToken` model for storing Expo push tokens
  - [x] Database migration: `add_user_push_tokens`
  - [x] Push service with Expo Server SDK (`expo-server-sdk`)
  - [x] Gateway endpoints: `POST /users/push-token`, `DELETE /users/push-token/:token`
  - [x] MessagePattern handlers for token registration/removal
  - [x] Task event push notifications (assigned, status changed, comments)
  - [x] Attendance event push notifications (clock in/out)
  - [x] Mobile: `usePushNotifications` hook with permission handling
  - [x] Mobile: Android notification channels (default, tasks, attendance)
  - [x] Mobile: Notification tap navigation to task detail
  - [x] Mobile: Push token cleanup on logout

### Phase 7: Attendance & Time Tracking 🔶 PARTIAL
- [x] **Phase 7.1: Foundation** ✅ COMPLETE (2026-01-26)
  - [x] `TechnicianType` enum (FREELANCER, FULL_TIME)
  - [x] `technicianType` field on User model
  - [x] `CompanyLocation` model (name, address, lat, lng, geofenceRadius)
  - [x] Database migration: `add_technician_type_and_company_locations`
  - [x] Locations module in task-service (service, processor, controller)
  - [x] Locations module in gateway (controller, service, queue service, DTOs)
  - [x] CRUD API endpoints: POST/GET/PATCH/DELETE `/api/v1/locations`
  - [x] Shared types and constants (`ATTENDANCE_CONSTANTS`, `LOCATION_JOB_TYPES`)
  - [x] Seed data: 3 sample company locations
- [x] **Phase 7.2: Scheduling & Availability** ✅ COMPLETE (2026-01-30)
  - [x] `TechnicianSchedule` model (weekly work schedule with day/start/end times)
  - [x] `TimeOff` model (vacation/sick leave with approval workflow)
  - [x] `TimeOffStatus` enum (PENDING, APPROVED, REJECTED, CANCELED)
  - [x] Database migration: `add_technician_schedules_and_time_off`
  - [x] Schedule CRUD: `GET/POST /technicians/:id/schedule`
  - [x] Time-off CRUD: `GET/POST /technicians/:id/time-off`
  - [x] Time-off approval: `PATCH /technicians/time-off/:id/approve`
  - [x] Time-off cancellation: `DELETE /technicians/time-off/:id`
  - [x] Availability query: `GET /technicians/availability?date=YYYY-MM-DD`
  - [x] Task-service technicians module with schedule/time-off logic
  - [x] Gateway REST endpoints with proper route ordering
  - [x] Web: Availability calendar with real API data (week/month views)
  - [x] Availability calculation: schedule + time-off + current tasks
- [ ] **Phase 7.3: Technician Assignment** (PENDING)
  - [ ] `TechnicianAssignment` model (user → location mapping)
  - [ ] Assignment CRUD endpoints
  - [ ] Location-based schedule support
- [ ] **Phase 7.4: Time Tracking** (PENDING)
  - [ ] `TimeEntry` model (clock in/out records)
  - [ ] Clock in/out API endpoints with geofence validation
  - [ ] Haversine distance check for geofence
- [ ] **Phase 7.5: Mobile Integration** (PENDING)
  - [ ] Clock in/out screen with GPS status
  - [ ] Geofence monitoring hook
  - [ ] Session duration display
- [ ] **Phase 7.6: Reports & Dashboard** (PENDING)
  - [ ] Attendance history endpoint
  - [ ] Web dashboard for attendance tracking
  - [ ] Export functionality

### Phase 8: SaaS Billing ✅ COMPLETE — module model LIVE (2026-08-21), observer seat + billing modes (2026-09-04)

> **Tiers are gone.** Starter/Professional/Business were replaced because they answered the wrong question: "which bundle covers the four things I need?" made a customer upgrade every seat to reach one feature, and left eleven capabilities gated with no price attached to any of them. **A thing is now bought, or it is not.**

**The bill** — three parts, each priced where it is actually used:

```
bill = staff seats     × €9.99                  ← unless an AGREED PRICE replaces the whole total
     + observer seats  × €2.00        ← external, watch-only (2026-09-04)
     + Σ spaces ( modules + usage ladders )
     + Σ org options
```

- [x] **Seat** flat €9.99 for everyone who works here. No office/field/in-house classification — that whole category of argument and code is gone.
- [x] **Observer seat €2** (2026-09-04) — an EXTERNAL member who only watches the work and can raise a job. `isObserverSeat(user, held)` reads the **effective permission set** (org role ∪ every space role), ⚠️ **never the name of a role**: roles are editable per organization, so a price following the label would let an admin add `canApproveOvertime` to a role called "Observer" and buy a supervisor for €2. Widening access re-prices the seat on the next reconcile with no billing code touched. Restricted to `isExternal`, and that restriction IS the anti-abuse mechanism — nobody can run a business on external members (no clock, no leave, no personnel file, nothing the org owns).
  - ⚠️ **Space-assignment routes must `rebill()`** — `assignMember` / `updateAssignment` / `removeAssignment` set the role that sets the price.
  - The bill splits `seatCount` into `staffSeatCount` + `externalSeatCount` for the SCREEN only; Stripe is still told one seat quantity, because an external supervisor costs the same €9.99 on the same price ID.
- [x] **Modules** per SPACE (`billing/module-pricing.ts`). Switching one on **is** the purchase; the space is billed for it. Tracking €25, Time Tracking €25, Space Sharing €29, Service Reports €15, CRM €15 base, Client Portal €49 base, Assets €9 base, task/agile from €3.
- [x] **Usage ladders** per space, graduated like tax bands (`billing/usage-pricing.ts`) — crossing into a cheaper band re-prices only the units in it, so a bill can never FALL when you add one:
  - Assets — 10 free, then €1.20 → €0.30
  - CRM — 50 clients free, then €0.30 → €0.05. *First band is €0.30 on purpose: €15 ÷ 50 = €0.30, so client 51 costs what clients 1–50 implicitly did. No cliff at the allowance.*
  - Client Portal — first included, then €29 each
- [x] **Org add-ons** (`billing/add-ons.ts`, 11 keys) — **called "Options" everywhere a customer reads** since 2026-09-04 (display only: `addOns` stays the column, the API route `PUT /billing/add-ons` and half the Stripe lookup keys). Capabilities bought ONCE for the organization: workflows €29, invoicing €19, shift_scheduling €19, reports_builder €19, priority_routing €19, audit_log €15, recurring €12, overtime €9, report_scheduling €9, live_chat €29, dedicated_support €99. ⚠️ **Org-wide things must never be per-space** — one audit log billed four times to a four-site customer.
- [x] **Gating**: `PlanGuard` → `orgHasAddOn(user.orgAddOns, key)`, **fails closed on an unknown key** (a typo in `@RequirePlan` must 402, not grant the feature to everyone). `ModuleGuard` → the space's module list, no tier. Both still 402 (not 403) and **let reads through**.
- [x] **Billing modes** (2026-09-04) — `Organization.billingMode`: **AUTOMATIC** (card charged), **INVOICE** (Stripe's own `collection_method: 'send_invoice'` — it issues and emails the invoice, customer pays by transfer, `invoice.paid` reconciles it), **EXTERNAL** (nothing charged; the bill is shown at list price). Set per org on admin.hbcfield.com. INVOICE is refused without a billing email — checked where the mode is SET, not where the invoice is sent. Moves the LIVE subscription (`setCollectionMethod`), never recreates it; `days_until_due` SET moving in and CLEARED moving out. **Stripe first, database second.** ⚠️ `billedExternally` is kept in step but read by nothing — new code asks `billingMode`.
- [x] **Billing alerts** (`BillingAlert`, 2026-09-04) — the two silent failures. **DROP**: a material fall, `isMaterialDrop` = drop ≥ €20 AND (≥20% OR ≥ €100) — two tests ORed because one threshold cannot cover a €90 customer and a €10,000 one. **SYNC_FAILED**: reconcile swallows Stripe errors on purpose (a member must stay addable when Stripe is down) and now records them, **deduped into one open row per org, counting up**. Surfaced as the Revenue tab on admin.hbcfield.com, whose count loads on every tab.
- [x] `orgAddOns` resolved server-side in `validateToken`. ⚠️ **THREE** places build a request context in `auth.service.ts` — all three must set it, or that path 402s every premium mutation.
- [x] **Stripe by lookup key**, no env vars: 62 prices (`billing/stripe-catalog.ts`), e.g. `hbcfield_module_crm_monthly`. Sixty-two Price IDs in env would be a second price list that drifts. Usage lines are €0.01/unit × ladder-cents — Stripe's own tiered pricing can't express a PER-SPACE ladder and refuses duplicate prices in one subscription. **Annual usage is €0.10/unit** (leaving it at 1c charged a year at one month's rate).
- [x] `reconcileSeats` recomputes the WHOLE line-up rather than diffing; a line that leaves the bill is **deleted**, not left at its old quantity. `lastBilledCents` decides whether an annual change is an increase — line counts can't, since €29→€9 is fewer euros and the same count.
- [x] **What triggers a re-bill**: members, space create/update/archive/purge, add-on changes → immediate (debounced). Assets/clients/portals → **nightly 02:00 sweep only** (`reconcileUsageDaily`), because importing 50 flats would otherwise be 50 prorations.
- [x] **`billedExternally`** — organizations on negotiated contracts are never charged automatically. Checked FIRST in reconcile, before any Stripe call, and refuses checkout. The bill is still computed and shown, labelled "At list price".
- [x] 14-day trial grants **every** add-on (`ADD_ON_KEYS`) — a trial that hides half the product cannot tell anyone whether the product is worth buying.
- [x] Migrations `20260821180000_org_addons` (backfills each org's add-ons **from its old tier**, so nobody loses access at the switch) and `20260821200000_billed_externally`.
- [x] **LIVE**: **33 prices** on the live account (31 → 32 documents → 33 observer seat, `hbcfield_seat_observer_monthly` €2 created 2026-09-04), all `tax_behavior: exclusive`; re-running the sync reports `33 already correct`. ⚠️ VAT is added ON TOP — the billing page says "Excludes VAT" and deliberately does NOT print a rate, because cross-border EU B2B is reverse-charged to zero and Stripe decides at checkout.
- [x] **Agreed price** (2026-09-05) — `Organization.agreedMonthlyCents` **replaces** the computed total for a negotiated customer (€863 of product for €120). Applied at the END of `OrgBillService.compute()` and nowhere else, so the Stripe lines, `lastBilledCents`/operator MRR and the customer's billing page all read one number. Stripe gets ONE line at the exact amount under `hbcfield_agreed_monthly` (catalogue **5**), and a contracted org stops generating prorations entirely. ⚠️ **Not a coupon** — a coupon moves when they add a seat and would make the screen model Stripe's discount maths. ⚠️ **`agreedListCents` is the drift baseline, not the agreed price** — €120 vs €863 is the deal, and comparing those two alerts every night forever. ⚠️ **The term never auto-reverts**: `CONTRACT_EXPIRING` fires 30 days out and an operator decides, because a date silently taking a customer from €120 to €863 is a chargeback. Operator-only on `billingOps`; a source-scanning test fails if anything outside platform-admin writes the columns.
- [x] **Organization off switch** (2026-09-05) — "Suspend" used to refuse WRITES only (it mapped `subStatus` to `canceled`), so a suspended company still signed in and read everything. `suspendedAt` now refuses sign-in, refuses **and deletes** the refresh token, and fails `validateToken` — so it bites within the gateway's auth cache TTL. The billing read-only lock is unchanged, for the case it was built for.
- [ ] One real live purchase (real card) — pending, user-driven

> ⚠️ **`plans.ts` still exists and is VESTIGIAL.** Nothing in it decides access or price. It survives only for the operator price book (`platform-pricing.service.ts`, C2) and its Stripe sync (C3), which are working tier-based operator features. **Do not add a caller** — ask `orgHasAddOn` or the space's module list.

---

## 13. SOLID & DRY PRINCIPLES

> **IMPORTANT**: All code in this project MUST follow SOLID and DRY principles.

### DRY (Don't Repeat Yourself)

**Use shared modules from `@hbcfield/shared`:**

```typescript
// ❌ BAD - Duplicating Redis config in each service
{
  transport: Transport.REDIS,
  options: { host: 'localhost', port: 6379 }
}

// ✅ GOOD - Use shared factory
import { createMicroserviceOptions } from '@hbcfield/shared';
NestFactory.createMicroservice(AppModule, createMicroserviceOptions());
```

**Available shared utilities:**
| Import | Purpose |
|--------|---------|
| `SERVICE_NAMES` | Type-safe service name constants |
| `createMicroserviceOptions()` | Redis microservice bootstrap config |
| `createClientOptions(SERVICE_NAMES.X)` | ClientsModule registration |
| `createBullMQConfig()` | BullMQ root module configuration |
| `QUEUE_NAMES`, `TASK_JOB_TYPES` | Queue and job type constants |
| `DEFAULT_JOB_OPTIONS` | Standard job retry/backoff options |
| `success()`, `error()`, `paginated()` | Standardized API responses |
| `ErrorCodes` | Common error code constants |
| `PrismaModule`, `PrismaService` | Shared database access |
| `AnimatedLogo` | Shared logo component (from `@hbcfield/shared/components`) |
| `Roles`, `Public`, `CurrentUser` | NestJS decorators (from `@hbcfield/shared`) |
| `RolesGuard`, `hasRole()` | Role-based access control guard |
| `isAdmin()`, `isDispatcher()`, `isTechnician()` | Role check helpers with legacy normalization |
| `canAccessPlatform()`, `canAccessWeb()`, `canAccessMobile()` | Platform access checks |
| `canCreateTasks()`, `canViewAllTasks()`, `canAssignTasks()`, `canManageUsers()` | Permission checks with role fallback |
| `LegacyRoleMap`, `normalizeRole()` | Backward compatibility for CLIENT → ADMIN |
| `DEFAULT_PERMISSIONS` | Default permission values by role |
| `STATUS_TRANSITIONS`, `isValidStatusTransition()` | Task status state machine |
| `orgMonthlyCost()`, `spaceMonthlyCost()` | The whole bill / one space's bill (billing/module-pricing.ts) |
| `usageCost()`, `marginalUnitCents()`, `nextUsageBreak()` | Volume ladders — what a count costs, what the NEXT one costs |
| `AVAILABLE_ADD_ONS`, `orgHasAddOn()`, `addOnDef()` | Org-wide capabilities ("Options" to a customer) and the gate that reads them |
| `isObserverSeat()`, `OBSERVER_SEAT_MONTHLY_CENTS` | The €2 external seat — priced from permissions HELD, never a role's name |
| `BILLING_MODES`, `collectionMethodFor()`, `billsThroughStripe()` | Card / invoice / agreement, and what each means to Stripe |
| `isMaterialDrop()` | Is this fall in a bill worth an alert? (≥€20 AND (≥20% OR ≥€100)) |
| `applyAgreement()`, `agreementFrom()`, `validateAgreedPrice()` | An agreed price — the ONE place a computed bill's total is replaced |
| `isMaterialAgreementDrift()`, `agreementEndsWithin()` | Has a contracted customer outgrown the deal, and is the term ending? |
| `isOrganizationSuspended()`, `ORG_SUSPENDED_MESSAGE` | The organization off switch, read at all three doors into the product |
| `passwordResetEmail()`, `invitationEmail()`, `signLinkEmail()`, … (`mail/email-templates.ts`) | Every email the product sends, as `(locale, facts) → { subject, html }`. Senders pick the language and deliver; they write no words or markup (`email-catalogue-guard.spec.ts`) |
| `EMAIL_MESSAGES`, `emailTranslator()`, `escapeHtml()`, `bold()` | The email catalogue (en/de/es/fr/it) and the renderer that escapes every sentence and value |
| `localesByAddress()`, `groupByLocale()` | Which language an ADDRESS reads (its account's, one query for a list) — for member invitations and report recipients |
| `clientEmailLocales()`, `clientEmailLocale()` | Which language a CLIENT's email is written in: the account behind the address → `Customer.locale` → the organization's country (`organizationLocaleFromCountry`, single-language countries only) → English. Two lookups for a batch. Every client sender uses it — signing link + re-send, portal invitation + re-send. ⚠️ Never the sending member's language |
| `clientDocumentLocale()` | The same client rule for a DOCUMENT that may carry no address (an invoice) — no address still reaches the organization's country. Sent as `documentLocale` on `GET /invoices/:id` only (never the list); the web draws the PDF in it, the office may pick another per download |
| `parseClientLocale()` | What `Customer.locale` may hold: a supported code, or null/"" to clear. Anything else is REFUSED (400), not dropped — the gateway, auth-service and the web form all read it |
| `CLIENT_LOCALE_OPTIONS`, `clientLocaleFormValue()`, `clientLocalePayload()`, `clientLocaleName()` | "Language for emails" as a FORM holds it — web client form AND the phone's create form / record (gated on `crmCaps.editInfo`). "" = same as the organization, sent as null |
| `REPORT_LABELS`, `reportLabel()`, `localizeReportColumns()` | Report dataset/column names in five languages. The registry names a `labelKey`, never a sentence; the web table (and its CSV/PDF) and the scheduled email both read it. Organization-authored names and row values stay as written |
| `formatNumberFor()`, `pluralFormFor()` | Numbers and one/other plurals per locale — shared by the push and email renderers |
| `documentTypeVisibleTo()`, `visibleTypeWhere()`, `visibleTypeSelfWhere()` | Who may SEE documents of a type — one rule in three shapes (predicate / documents `where` / catalogue `where`). Empty list = no restriction |
| `assertMemberInScope()`, `memberScopeFilter()` | "Is this person in my crew?" — one rule for both services |
| `activeAssignmentWhere()` | "Is this member assigned to this workspace RIGHT NOW?" — shared by the clock-in list and the clock-in check |
| `planHandover()`, `canHandOver()`, `partiesAfter()` | What handing an asset over WILL do — the confirm dialog renders it, the server executes it |
| `holderOn()`, `holdersOn()`, `totalsByPeriod()`, `attribute()` | Whose cost was this? Computed from the date, never stored |
| `custodyDays()`, `openPeriods()`, `partyKey()` | One custody, read for a screen |
| `parseReceipt()`, `moneyToCents()`, `categoryForReceipt()` | A photographed slip → amount, date, vendor. On-device, nothing calls out |
| `parseContract()`, `proposeFromContract()`, `canApply()`, `fieldsForKind()` | A contract → a reading, then the three things accepting it would do |
| `classifyDocument()`, `worthProposing()` | Is this page a contract for a thing, or a fuel receipt? Needs BOTH signals |
| `mayReviewProposal()`, `proposalReviewSpaces()`, `proposalInSpace()` | Who may decide a page a member sent in: a chosen kind decides by its workspace; with no kind, the member's workspaces. The queue, accept/reject, the page link and the routing all read it; `proposalInSpace` narrows a workspace tab's queue (`?spaceId=`) to its own and never widens |
| `assetEntryDateProblem()`, `assetEntryDayBounds()`, `assetEntryOccurredAt()`, `assetEntryDateExempt()`, `assetEntryDateText()` | ONE date rule for everything filed against an asset (logbook, expense, Money tab): 120 days back unless org-wide `canManageAssets`, a day of grace forward, one sentence per refusal. Server door `readAssetEntryDate`; the `LOG_*` names are aliases |
| `keepFieldsForKind()`, `fieldsDroppedByMove()` | Moving an asset to another kind — what survives, and what the warning names. One rule read two ways |
| `NAV_OPTION`, `SPACE_TAB_OPTION`, `SETTINGS_OPTION`, `surfaceAllowed()` | Which surface each Option owns. The navbar, workspace tabs and settings list all read these — adding an Option is adding a row |
| `joinCodeCandidates()`, `JOIN_CODE_MAX_LENGTH` | Telling an org join code from an invitation code |
| `moduleAllowedForExternal()`, `filterExternalModules()` | An external member holds no clock and no time_off |
| `stripeCatalog()`, `stripeLinesForBill()`, `stripeLookupKey()` | What Stripe must hold, and a bill as subscription lines |
| `BCRYPT_COST_FACTOR`, `MAX_FAILED_ATTEMPTS`, etc. | Auth constants |
| `EmailField`, `PasswordField`, `NameField`, etc. | Validation decorators |
| `buildQueryString()`, `buildUrlWithQuery()` | Query string building utilities |
| `buildDateRangeFilter()`, `buildSingleDayFilter()` | Prisma-compatible date filters |
| `getStartOfDay()`, `getEndOfDay()` | Date boundary calculations |
| `getStartOfWeek()`, `getEndOfWeek()`, `getStartOfMonth()`, `getEndOfMonth()` | Period calculations |
| `formatDuration()`, `formatTime()`, `formatShortDate()`, `formatFullDate()` | Date display formatting |
| `TimeEntry`, `Break`, `CompanyLocation`, `AttendanceStatus` | Attendance types (from `@hbcfield/shared`) |
| `TimeEntryStatus`, `BreakType`, `ApprovalStatus` | Attendance enums |
| `isBreakActive()`, `getBreakTypeLabel()`, `getTimeEntryStatusLabel()` | Attendance helper functions |
| `TechnicianProfile`, `TechnicianListItem`, `TechnicianStats` | Technician types (from `@hbcfield/shared`) |
| `PerformanceMetrics`, `PerformanceTrendPoint` | Technician performance types |
| `getTechnicianTypeLabel()`, `getTechnicianTypeColor()` | Technician type display helpers |
| `isTechnicianOnline()` | Check if technician is online (location updated within 5 min) |
| `getAvailabilityStatus()`, `getAvailabilityLabel()`, `getAvailabilityColor()` | Availability status helpers |
| `SPECIALTY_OPTIONS` | Technician specialty options array |
| `WorkMode` | WorkMode enum (ON_SITE, ON_ROAD, HYBRID) |
| `getWorkModeLabel()`, `getWorkModeColor()` | WorkMode display helpers |
| `canUseAttendance()` | Check if workMode allows attendance (ON_SITE or HYBRID) |
| `canBeAssignedToLocation()` | Check if workMode allows location assignment |
| `Invitation`, `InvitationValidation`, `CreateInvitationInput` | Invitation types |
| `InvitationStatus` | Invitation status enum (PENDING, ACCEPTED, EXPIRED, REVOKED) |

### SOLID Principles

| Principle | Application |
|-----------|-------------|
| **S**ingle Responsibility | Each service handles one domain (auth, tasks, tracking) |
| **O**pen/Closed | Use decorators (`@Roles`, `@Public`) to extend behavior |
| **L**iskov Substitution | All services implement consistent interfaces |
| **I**nterface Segregation | DTOs are specific to each operation |
| **D**ependency Inversion | Inject services via constructor, use interfaces |

### Before Adding New Code

1. **Check `@hbcfield/shared`** - Does a utility already exist?
2. **Check existing services** - Is there similar code to extract?
3. **Consider reusability** - Will this be used more than once?

If duplicating code, **STOP** and create a shared utility instead.

---

## 14. CODING CONVENTIONS

### NestJS Services
```typescript
// Pattern: Controller → Service → Prisma
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: User) {
    return this.tasksService.create(dto, user);
  }
}
```

### API Response Format
```typescript
// Success
{ data: T, message?: string }

// Error
{ statusCode: number, message: string, error: string }

// Paginated
{ data: T[], meta: { total, page, limit, totalPages } }
```

### File Naming
```
*.controller.ts  - HTTP handlers
*.service.ts     - Business logic
*.module.ts      - DI container
*.dto.ts         - Request/Response shapes
*.guard.ts       - Auth guards
*.decorator.ts   - Custom decorators
*.gateway.ts     - WebSocket handlers
```

---

## 15. COMMON TASKS QUICK GUIDE

### Add new API endpoint
1. Add DTO in `src/modules/{module}/dto/`
2. Add method in `*.service.ts`
3. Add route in `*.controller.ts`
4. Swagger decorators auto-generate docs

### Add new database model
1. Edit `apps/api/auth-service/prisma/schema.prisma`
2. Run `pnpm db:migrate` (name the migration)
3. Run `pnpm db:generate`

### Add Socket.IO event
1. Edit `apps/api/notification-service/src/modules/websocket/websocket.gateway.ts`
2. Add event type to `packages/shared/src/types/index.ts`

### Add new web page
1. Create `src/app/{route}/page.tsx` (App Router)
2. Use shared components from `src/components/`

---

## 16. TROUBLESHOOTING

| Issue | Solution |
|-------|----------|
| Docker not running | `docker info` to check, start Docker Desktop |
| DB connection failed | Check `DATABASE_URL` in `.env`, ensure Docker containers running |
| Prisma client outdated | `pnpm db:generate` |
| Port already in use | Kill process: `lsof -ti:PORT \| xargs kill -9` |
| Redis connection refused | Check Redis container: `docker ps` |
| CORS errors | Check `CORS_ORIGINS` in gateway `.env` |
| localhost:3000 errors after a code change | **A bare `next build` was run while `next dev` was running** — they share `.next`, so the build corrupts the dev server and it errors until restarted. Use `pnpm build:check` instead: it builds into `.next-check` and removes it after, leaving `.next` alone. |
| Duplicate tasks created | Kill zombie processes: `pkill -f task-service`, restart API |
| Job stuck in queue | Check Bull Board at `/admin/queues`, retry or remove |
| BullMQ connection error | Verify Redis is running, check `REDIS_HOST` and `REDIS_PORT` |

### Monitoring Tools

| Tool | URL / Command | Purpose |
|------|---------------|---------|
| **Bull Board** | `http://localhost:4000/admin/queues` | BullMQ job monitoring |
| **Socket.IO Admin** | `https://admin.socket.io` → connect to `localhost:4001` | WebSocket monitoring |
| **Socket Stats** | `curl http://localhost:4001/socket/stats` | Connection statistics |
| **Swagger** | `http://localhost:4000/docs` | API documentation |
| **Prisma Studio** | `pnpm db:studio` → `http://localhost:5556` | Database GUI |
| **Redis CLI** | `docker exec -it hbcfield-redis redis-cli` | Redis commands |
| **RedisInsight** | Install via `brew install --cask redisinsight` | Redis GUI (optional) |

### Redis CLI Quick Commands
```bash
docker exec -it hbcfield-redis redis-cli
> KEYS bull:*           # List BullMQ keys
> LLEN bull:tasks:wait  # Count waiting jobs
> MONITOR               # Watch all commands (Ctrl+C to exit)
```

---

## 17. NEXT IMMEDIATE TASKS

**Current Sprint**: nothing blocking. Outstanding and NOT doable from the machine: (1) **one real card payment has never completed** — pending since July; (2) INVOICE mode has produced a real subscription (`sub_1UC6kH…`, `send_invoice`, €472.78 incl. AT VAT, due 18 Sept) but **no customer has paid one yet**, and HBC GmbH has since been moved to EXTERNAL; (3) the app stores still serve an older binary, so an OTA only reaches installed 1.0.3/1.0.4 apps.

### Recently Completed (2026-09-10) — Custody: who holds a thing, and what they spend on it

Migration `20260910120000_asset_custody` (additive + backfill; verified locally: 8 holder rows → 8 open periods, re-run is a no-op). Detail in memory `asset-custody-and-expenses`. **Not deployed yet.**

- **`AssetHolder` could not answer any question the business asks.** It is "who has it now" and the row is deleted on a handover, so the moment a driver gives a van back there is no record they ever had it. Custody is stored as PERIODS now (`AssetCustody`, `endedAt: null` = has it now), and `AssetHolder` stays as a fast index of the present that every existing screen already reads.
- ⚠️ **The holder is never written onto a cost.** See the endpoint table above — this is the decision the whole design rests on.
- ⚠️ **One writer for both tables.** `AssetHoldersService.set()` was deleted; `AssetCustodyService.apply()` writes both in one transaction, and the asset EDIT path goes through it too. An edit that quietly skipped it would move the driver with no timeline entry and re-attribute every later cost, silently.
- **A member files an expense from the pump.** On-device OCR (`expo-mlkit-ocr`, the same optional binding as the card scanner) reads the slip; `parseReceipt` in shared decides which figure is the total. ⚠️ **"Biggest number wins" reads the odometer** — a labelled figure beats an unlabelled one whatever the amounts, and dates are stripped before the scan because "09.09.2026" contains "202".
- ⚠️ **Authorised by custody, not a permission**, and asked of the RECEIPT'S date. ⚠️ **SUBMITTED counts for nothing** until somebody with `canManageAssets` accepts it.
- **Web**: a Custody tab on the record (timeline + what each period cost), a handover dialog that renders `planHandover`'s own plan before you agree to it, a Custody tab on the member (both cars, costs split at the handover), and an org-wide queue on `/assets` that renders nothing when empty.
- **Mobile**: "What I have" (custody, so no picker of the org's equipment) → camera → check-before-sending with read-vs-guess colouring. The entry appears only when the member actually holds something.
- **DRY**: the holder picker was extracted from the record dialog and is now shared with the handover dialog — two copies of a control that enforces a kind's rules is how a single-holder van gets two drivers on one screen and one on the other.
- **A contract creates the car, hands it over and retires the old one** — `read` → `preview` → `apply`, on the web (paste the agreement) and on the phone (photograph it, gated on `canManageAssets`, entry on the Manage tab). See the endpoint table for the six warnings that matter.
- ⚠️ **`external-observer-writes.spec.ts` caught the first cut**: `read` and `preview` were POSTs gated on `canViewAllTasks`. The right answer was not an exception — it was noticing that a preview enumerates what a member holds, and gating all three on `canManageAssets`.
- **A member sends the page in and somebody responsible decides** (`AssetProposal`, migration `20260910190000_asset_proposals`). The driver photographs the agreement at the desk; `classifyDocument` decides whether it is a contract; it lands with the people responsible for that member; they accept — which runs the same `/contracts/apply` — or refuse with a reason the member reads. See the endpoint table for the five warnings.
- ⚠️ **The plate reader had a real false positive**: "Seite 3 von 7" matched the registration shape ("VON 7"), so a terms page proposed a van registered VON 7. Two digits minimum plus a short stop-word list — the SHAPE is genuinely ambiguous, only the vocabulary is not.
- Guards: `expense-authorization.spec.ts` (proved by planting a permission on the member route), `asset-proposal.spec.ts` (a member cannot name somebody else as holder, two reviewers cannot both accept, a failed accept returns to the queue, the fallback routing), `document-kind.spec.ts` (a leasing company's fuel receipt is refused), `asset-custody.spec.ts` (both tables move together, drift self-heals), `asset-contract.spec.ts` (the plan is recomputed, a client-supplied "retire this" is ignored), `custody.spec.ts` + `receipt.spec.ts` + `contract.spec.ts` in shared.

### Recently Completed (2026-09-08) — Draw the site, sell to clients, drive the route

**PROD `600bf7f4`** (rollback tag `prod-pre-route-planner` → `61f94c09`; migration
`20260907190000_geofence_polygon`, additive; backup `pre-route-planner_20260907_224253.sql.gz`,
1.8M/103 tables). Verified after deploy: 13 sites, radius range **15–100 unchanged** — the
migration moved the DEFAULT for new sites only. Detail in memory `route-planner-and-visits`.

- **A site can be DRAWN, not just circled.** `CompanyLocation.geofencePolygon` beats the radius
  when present; `isAtSite()` in shared is the single rule for "is this person at the site",
  and the radius field greys out with a note when a boundary exists.
  - ⚠️ The radius slider is **logarithmic**. Raising the cap 100→500 put a 50m radius at 8% of
    the track instead of 44% — the number never changed and it read as "clicking Draw changed
    my radius". Half the track now covers 10–75m.
  - ⚠️ The boundary map opens into a **dialog of its own**. Three attempts to grow it in place
    failed: a transformed ancestor becomes the containing block for `fixed`, then
    `overflow-y-auto` clips it, and asking the host to widen worked in one surface and did
    nothing in the other.
- **Sales Rep** is a built-in role — `crmViewOwn + crmWork + crmEditInfo + canCreateTasks`.
  No migration: `listAccessRoles` upserts built-ins per org.
  - ⚠️ **ORG scope is load-bearing** — `resolveCrmCaps` reads CRM keys off the member's org
    role only, so a space-scoped sales role grants nothing while looking configured.
  - ⚠️ **Never add `canViewAllTasks` to it.** The resolver treats it as the legacy "read every
    client", so the rep would silently gain the whole organization's book. A test pins this.
- **A task can be a client visit.** Pick the client in the New Task dialog (only where the
  workspace runs CRM) and the task takes their address as its GPS destination; a text-only
  address is geocoded once on selection.
  - ⚠️ Reading only the address ROWS was wrong on real data — most clients carry the address
    on the client RECORD and have no rows at all.
  - ⚠️ `GET /customers?spaceId=X&includeUnfiled=true` exists because clients filed in **no**
    workspace are the majority in a real book; scoping strictly showed an empty picker.
- **Routes follow roads.** Google Routes API answers order + geometry in one call
  (**Google → OSRM → nearest-neighbour**). ⚠️ The last engine returns an order and **no
  geometry** — pins with no line between them means no engine was configured. Billed per
  request, so it runs on Optimize and never on a screen opening.
- **`tracksLocation`** on the task list says whether a task's flow has a travel step, resolved
  through the per-org workflow cache (one lookup per distinct flow, no statuses join on the
  hot path). Field Service/Logistics/Sales travel; Support/Office/Inspection do not.

> ⚠️ **The mobile half is BUILT and NOT SHIPPED.** The map-first route planner, nav-app
> detection and resume-from-here are committed but not OTA'd, because (1) nav-app detection is
> **native config** (iOS `LSApplicationQueriesSchemes`, Android `<queries>`) and needs a BUILD,
> and (2) the planner is gesture-heavy and its crash fix is unconfirmed on a device.
> ⚠️ `eas update` inlines `EXPO_PUBLIC_API_URL` from the local `.env` (localhost) — set it inline.

### Recently Completed (2026-09-07) — The site got heavy: static through Node, five languages in one chunk

**PROD `0996f528`** (rollback tag `prod-pre-static-i18n` → `fa5209b4`; no migrations, web-app image only). Raised by a US user reporting slowness. The server was idle — 15ms responses, load 0.62/8. The weight was on the wire, and a ~200ms round trip made Europe unable to feel it. Detail in memory `web-perf-static-and-i18n`.

- **`/_next/static/` had no nginx location at all.** Every script, font and the 4MB hero video fell through `location /` into Node, and nginx — whose buffers cap at 128k — wrote each response to a **temp file on disk** before sending it. `sendfile` was on and never reached. Assets now come off disk from `/opt/doergo/static`, published by `infra/sync-static.sh` (**must run after every web-app deploy**; `infra/deploy.sh` step 6). Measured: 12 requests that caused 12 disk spills now cause **0**.
  - ⚠️ **`try_files $uri @nextjs` is the safety net** — a missed sync falls back to Node and serves identical bytes. Proven by hiding a file.
  - ⚠️ **`^~` on `/api/`, `/uploads/`, `/downloads/`, `/socket.io/` is load-bearing**: a regex location beats a plain prefix, so without it the static-media regex captures `/uploads/avatar.png`.
  - ⚠️ **Prune by `ctime`, never `mtime`** — `cp -a` preserves mtime and `intro.mp4` is from July, so an mtime prune deletes the files it just copied. It did, on the first run.
  - `http2` is now stated in hbcfield's own config; it was on **only** because the unrelated *ourmoda* site sets it on the shared `:443` socket.
- **All five locales shipped in one chunk** — 57% of the page's JavaScript. ⚠️ **The cause was not the i18n entry point.** `HomeClient.tsx` is `'use client'` and imported three pure URL helpers from `lib/industries.ts`, which also held the copy accessors — **an import is a module, not a symbol**, so one helper dragged the whole catalogue across the client boundary. Fixing only `i18n/index.ts` would have changed nothing.
  - English stays bundled (SSR is pinned to it and it is `fallbackLng`); de/es/fr/it load through an **explicit `import()` map** — never a template literal, which webpack turns into a context module.
  - ⚠️ **`changeLanguage` is async now.** `i18n.changeLanguage(...)` called directly sets the language without loading its bundle and silently renders English.
  - The localized home routes take copy as a **prop from the server page**, only the 4 namespaces they render — sending the whole file took those pages from 113kB to 459kB of HTML. Two of the four are reached solely via template-literal keys.
  - **Measured live: homepage 822 → 439 kB gzipped; biggest chunk 470 → 88 kB.** Build report: `/` 737 → 346 kB First Load JS.
- Two guards, each proven by planting its bug: `i18n-client-bundle.spec.ts` walks the real client import graph; `marketing-namespaces.spec.ts` scans every `t()` call. ⚠️ Both **strip comments before scanning** — the first version matched an example inside its own doc comment.
- `.dockerignore` now excludes `apps/web-app/public/downloads/` — ~213MB of untracked APKs that every image build copied in and nothing ever served.
- **Still open**: `/` ships the full English catalogue (335kB) though a marketing visitor needs ~9% — splitting by *surface* is the next win. Cloudflare (US edge, brotli, HTTP/3) needs the user's account, and ⚠️ requires `set_real_ip_from` + `CF-Connecting-IP` or every visitor arrives as one IP and the 3/sec throttle buckets them together.

### Recently Completed (2026-09-06, latest) — The shift clock: two clocks, planned rests, away from a site

**PROD `fa5209b4`** (rollback tag `prod-pre-shift-clock` → `5ff66b2e`; 7 migrations; backup `pre-shift-clock_20260906_210743.sql.gz`, 102 tables). Verified after deploy: **0 entries changed hours**, 163 backfilled, 3 workspaces opened for away — exactly the pre-flight prediction. Detail in memory `shift-clock-two-models`.

- **Two clocks.** `clockInAt`/`clockOutAt` stay evidence; `countedStartAt`/`countedEndAt`/`paidMinutes` are what payroll reads — `max(clockIn, shiftStart)` / `min(clockOut, shiftEnd)` less unpaid rests, one rule in `packages/shared/src/attendance/counted-time.ts`. ⚠️ **Approved overtime needs no special case**: approving MOVES `expectedClockOutAt`, so the same `min()` pays it. ⚠️ `expectedClockInAt` is now PERSISTED — it was computed at every clock-in and thrown away.
- **Rests are planned** (`BreakRule` per workspace, a shift overrides it), resolved ONCE at clock-in and frozen onto the entry. ⚠️ `nextBreakRemindAt` is a COLUMN, not a field in the plan JSON — JSON cannot be indexed and the sweep's cheapness is asking "what is due". ⚠️ **An unanswered prompt counts toward the snooze cap** — counting only explicit "Later" taps meant an ignored prompt re-fired every 5 min, ~140 times a shift. A missed rest FLAGS and never deducts.
- **Overtime loops.** `OvertimeRequest.timeEntryId` was `@unique`, so a shift held one record ever while the flow already looped. One row per round now, with the signature.
- **Away from a site is a MODE, not a place.** It was filed in a synthetic Remote bucket, so the rota, the rests and the expected hours were all left behind. Gated by **CEILING × GRANT**: `CompanyLocation.geofencePolicy` is a fact about the place, `User.allowRemote` + a per-assignment override is the decision about the person. Neither alone is enough — a strict site refuses an admin. ⚠️ **An away day is not a geofence excursion.** ⚠️ `REQUIRE_GEOFENCE_FOR_CLOCK_IN` is removed.
- **Notifications: workspace → the member's watchers → nobody.** Four attendance events fell back to every org ADMIN, which put the owner on every late departure. ⚠️ Authority is untouched — an admin may still approve, they are simply not TOLD.
- **Push:** the Android `attendance` channel was IMPORTANCE_DEFAULT and could never interrupt; republished as `attendance_v2` (a channel's importance is frozen at creation). iOS pushes are `time-sensitive` — ⚠️ the entitlement is NATIVE and needs a build, not an OTA.
- Test data `prisma/seed-shift-test.ts`; end-to-end audit `tools/clock-audit.py` (39 checks over real HTTP).

### Recently Completed (2026-09-06) — A document type says who may see it

**PROD `5ff66b2e`** (rollback tag `prod-pre-doc-visibility` → `5b902360`). Migration `20260906120000_document_type_visibility`; backup `pre-doc-visibility_20260906_134538.sql.gz`. Detail in memory `document-type-visibility`.

- `canViewMemberDocuments` was ONE switch for the whole filing cabinet — the clerk chasing driving licences also read the payroll. `DocumentType.visibleToRoleIds` now names the roles that see it (Step 6 "Who can see it" on the type).
- ⚠️ **EMPTY MEANS NO RESTRICTION**, not "nobody". The opposite default empties every register in every organization on the day it deploys. Prod after deploy: 6 types, 0 restricted — nothing changed for anyone.
- ⚠️ **Three exemptions, all load-bearing.** The **subject** (their own file stays whole, and the catalogue keeps what is still required OF them, or restricting a type leaves somebody unable to hand in their own passport while a screen chases them for it); a **routed signer** (being asked to sign IS the authorisation to read that one document — a shift leader countersigning a time sheet is not in HR); **administrators**.
- ⚠️ **404, not 403.** A 403 confirms a payslip exists for that person on that date.
- ⚠️ Two silent holes found wiring it: `listIssued` built its `where` without the scope, so the **tab counts** would have counted documents the reader cannot open; and the type check ran BEFORE the chain was known on the two signing reads, 404-ing routed signers out of documents they were asked to sign.
- ⚠️ **`memberRoleId` must be on all THREE request-context builders AND in validateToken's explicit `select`** — missing from the select is null, which makes restricted types invisible to the very people granted them.
- **Live without a refresh**: the 3 type write paths announce `document_types_changed` → org room → 10 document query keys invalidate.
- `document-scope-guard.spec.ts` reads the service and fails if a new document read is added without scoping, asserting, or being a **named** exemption with a reason (proved by planting one).

### Recently Completed (2026-09-06, later) — Options & Modules enforced end to end

**PROD `5b902360`** (rollback tags `prod-pre-option-surfaces`, `prod-pre-module-gates`, `prod-pre-attendance-break`). No migrations. Detail in memory `gating-options-modules`.

> Something switched off must disappear in THREE places: the server refuses the write, the page refuses to render, and **the way in goes**. Two audits, mirror images: **Options were enforced and not hidden; Modules were hidden and not enforced.**

- ⚠️ **The navbar decided every item on PERMISSIONS ALONE** — no item consulted what the org had bought, so Invoices, Overtime and Schedule stayed put with the Option off. One table now (`option-surfaces.ts`), read by the navbar, the workspace tabs and the settings list, with a test walking each table against its source.
- ⚠️ **Workflows was the worst**: the tab was `show: true`, the builder opened, and the 402 arrived at the SAVE. Gated at the tab, the tab body (`?tab=workflow`) and `allowCreate` on the space form. Choosing an existing workflow stays free — building one is what was bought.
- ⚠️ **An Option change took up to a minute to appear, through a hard refresh** — `orgAddOns` rides on the gateway's Redis-cached user. `AuthTokenCache` indexes sessions **by organization** now; both add-on write paths call `invalidateOrganization`.
- ⚠️ **Six modules had NO server gate**: assets, tracking, time_tracking, attachments, checklists, subtasks. `time_tracking` is on **clock-IN only** (clock-out must never strand an open shift), and the task features are gated on their **own** routes — all eight — which is what makes them refusable without refusing the task.
- ⚠️ **Never pass a module key to `hasPlanFeature`/`PlanGate`.** It opens with `if (!isAddOn(key)) return false`, so it answers NO for everybody **including buyers** — custom fields were invisible in the New Task dialog on exactly this. A test now scans for it.
- ⚠️ **Production was counted before every gate.** Zero assets/attachments/subtasks/story points; every space with clock-ins already had time_tracking. Nothing in use lost access — do this every time.
- **Attendance**: Add wrote `breakMinutes` and no rows while Edit lists rows, so a rest was invisible AND was destroyed by the first edit that touched breaks (they are recomputed from the rows). One `BreakFields` in both dialogs now; a break is a row everywhere.
- **Login**: two skeletons were wrong — the dashboard one flashed before login (now `BootScreen`), and `AuthSkeleton` drew the PREVIOUS login design while the page is a full-bleed two-panel layout.

### Recently Completed (2026-09-06) — CRM contact people, workspace fixes, two stale gates

**PROD `78b6afeb`** (rollback tags `prod-pre-crm-contacts` → `5de81f3d`, `prod-pre-ws-move` → `e6bb984f`). Migration `20260905180000_customer_contacts`. Detail in memory `crm-contact-people`.

- **Contact people** — a person RECORD linked to a company, with a role and a primary, readable from both ends. See the endpoint table above for the two warnings that matter.
- ⚠️ **A new client could land in no workspace at all.** Adding from `/clients` on the **All** tab wrote `spaceId = NULL` — invisible in every workspace tab and outside the per-space CRM. The form asks now, and **edit shows it** so an orphan can be filed. `assertRefsInOrg` already validated the org; what it missed was an ARCHIVED space (now refused) and moving an app user out from under their portal.
- ⚠️ **An asset has no `spaceId`** — it inherits its KIND's (`AssetCategory.spaceId`). Moving one between workspaces is a change of kind, and fields the destination does not ask for are **deleted** (`keepFieldsForKind`).
- ⚠️ **The Apartment portal entity demanded an `apartments` module that no longer exists** — apartments moved into ASSETS, so the gate could never pass and its error named a module nobody can switch on. A gate that outlives the thing it gates fails permanently, not open. The UI meanwhile passed `hasApartments` as a hard-coded `true`, so the option was offered and the server always refused it.
- ⚠️ **A company's Addresses panel read "Workspaces"** because it fetched the SPACE's portal for any client in a space that ran one and borrowed its `entityLabel` — a client inheriting the vocabulary of a product it has nothing to do with, in a word this product already uses for the space. Now only for an actual resident.
- ⚠️ **`GenericContentSkeleton` drew a DASHBOARD.** Every route that is not tasks/dashboard falls back to it, so CRM, assets, portals and members all flashed a stat grid on reload. Now neutral. `RouteSkeleton` must NOT predict a module-gated route's layout while `user` is null — those routes may not exist for the account.

### Recently Completed (2026-09-05) — Agreed price, the org off switch, clock-in choice

**PROD `307e4743`** (day started `9881ac10`). Rollback tags `prod-pre-amount`, `prod-pre-deactivate`, `prod-pre-agreed-price`, `prod-pre-clock-picker`, `prod-pre-clock-dry`. Migration `20260905120000_agreed_price`; backup `pre-agreed-price_20260905_010323.sql.gz`. Detail in memory `agreed-price-billing` and `web-gps-clock-in`.

- **An invoice line says €77.00, not "7700 × €0.01".** The aggregate lines carried their amount in the QUANTITY against a one-cent price — arithmetically right, meaningless to the payer. They now carry an exact `amountCents` at quantity 1 through an ad-hoc price under the product their lookup key already names. ⚠️ **The subscription diff matches by PRODUCT now, not price id** — an ad-hoc price changes with the amount, so diffing on it would delete and re-add the line every time. Seats keep a real count: "2 × €9.99" is the one line where multiplying means something.
- **Agreed price** — see Phase 8. Operator-set fixed monthly amount replacing the computed bill.
- **The organization off switch actually switches them off** — see Phase 8.
- **A member chooses which workspace they clock in at.** Both web surfaces silently picked the NEAREST site. ⚠️ The first cut of the list also excluded CUSTOMER spaces, which hid two of three workspaces from a member who works across all of them — a list must never be stricter than the check it mirrors. New `GET /attendance/clock-in-locations` (above), a picker that opens only when there is a choice, and ⚠️ **`useClockIn` — the navbar widget and the shift page were full copies and drifted**, which is why the picker existed on one and not the other. A test fails if `attendanceApi.clockIn/clockOut` is called outside the hook.

### Recently Completed (2026-09-04) — External members, billing modes, billing alerts

**PROD `f72d766e`** (rollback chain from `4b96142b`; 34 commits, 13 deploys, 5 migrations, DB backups `pre-billing-mode_*` and `pre-billing-alerts_*`). Full detail in memory `deploy-20260904-external-billing`.

- **Two kinds of external member.** `external-supervisor` (approves hours, follows the work) and the new `external-observer` (watches, can raise a job — `canViewAllTasks` + `canCreateTasks`, no hours at all, **€2 seat**). ⚠️ Built-in roles **self-seed on the next `listAccessRoles`**, so adding one needs no migration.
- ⚠️ **An external invitation carries a SPACE role** now (`Invitation.memberRoleId`, validated `scope: 'SPACE'`); unset falls back to `defaultSpaceRoleId`. Before this an external invite granted NO role, so the member arrived able to sign in and see nothing — correct on every screen and impossible to diagnose.
- ⚠️ **`@DenyExternal()`** — a global guard for the organization's own property (assets, asset categories/types, customers, portal admin). `GET /assets` was `@RequirePermissionInSpace('canViewAllTasks')`, a permission an external supervisor legitimately holds, so **one permission was doing duty for two different things** and an outsider could list the org's equipment. A permission ceiling cannot fix that — the relationship disqualifies them, so the rule is stated about the relationship.
- **`canViewAllTasks` held in a space now means that space** — 10 read routes (employees ×7, space-units ×3, locations modules, recurring). Pattern every time: widen the guard to `@RequirePermissionInSpace` → forward `spacesGranting(...)` → **narrow in the SERVICE**, which is the actual boundary. Three states: `undefined` = org-wide, `[ids]` = narrow, `[]` = **matches nothing**. Shared `assertMemberInScope` / `memberScopeFilter`.
- **Asset WRITES moved to `canManageAssets`** (12 routes) — a read permission was authorising a change to the org's equipment. ⚠️ The migration grants the permission to the 8 roles that already had the ability through the old gate (excluding the external built-ins): a straight swap would have removed asset creation from every Manager and Space Manager.
- **A test walks every gateway controller** and fails if a mutation is gated on `canViewAllTasks` (`external-observer-writes.spec.ts`). Remaining exceptions are named with reasons — the agile family (sprints/epics/phases/custom-fields) has no finer permission to move to, which is a product decision about who plans rather than a security fix.
- **Invitation codes truncated at 8.** Each screen capped the field at the length IT expected, so a 10-character invitation lost two characters with no error. `JOIN_CODE_MAX_LENGTH` + `joinCodeCandidates()`; the org screen now recognises an invitation and hands it over. ⚠️ Mobile OTA: `app.config.ts` pins `version: '1.0.4'`, so a default publish targets 1.0.4 — reaching the 1.0.3 train means temporarily setting the version.
- **The default workspace could never be moved.** `isDefault` was written once at creation and the delete refusal said "make another space the default first", which nothing in the product could do. `POST /locations/:id/default`, one transaction (two defaults or none are both silent breakage), Remote and archived refused, badge on the workspaces list.
- **Assignee picker read `GET /organizations/members`** (`canManageUsers`) — a permission an external member can never hold, so the list rendered empty. It reads the space's roster when a workspace is chosen, which also removes a silent 50-member cap.
- **Billing page rebuilt** — total + proportion bar, each workspace's modules priced, **"Excludes VAT"**, and every section labelled by scope (Per person / Per workspace / Whole organization). Options pinned in their own rail because they are bought ONCE while modules are bought per space.

### Recently Completed (2026-08-21) — Module Pricing LIVE (tiers replaced)

**PROD `c393657d`** (rollback tag `prod-pre-module-billing` → `aaffbec5`; migrations `20260821180000_org_addons`, `20260821200000_billed_externally`).

The pricing model changed shape. `bill = seats × €9.99 + Σ spaces(modules + ladders) + Σ org add-ons`. See **Phase 8** above for the full model — the notes here are the ones that bite.

- ⚠️ **`plans.ts` is VESTIGIAL, not deleted.** Nothing in it decides access or price. It survives for the operator price book (C2) and Stripe sync (C3) only. **Do not add a caller.**
- ⚠️ **`orgAddOns` must be set on every request context.** Three separate places in `auth.service.ts` build one (login, refresh, portal). Missing one 402s every premium mutation on that path — the portal context was nearly left out.
- ⚠️ **Both gates fail closed on an unknown key.** The old `isFeatureEntitled` returned `true` for anything it didn't recognise, so a typo in `@RequirePlan` granted the feature to every organization, silently.
- ⚠️ **Two prices used to exist and never applied.** Both were found by grepping only one file: `GOOGLE_PLACES_API_KEY` reached the gateway via `docker-compose.override.yml`, and the MapTiler build args were passed to an image that never declared the `ARG`. **Docker drops an undeclared build arg silently.** Check both compose files and the Dockerfile.
- **The invariant that matters**: what Stripe is told, priced from the catalogue, equals the breakdown the screen renders — to the cent. Tested. It caught a real bug: annual usage priced at 1c charged a year at one month's rate.
- **Stripe sync**: `tools/stripe/sync-modules.mjs` only ever CREATES — never edits or archives, because prices are immutable and customers subscribe to them. A price disagreeing with the code is reported as MISMATCH. Run it inside the auth container with `--catalog <dumped json>` (the container bundles shared and has no `dist/`).
- **Pricing curve is regressive** and was accepted as-is: solo ~3× the old entry price, 30-person 40% cheaper, because module prices are flat regardless of company size (88% of a solo bill, 11% of a large one). Raising the SEAT fixes the top without touching the bottom. Revisit if the top end looks underpriced.

### Recently Completed (2026-08-21) — Geo Stack Cutover LIVE

**PROD `540f0f7e`** (rollback tag `prod-pre-geo-cutover` → `01542695`, 16 migrations, DB backup `pre-geo-cutover_20260821_112025.sql.gz`).

- **Map tiles are configuration.** `apps/web-app/src/lib/map-tiles.ts` reads `NEXT_PUBLIC_MAP_TILE_URL` / `_ATTRIBUTION`, replacing the OSM URL that was typed into four files with attribution switched off — attribution is an ODbL licence condition, and OSM's Tile Usage Policy does not permit commercial volume against their servers. Production now serves MapTiler, origin-locked to `hbcfield.com`.
- ⚠️ **An undeclared Docker `ARG` is dropped silently.** Compose passed the tile variables to an image whose Dockerfile never declared them, so `next build` inlined the OSM fallback and the paid key was never used — with no warning anywhere. Any new `NEXT_PUBLIC_*` build arg must be added to **both** `docker-compose.yml` and `apps/web-app/Dockerfile` (`ARG` **and** `ENV`).
- **Google serves both halves of geocoding.** Places API = search, Geocoding API = reverse; they are separate products and both must be enabled on the key. `/geo/reverse` now tries Google first, Photon second.
- **`PHOTON_URL` is opt-in** — the hard-coded `http://photon:2322` default is gone. Unset means Google only. Photon still runs as a fallback pending removal (~150 GB).
- **The gateway states its geocoders at boot**: `docker logs hbcfield-api-gateway | grep GeoModule` → `Geocoding: google=on photon=on`, and errors outright when none is configured. Every misconfiguration in this area otherwise fails the same silent way.
- **No public geocoder is called from a browser or phone.** Nominatim and Photon's public host were being fetched client-side, sending customer IPs and typed addresses to services with no agreement, at rates their policies forbid. The route optimizer's public OSRM demo host is likewise opt-in now.
- `ACCESS_IGNORE_LEGACY_FLAGS` and `GOOGLE_PLACES_API_KEY` are in the tracked compose (both previously existed only on the production box or in `docker-compose.override.yml`).
- ⚠️ **`pg_dump` on this stack is `-U doergo doergo`** — not `postgres`/`hbcfield`, which fails into a valid, empty 20-byte gzip. Assert the table count, never the exit code.

### Recently Completed (2026-07-13) — SaaS Billing LIVE on Stripe ⚠️ SUPERSEDED

> ⚠️ **The tier model described below was replaced on 2026-08-21.** Kept for the Stripe account setup, tax configuration and prod wiring, which all still apply. Everything about tiers, office/field seats and `tierAllows` is history.
- **Stripe billing switched TEST → LIVE in production** (hbcfield.com). No code change to go live — the app was already live-ready; go-live was Stripe-dashboard + prod-env config (done via Chrome + Stripe API).
- **Plans / pricing** (`packages/shared/src/billing/plans.ts`, `seats.ts`): per-seat model, NOT bundles. **Office seat** = anyone with web access incl. the admin owner, priced by tier (**Starter €29 / Professional €59 / Business €99** per month; ×10 annual). **Field seat** = mobile-only member, flat **€19/mo** (€190/yr). Seat type is derived from ACCESS (`classifySeat`/`countSeats`), so it re-syncs whenever a member's Access Profile flips web↔mobile.
- **Seat changes & proration** (`billing.service.ts reconcileSeats` → `stripe.service.ts setSubscriptionQuantities`): `invoiceNow = interval === 'annual' && newTotal > oldTotal`.
  - **Monthly** add/remove → `create_prorations` (banked onto next invoice, no immediate charge). Verified live: 1→11 office +5 field mid-cycle → next invoice = new €744/mo + prorated catch-up.
  - **Annual INCREASE** → `always_invoice` (charged immediately, prorated for the rest of the year — anti-abuse so seats aren't free until renewal). Verified live via test-clock. Annual DECREASE → banked credit.
  - Seat syncs are debounced per-org (one proration event per burst).
- **Feature gating** (`billing-plan-gating`): `tierAllows()` entitlement ceiling; global `PlanGuard` returns **402** (not 403) on under-tier mutations, **reads pass**; `ModuleGuard` gates task modules. Tier map: Starter = subtasks/checklists/attachments/tracking/time_tracking/**service_reports**; Pro+ = custom_fields/dependencies + recurring/overtime/invoicing; Business+ = sprints/story_points/epics/phases + workflows/audit_log/multi_org.
- **Checkout** (`stripe.service.ts createCheckoutSession`): hosted Checkout, `automatic_tax` env-gated, `allow_promotion_codes`, **`tax_id_collection` ON** (UID at checkout → cross-border EU B2B reverse-charged to 0%; domestic AT stays 20%), `customer_update: address/name auto` (required to persist the collected address/UID onto the existing customer). Webhook `POST /api/v1/billing/webhooks/stripe` (HMAC + rawBody + idempotency) handles 6 events (checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed).
- **Stripe live setup** (account `acct_1QtRRrA3luQe6reB`, HBC GmbH, AT/EUR — **SHARED with an "8bc store" project**, so a dedicated "HBCField" `sk_live` key was made + tax/email toggles are account-wide): 4 products / 8 prices; live webhook `we_...`; **Stripe Tax active** (head office AT, `tax_behavior=exclusive` VAT-on-top, tax_code `txcd_10103001` SaaS-business, AT registration → 20%); Customer Portal default config (cancel at_period_end, VAT-ID capture); customer emails ON (receipt + dunning). ⚠️ Products/prices need a `tax_code` before `STRIPE_AUTOMATIC_TAX=true` or checkout errors.
- **Prod wiring**: `docker-compose.override.yml` injects the 11 `STRIPE_` vars into auth-service (compose uses explicit `environment:`, not `env_file`); secrets live in `/opt/doergo/infra/docker/.env.production`. Trial-expiry: hourly `@Cron` `expireTrials()` locks no-card trials past `trialEndsAt`. **Grandfather note**: new prod DBs must backfill `planTier IS NULL` orgs or PlanGuard 402s premium. Full detail in memory `billing-went-live` / `billing-deployed-prod` / `billing-plan-gating`.

### Recently Completed (2026-06-18)
- **Background GPS Route Tracking** (Phase 5):
  - Fixed "straight line between start and end" — root cause was mobile capture (foreground-only `setInterval` stopped when the app backgrounded); backend already stored every point and the web map already road-snapped them
  - Mobile: new `background-route-tracking.ts` — `expo-location` + `TaskManager` background task records the exact path even when the phone is locked
  - Battery-aware: distance-based sampling (25m), deferred/batched delivery (12s), foreground service; active task id in SecureStore
  - `useLocationTracking.ts` rewritten as thin controller over the background task (same public interface)
  - New batch endpoint `POST /tracking/location/batch` (`update_location_batch` → `LocationService.updateLocationBatch`) — one transaction per burst
  - Graceful per-point fallback (`flushPoints`) when the batch endpoint is absent (404) or fails
  - ⚠️ Needs an EAS dev/prod build (not Expo Go) + "Always allow" location; tracking-service + gateway must be redeployed for the batch endpoint

### Recently Completed (2026-04-02)
- **Task Attachments** (Phase 4):
  - S3 presigned URL upload via Hetzner Object Storage (Helsinki)
  - AttachmentsService: presigned URL generation, org authorization, file validation (20MB, images + documents)
  - BullMQ processor: ADD_ATTACHMENT, DELETE_ATTACHMENT, GET_PRESIGNED_URL; GET_ATTACHMENTS via direct microservice
  - Gateway: 4 new endpoints (presign, confirm, list, delete) on `/tasks/:id/attachments`
  - Web: AttachmentsSection component with drag-and-drop dropzone, image thumbnails, file cards, upload progress, delete confirmation
  - Mobile: camera + gallery upload via existing useImagePicker hook, attachment list with long-press delete
  - S3 deletion on attachment removal (graceful fallback on failure)

### Previously Completed (2026-02-11)
- **Schedule & Members Web UI** (Phase 3.7):
  - Refactored technician detail page: extracted 5 inline tabs into `_components/` directory
  - New Schedule tab: weekly schedule editor with read/edit modes, time inputs, active toggles
  - New Time-Off tab: request management with date range picker, approve/reject/cancel, status filters
  - Members backend: 3 new methods in auth-service (list, update role, remove) with safety guards
  - 3 new gateway endpoints on `/organizations/members`
  - Members page (`/members`): full members list with role editing, permission management, remove flow
  - Sidebar: added Members + Schedule for ADMIN, Members for DISPATCHER

### Previously Completed (2026-02-10)
- **Dynamic Mobile Onboarding** (Phase 3.6):
  - Decoupled account creation from organization membership
  - Post-registration onboarding wizard with 3 paths: Create Org, Join by Code, Use Invitation
  - `JoinRequest` model with admin approval workflow (PENDING/APPROVED/REJECTED/CANCELED)
  - `OnboardingCompleteGuard` (4th global guard) blocks non-onboarded users from regular endpoints
  - `OnboardingModule` in auth-service with 12 MessagePattern handlers
  - 3 new gateway modules: Onboarding (6 endpoints), JoinRequests (3 endpoints), Organizations (3 endpoints)
  - Mobile: simplified registration (no company name), 3-way nav guard, 5 onboarding screens
  - Web: Join Requests page, Organization Settings page, sidebar nav item
  - Push notifications for join request lifecycle events
  - Seed data: org join code `ACME2026`, orphan user `newuser@example.com`, pending join request

### Previously Completed (2026-02-04)
- **WorkMode Decoupling** (Phase 3.5):
  - `WorkMode` enum (ON_SITE, ON_ROAD, HYBRID) decouples work location from billing type
  - `TechnicianType` now billing-only (FREELANCER = covers own expenses, FULL_TIME = company covers)
  - Backend gates changed: attendance/locations check `workMode` instead of `technicianType`
  - Mobile tab visibility: ON_ROAD=Tasks, ON_SITE=Clock, HYBRID=both
  - Web: WorkMode filter/badge on technicians list, select on create forms
  - Migration with data migration: FULL_TIME→ON_SITE, FREELANCER→ON_ROAD

- **Invitation System** (Phase 3.4):
  - Code-based invitation flow (SHA-256 hashed, 6-8 char alphanumeric codes)
  - `Invitation` model with status tracking (PENDING→ACCEPTED/EXPIRED/REVOKED)
  - Full REST API: create, list, validate (public), accept (public), revoke
  - Rate limiting: 10/min create/validate, 5/min accept
  - Supports pre-assigning role, technicianType, workMode, specialty, maxDailyJobs
  - Web: Invitations management page with create dialog
  - Mobile: Registration screen with invitation code input

### Previously Completed (2026-01-30)
- **Push Notifications** (Phase 6 - Push):
  - `UserPushToken` model for storing Expo push tokens per device
  - Push service using `expo-server-sdk` for Expo Push API
  - Gateway endpoints for token registration and removal
  - Push notifications for task events (assigned, status changed, comments)
  - Push notifications for attendance events (clock in/out reminders)
  - Mobile: `usePushNotifications` hook with Android channels
  - Mobile: Notification tap navigates to task detail
  - Mobile: Token cleanup on logout

- **Availability Calendar** (Phase 7.2):
  - `TechnicianSchedule` model for weekly work schedules (day/start/end times)
  - `TimeOff` model with approval workflow (PENDING → APPROVED/REJECTED)
  - Schedule CRUD endpoints for setting/getting weekly schedules
  - Time-off request, approval, and cancellation endpoints
  - Availability query combining schedule + time-off + current tasks
  - Web: Availability calendar updated to use real API data
  - Week and month views with technician availability status

- **Technician Management System** (Phase 3.3):
  - Gateway technicians module with full REST API (9 endpoints)
  - Shared types: `TechnicianProfile`, `TechnicianListItem`, `TechnicianStats`, `PerformanceMetrics`
  - Shared helpers: `getTechnicianTypeLabel()`, `isTechnicianOnline()`, `getAvailabilityStatus()`
  - Web: Technicians list page with search, filters, pagination
  - Web: Create technician page with auto-password generation
  - Web: Technician detail page with 5 tabs (Overview, Tasks, Attendance, Locations, Performance)
  - Web: Availability calendar with week/month views
  - Permission update: DISPATCHER can now create/edit/deactivate technicians
  - Max-width container styling applied to all technician pages

### Previously Completed (2026-01-27)
- **DRY/SOLID Refactoring**:
  - Created shared attendance types (`packages/shared/src/types/attendance.ts`)
    - Centralized TimeEntry, Break, CompanyLocation, AttendanceStatus interfaces
    - Added helper functions: `isBreakActive()`, `getBreakTypeLabel()`, `getTimeEntryStatusLabel()`
  - Created date utilities (`packages/shared/src/utils/date.ts`)
    - Date boundary: `getStartOfDay()`, `getEndOfDay()`
    - Prisma filters: `buildDateRangeFilter()`, `buildSingleDayFilter()`
    - Period calculations: `getStartOfWeek/Month()`, `getEndOfWeek/Month()`
    - Display formatting: `formatDuration()`, `formatTime()`, `formatShortDate()`, `formatFullDate()`
  - Created query string builder (`packages/shared/src/utils/query.ts`)
    - `buildQueryString()` - Filters null/undefined values automatically
    - `buildUrlWithQuery()` - Builds complete URLs with query parameters
  - Updated mobile app to import from `@hbcfield/shared` (removed ~95 lines of duplicate types)
  - Updated web app to import from `@hbcfield/shared` (removed ~70 lines of duplicate types)
  - Replaced 10+ manual `URLSearchParams` builders with `buildUrlWithQuery()`
  - Replaced hard-coded status strings with enums in `attendance.service.ts`:
    - `'CLOCKED_IN'` → `TimeEntryStatus.CLOCKED_IN`
    - `'PENDING'` → `ApprovalStatus.PENDING`, etc.
  - Extracted 8+ manual date range calculations to use shared utilities
  - **Deferred**: Split 1729-line attendance service (requires significant refactoring)

### Previously Completed (2026-01-26)
- **Attendance Foundation** (Phase 7.1):
  - TechnicianType enum (FREELANCER, FULL_TIME) for employee classification
  - CompanyLocation model with geofencing support (lat/lng, radius)
  - Locations CRUD API endpoints (POST/GET/PATCH/DELETE /locations)
  - Locations module in task-service and gateway
  - Shared constants: ATTENDANCE_CONSTANTS, LOCATION_JOB_TYPES
  - Seed data: 3 sample company locations (Main Office, Warehouse, Service Center)

- **Role System Overhaul** (Phase 3.2 - 2026-01-26):
  - New ADMIN role replacing deprecated CLIENT role
  - Platform enum (WEB, MOBILE, BOTH) for access restriction
  - Granular permission fields: canCreateTasks, canViewAllTasks, canAssignTasks, canManageUsers
  - Database migrations for schema changes and data migration
  - Backward compatibility layer (LegacyRoleMap, normalizeRole)
  - Permission helper functions in @hbcfield/shared/guards
  - Updated all controller @Roles decorators
  - Registration now forces ADMIN role (security improvement)

### Previously Completed (2026-01-22)
- **ServiceReport Feature** (Phase 3.1):
  - Database: ServiceReport, ReportAttachment, PartUsed models
  - Backend: Reports module in task-service (BullMQ) and gateway (REST)
  - Web: ServiceReportSection component with photos, parts table, signatures
  - Mobile: Completion modal with summary/details inputs and duration display
  - Seed: 4 sample reports with parts and before/after photos

### Previously Completed (2026-01-21)
- Task detail page UI enhancements (60/40 layout, activity timeline, premium comments)
- Route tracking feature (LocationHistory, distance calculation, route visualization)
- Socket.IO monitoring (Admin UI, stats endpoints, enhanced logging)

---

## 18. SECURITY FEATURES IMPLEMENTED

| Feature | Implementation |
|---------|---------------|
| Rate Limiting | `@nestjs/throttler` - 3/sec, 20/10sec, 100/min |
| Account Lockout | 5 failed attempts = 15 min lockout |
| Password Hashing | bcrypt with cost factor 12 |
| Token Security | SHA-256 hashed refresh tokens in DB |
| Token Refresh Grace Period | 60-second grace period for concurrent refresh requests |
| Concurrent Request Handling | Atomic token claiming + wait loop for cached tokens |
| Configurable Token Expiration | Via `.env` (JWT_ACCESS_EXPIRATION, JWT_REFRESH_EXPIRATION) |
| Password Reset Tokens | SHA-256 hashed, 1-hour expiry, one-time use |
| Security Headers | Helmet.js middleware |
| Input Validation | class-validator (backend) + Zod (frontend) |
| Role Injection | Blocked - role always set server-side |
| Global Exception Filter | Consistent error responses, no stack trace leak |
| Swagger | Disabled in production |
| IDOR Protection | Authorization checks on `/users/:id` endpoint |
| JWT None-Algorithm | Protected - rejects unsigned tokens |
| CORS | Whitelisted origins only (no wildcard) |
| SQL Injection | Protected via Prisma ORM + input validation |
| XSS Prevention | Input validation + sanitization |
| NoSQL Injection | Protected - no raw queries |
| Command Injection | Protected - no shell execution |
| Path Traversal | Protected - no file path handling |
| Mobile Token Storage | expo-secure-store (encrypted) |
| Email Enumeration | Protected - forgot-password always returns success |

### Security Audit (2026-01-15) - 17 Vulnerabilities Found

**Full report:** `SECURITY_AUDIT_REPORT.md`

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 5 | ✅ All Fixed (2026-01-16) |
| HIGH | 6 | 2 remaining (HttpOnly cookies, JTI blacklist) |
| MEDIUM | 4 | Fix within 30 days |
| LOW | 2 | Fix as resources allow |

**Critical Issues - ALL FIXED (2026-01-16):**
1. ✅ Added @Roles decorators to all task endpoints (`tasks.controller.ts`)
2. ✅ Fixed IDOR on tracking endpoints - DISPATCHER-only with org scoping
3. ✅ Removed JWT secret fallback - app fails fast if not configured (`app.module.ts`)
4. ✅ Removed password reset token from log output (`auth.service.ts`)
5. ✅ Generated strong 128-char hex secrets for all .env files

**What's Working Well:**
| Test Category | Result |
|---------------|--------|
| Password Hashing | ✅ STRONG (bcrypt cost 12) |
| Refresh Token Security | ✅ STRONG (SHA-256 hashed) |
| Account Lockout | ✅ STRONG (5 attempts = 15 min) |
| Rate Limiting | ✅ STRONG (3-tier throttling) |
| Token Rotation | ✅ STRONG (refresh invalidation) |
| Input Validation (Auth) | ✅ STRONG (class-validator + Zod) |
| Email Enumeration | ✅ PROTECTED |
| SQL Injection | ✅ PROTECTED (Prisma ORM) |

---

## 19. DESIGN SYSTEM

### Brand Identity
| Element | Value | Notes |
|---------|-------|-------|
| Name | HBCField | "Doer" + "go" - action-oriented |
| Logo | Wordmark with gear icon | Gear represents work/execution |
| Tagline | Field Service Management | Task management & execution platform |

### Color Palette

#### Primary Colors
| Color | Hex | Tailwind | CSS Variable | Usage |
|-------|-----|----------|--------------|-------|
| Primary | `#2563EB` | `blue-600` | `--brand-600` | Buttons, links, active states, logo accent |
| Primary Hover | `#1D4ED8` | `blue-700` | `--brand-700` | Button hover states |
| Primary Light | `#DBEAFE` | `blue-100` | `--brand-100` | Backgrounds, badges |

#### Neutral Colors
| Color | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| Text Primary | `#1e293b` | `slate-800` | Headings, important text |
| Text Secondary | `#64748b` | `slate-500` | Body text, descriptions |
| Text Muted | `#94a3b8` | `slate-400` | Placeholders, disabled |
| Background | `#f8fafc` | `slate-50` | Page backgrounds |
| Surface | `#ffffff` | `white` | Cards, modals |
| Border | `#e2e8f0` | `slate-200` | Dividers, borders |

#### Semantic Colors
| Color | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| Success | `#16A34A` | `green-600` | Success states, completed |
| Warning | `#CA8A04` | `yellow-600` | Warnings, pending |
| Error | `#DC2626` | `red-600` | Errors, destructive |
| Info | `#2563EB` | `blue-600` | Information, links |

### Typography

#### Font Stack
```css
font-family: Inter, system-ui, -apple-system, sans-serif;
```

#### Scale
| Size | Class | Usage |
|------|-------|-------|
| xs | `text-xs` (12px) | Labels, badges |
| sm | `text-sm` (14px) | Body text, inputs |
| base | `text-base` (16px) | Default body |
| lg | `text-lg` (18px) | Subheadings |
| xl | `text-xl` (20px) | Section titles |
| 2xl | `text-2xl` (24px) | Page titles |

### Spacing System
Uses Tailwind default 4px grid: `1` = 4px, `2` = 8px, `4` = 16px, `6` = 24px, `8` = 32px

### Components

#### Shared Components (`@hbcfield/shared/components`)
```typescript
// AnimatedLogo - Full wordmark with gear icon
import { AnimatedLogo } from '@hbcfield/shared/components';

<AnimatedLogo />                           // Default: dark text, blue accent
<AnimatedLogo variant="light" />           // White text for dark backgrounds
<AnimatedLogo size="large" />              // Sizes: small (h-8), default (h-10), large (h-14)
<AnimatedLogo primaryColor="#custom" />    // Custom accent color
```

#### UI Components (`web-app/src/components/ui/`)
Built with shadcn/ui + Radix primitives:
- `Button` - Primary, secondary, outline, ghost, destructive variants
- `Card` - Container with header, content, footer
- `Input` - Form inputs with validation states
- `Label` - Form labels
- `Checkbox` - Checkboxes with indeterminate state
- `Dialog` - Modal dialogs
- `DropdownMenu` - Dropdown menus
- `Select` - Select inputs
- `Separator` - Visual dividers
- `Sidebar` - Collapsible navigation sidebar
- `Tabs` - Tab navigation
- `Toast` - Toast notifications (Sonner)
- `Tooltip` - Hover tooltips
- `Spinner` - Loading indicators
- `Skeleton` - Loading placeholders

### Status Badges
| Status | Color | Background |
|--------|-------|------------|
| DRAFT | `slate-600` | `slate-100` |
| NEW | `blue-600` | `blue-100` |
| ASSIGNED | `purple-600` | `purple-100` |
| IN_PROGRESS | `amber-600` | `amber-100` |
| BLOCKED | `red-600` | `red-100` |
| COMPLETED | `green-600` | `green-100` |
| CANCELED | `slate-500` | `slate-100` |
| CLOSED | `slate-400` | `slate-50` |

### Priority Badges
| Priority | Color | Icon |
|----------|-------|------|
| LOW | `slate-500` | `ArrowDown` |
| MEDIUM | `blue-500` | `Minus` |
| HIGH | `orange-500` | `ArrowUp` |
| URGENT | `red-600` | `AlertTriangle` |

### Role-Based UI

#### ADMIN View (Web)
- Dashboard: Task stats (Total, In Progress, Completed, Pending)
- Navigation: Dashboard, My Tasks, Create Task, Invoices
- Actions: Create tasks, view all org tasks, assign technicians, manage users, add comments
- Platform: WEB and MOBILE (BOTH)

#### DISPATCHER View (Web)
- Dashboard: Operations stats (Active Tasks, Technicians Online, Completed Today, Pending Assignment)
- Navigation: Dashboard, All Tasks, Technicians, Live Map, Managed Orgs
- Actions: Assign technicians, view all tasks, track locations
- Platform: WEB only

#### TECHNICIAN View (Mobile Only)
- Tabs: Home, Tasks*, Clock*, Time Off, Profile (*visibility based on WorkMode)
  - ON_ROAD: Tasks only (no Clock)
  - ON_SITE: Clock only (no Tasks)
  - HYBRID: Both Tasks + Clock
- Actions: Start/block/complete tasks, add photos, update location, clock in/out
- Platform: MOBILE only

### Animation Guidelines
- Transitions: 200-300ms duration, ease-out timing
- Hover states: Scale 1.02 for interactive elements
- Loading: Pulse animation for skeletons
- Toast: Slide in from top-right

---

*This document should be read at the start of every session. Update section 12 (Implementation Status) and section 17 (Next Tasks) as work progresses.*
