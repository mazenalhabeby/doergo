# HBCFIELD - Project Reference Document
> **Purpose**: Single source of truth for AI assistants. Read this first before any task.
> **Last Updated**: 2026-06-18 (Background GPS route tracking)

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
Organization { id, name, isActive, grantedAccess[], receivedAccess[], companyLocations[] }
OrganizationAccess { id, grantorOrgId, granteeOrgId, accessLevel, canViewTasks, canAssignWorkers, canViewWorkers, canViewTracking }
User { id, email, passwordHash, firstName, lastName, role, organizationId, failedLoginAttempts, lockedUntil, platform, canCreateTasks, canViewAllTasks, canAssignTasks, canManageUsers, technicianType, workMode }
RefreshToken { id, tokenHash, expiresAt, userId, usedAt, replacedByTokenHash, cachedAccessToken, cachedRefreshToken }
PasswordResetToken { id, tokenHash, expiresAt, used, userId }
Task { id, title, description, status, priority, dueDate, locationLat, locationLng, locationAddress, organizationId, createdById, assignedToId, routeStartedAt, routeEndedAt, routeDistance, assetId }
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

### Users (`/users`) - Push Tokens
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/users/push-token` | Register push notification token | ALL |
| DELETE | `/users/push-token/:token` | Remove push notification token | ALL |

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
| gateway | `apps/api/gateway/.env` | `PORT`, `JWT_SECRET`, `REDIS_*`, `CORS_ORIGINS`, `AUTH_CACHE_TTL_SECONDS` (optional, default 60 — TTL for the per-request token/user cache) |
| auth-service | `apps/api/auth-service/.env` | `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRATION`, `JWT_REFRESH_EXPIRATION`, `REDIS_*` |
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
- [x] SHA-256 hashed invitation codes (plaintext never stored)
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

**Current Sprint**: Phase 7.3 - Technician Assignment (next up)

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
