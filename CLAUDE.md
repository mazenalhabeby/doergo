# DOERGO - Project Reference Document
> **Purpose**: Single source of truth for AI assistants. Read this first before any task.
> **Last Updated**: 2026-01-30 (Push Notifications + Availability Calendar)

---

## 1. PROJECT IDENTITY

| Key | Value |
|-----|-------|
| Name | Doergo |
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
doergo/
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

Available from `@doergo/shared/guards`:

```typescript
import {
  hasRole, isAdmin, isDispatcher, isTechnician,
  canAccessPlatform, canAccessWeb, canAccessMobile,
  canCreateTasks, canViewAllTasks, canAssignTasks, canManageUsers
} from '@doergo/shared';

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
User { id, email, passwordHash, firstName, lastName, role, organizationId, failedLoginAttempts, lockedUntil, platform, canCreateTasks, canViewAllTasks, canAssignTasks, canManageUsers, technicianType }
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
```

### Enums
```typescript
Role: ADMIN | DISPATCHER | TECHNICIAN  // Note: CLIENT deprecated, maps to ADMIN
Platform: WEB | MOBILE | BOTH
TechnicianType: FREELANCER | FULL_TIME  // For attendance tracking
AccessLevel: NONE | TASKS_ONLY | TASKS_ASSIGN | FULL
TaskStatus: DRAFT | NEW | ASSIGNED | ACCEPTED | EN_ROUTE | ARRIVED | IN_PROGRESS | BLOCKED | COMPLETED | CANCELED | CLOSED
TaskPriority: LOW | MEDIUM | HIGH | URGENT
TaskEventType: CREATED | UPDATED | ASSIGNED | UNASSIGNED | STATUS_CHANGED | COMMENT_ADDED | ATTACHMENT_ADDED | ATTACHMENT_REMOVED
AttachmentType: IMAGE | DOCUMENT | OTHER
ReportAttachmentType: BEFORE | AFTER
TimeOffStatus: PENDING | APPROVED | REJECTED | CANCELED
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

### Tracking (`/tracking`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/tracking/location` | Update technician location (stores history if EN_ROUTE) | TECHNICIAN |
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

### Users (`/users`) - Push Tokens
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/users/push-token` | Register push notification token | ALL |
| DELETE | `/users/push-token/:token` | Remove push notification token | ALL |

**Query Parameters for GET `/technicians`:**
- `status`: `active` | `inactive` | `all` (default: `active`)
- `type`: `FULL_TIME` | `FREELANCER` | `all` (default: `all`)
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
import { createBullMQConfig, QUEUE_NAMES } from '@doergo/shared';

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
| gateway | `apps/api/gateway/.env` | `PORT`, `JWT_SECRET`, `REDIS_*`, `CORS_ORIGINS` |
| auth-service | `apps/api/auth-service/.env` | `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRATION`, `JWT_REFRESH_EXPIRATION`, `REDIS_*` |
| task-service | `apps/api/task-service/.env` | `DATABASE_URL`, `REDIS_*` |
| notification-service | `apps/api/notification-service/.env` | `REDIS_*`, `SMTP_*`, `FCM_SERVER_KEY` |
| tracking-service | `apps/api/tracking-service/.env` | `DATABASE_URL`, `REDIS_*` |
| web-app | `apps/web-app/.env.local` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL` |
| mobile | `apps/mobile/.env` | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` |

---

## 11. TEST CREDENTIALS (Seed Data)

| Role | Email | Password | Platform | Type | Permissions |
|------|-------|----------|----------|------|-------------|
| Admin | client@example.com | password123 | BOTH | - | All permissions |
| Dispatcher | dispatcher@example.com | password123 | WEB | - | canViewAllTasks, canAssignTasks |
| Technician 1 | technician1@example.com | password123 | MOBILE | FULL_TIME | None (executor only) |
| Technician 2 | technician2@example.com | password123 | MOBILE | FREELANCER | None (executor only) |

### Sample Company Locations
| Name | Address | Coordinates | Geofence |
|------|---------|-------------|----------|
| Main Office | 123 Business Ave, New York, NY | 40.7128, -74.0060 | 20m |
| Warehouse | 456 Industrial Blvd, Brooklyn, NY | 40.6892, -73.9857 | 30m |
| Service Center | 789 Tech Park, Jersey City, NJ | 40.7178, -74.0431 | 25m |

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
- [x] Shared AnimatedLogo component (`@doergo/shared/components`)
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
- [x] Permission helper functions in `@doergo/shared/guards`
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

### Phase 4: Comments & Attachments 🔲 PENDING
- [ ] Comments: list/add API (task-service) - partially done
- [ ] Attachments: S3 presigned URL upload
- [ ] Web: attachment upload dropzone
- [ ] Web: attachment gallery/list
- [ ] Mobile: camera capture for photos
- [ ] Mobile: gallery picker
- [ ] Mobile: upload progress indicator

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

**Use shared modules from `@doergo/shared`:**

```typescript
// ❌ BAD - Duplicating Redis config in each service
{
  transport: Transport.REDIS,
  options: { host: 'localhost', port: 6379 }
}

// ✅ GOOD - Use shared factory
import { createMicroserviceOptions } from '@doergo/shared';
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
| `AnimatedLogo` | Shared logo component (from `@doergo/shared/components`) |
| `Roles`, `Public`, `CurrentUser` | NestJS decorators (from `@doergo/shared`) |
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
| `TimeEntry`, `Break`, `CompanyLocation`, `AttendanceStatus` | Attendance types (from `@doergo/shared`) |
| `TimeEntryStatus`, `BreakType`, `ApprovalStatus` | Attendance enums |
| `isBreakActive()`, `getBreakTypeLabel()`, `getTimeEntryStatusLabel()` | Attendance helper functions |
| `TechnicianProfile`, `TechnicianListItem`, `TechnicianStats` | Technician types (from `@doergo/shared`) |
| `PerformanceMetrics`, `PerformanceTrendPoint` | Technician performance types |
| `getTechnicianTypeLabel()`, `getTechnicianTypeColor()` | Technician type display helpers |
| `isTechnicianOnline()` | Check if technician is online (location updated within 5 min) |
| `getAvailabilityStatus()`, `getAvailabilityLabel()`, `getAvailabilityColor()` | Availability status helpers |
| `SPECIALTY_OPTIONS` | Technician specialty options array |

### SOLID Principles

| Principle | Application |
|-----------|-------------|
| **S**ingle Responsibility | Each service handles one domain (auth, tasks, tracking) |
| **O**pen/Closed | Use decorators (`@Roles`, `@Public`) to extend behavior |
| **L**iskov Substitution | All services implement consistent interfaces |
| **I**nterface Segregation | DTOs are specific to each operation |
| **D**ependency Inversion | Inject services via constructor, use interfaces |

### Before Adding New Code

1. **Check `@doergo/shared`** - Does a utility already exist?
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
| **Redis CLI** | `docker exec -it doergo-redis redis-cli` | Redis commands |
| **RedisInsight** | Install via `brew install --cask redisinsight` | Redis GUI (optional) |

### Redis CLI Quick Commands
```bash
docker exec -it doergo-redis redis-cli
> KEYS bull:*           # List BullMQ keys
> LLEN bull:tasks:wait  # Count waiting jobs
> MONITOR               # Watch all commands (Ctrl+C to exit)
```

---

## 17. NEXT IMMEDIATE TASKS

**Current Sprint**: Phase 4 - Comments & Attachments

1. **task-service**: Implement attachment endpoints
   - File: `apps/api/task-service/src/modules/attachments/attachments.service.ts`
   - S3 presigned URL generation for upload
   - File type validation & size limits

2. **gateway**: Proxy attachment routes
   - File: `apps/api/gateway/src/modules/tasks/tasks.controller.ts`
   - POST /tasks/:id/attachments/presign
   - POST /tasks/:id/attachments (confirm upload)
   - DELETE /tasks/:id/attachments/:id

3. **web-app**: Attachment upload UI
   - File: `apps/web-app/src/app/(dashboard)/tasks/[id]/page.tsx`
   - Dropzone component for file upload
   - Gallery/list view of attachments

4. **mobile**: Camera & gallery integration
   - File: `apps/mobile/app/(app)/task/[id].tsx`
   - Camera capture using expo-camera
   - Gallery picker using expo-image-picker
   - Upload progress indicator

### Recently Completed (2026-01-30)
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
  - Updated mobile app to import from `@doergo/shared` (removed ~95 lines of duplicate types)
  - Updated web app to import from `@doergo/shared` (removed ~70 lines of duplicate types)
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
  - Permission helper functions in @doergo/shared/guards
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
| Name | Doergo | "Doer" + "go" - action-oriented |
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

#### Shared Components (`@doergo/shared/components`)
```typescript
// AnimatedLogo - Full wordmark with gear icon
import { AnimatedLogo } from '@doergo/shared/components';

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
- Tabs: Tasks, Profile
- Actions: Start/block/complete tasks, add photos, update location
- Platform: MOBILE only

### Animation Guidelines
- Transitions: 200-300ms duration, ease-out timing
- Hover states: Scale 1.02 for interactive elements
- Loading: Pulse animation for skeletons
- Toast: Slide in from top-right

---

*This document should be read at the start of every session. Update section 12 (Implementation Status) and section 17 (Next Tasks) as work progresses.*
