# DOERGO - Project Reference Document
> **Purpose**: Single source of truth for AI assistants (Cloud AI). Read this first before any task.  
> **Last Updated**: 2026-01-15 (Phase 2 Complete + SaaS Delegation Model Added)

---

## 1. PROJECT IDENTITY

| Key | Value |
|-----|-------|
| Name | Doergo |
| Domain | doergo.app |
| Type | 3-role task management & field execution platform (multi-tenant SaaS) |
| Monorepo | pnpm workspaces |
| Root | `/Users/pc/work/doergo` |

**Core Flow**: `Partner creates task` → `Office assigns worker` → `Worker executes` → `Real-time updates`

---

## 2. MULTI-TENANT SAAS MODEL (IMPORTANT - NEW)

### Goal
Doergo is a SaaS where:
- Any company = **Organization (tenant)**
- A company can be fully independent
- A company can optionally **share control/data** with a controller company (ex: “Company A controls Company B”) — but **B chooses what to share**.

### Key Concept: Delegation / Managed-By
We implement:
- `Organization.managedByOrgId` (nullable): which org manages this org
- `Organization.shareLevel` (enum): how much data the manager can see/control

### ShareLevel (Enum)
- `NONE` (default): manager sees nothing
- `TASKS_ONLY`: manager can see tasks only (no users/workers)
- `FULL`: manager can see tasks + partners + workers + tracking + users

> MVP starts with `NONE | TASKS_ONLY | FULL` only (keep it simple). Extend later if needed.

### Example Scenario
- Company A = controller org
- Company B = independent org that can choose to share
- If B wants A to control it:
  - `B.managedByOrgId = A.id`
  - `B.shareLevel = TASKS_ONLY` or `FULL`

### Ownership Rules
- Every `User` belongs to exactly one `organizationId` (tenant).
- Tasks belong to a specific org (`Task.organizationId` = the org that owns the task).
- Office users from a manager org (A) can access B’s data ONLY if:
  1) `B.managedByOrgId === A.id`
  2) `B.shareLevel` allows the requested resource.

### Access Rules (Authorization)
When OFFICE user from org A requests resources for org B:
- If `B.shareLevel = NONE`: **deny**
- If requesting tasks and `shareLevel >= TASKS_ONLY`: **allow**
- If requesting workers/users/tracking and `shareLevel = FULL`: **allow**

### Worker Control Policy (MVP)
- Workers belong to their own org.
- If A has FULL access to B, A can **view** B workers & tracking.
- (Optional future) allow A to assign B workers only if FULL.

---

## 3. ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                    │
├─────────────────┬─────────────────┬─────────────────────────────────┤
│  web-partner    │   web-office    │         mobile                  │
│  (Next.js)      │   (Next.js)     │     (React Native/Expo)         │
│  :3001          │   :3002         │                                 │
└────────┬────────┴────────┬────────┴──────────────┬──────────────────┘
         │                 │                       │
         └─────────────────┴───────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ API Gateway │ :4000/api/v1
                    │  (NestJS)   │ Swagger: /docs
                    └──────┬──────┘
                           │ Redis Transport
         ┌─────────────────┼─────────────────┬──────────────────┐
         ▼                 ▼                 ▼                  ▼
┌─────────────┐   ┌─────────────┐   ┌──────────────┐   ┌──────────────┐
│auth-service │   │task-service │   │notification- │   │tracking-     │
│             │   │             │   │service       │   │service       │
└─────────────┘   └─────────────┘   │(Socket.IO)   │   │(GPS/Maps)    │
                                    └──────────────┘   └──────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        ┌──────────┐              ┌──────────┐
        │PostgreSQL│              │  Redis   │
        │(PostGIS) │              │          │
        │  :5432   │              │  :6379   │
        └──────────┘              └──────────┘
```

---

## 4. DIRECTORY STRUCTURE

```
doergo/
├── apps/
│   ├── api/
│   │   ├── gateway/           # API Gateway - routes to microservices
│   │   │   └── src/
│   │   │       ├── main.ts    # Entry: port 4000, prefix /api/v1
│   │   │       └── modules/   # auth/, tasks/, tracking/, users/, orgs/
│   │   ├── auth-service/      # Auth microservice (main Prisma schema)
│   │   │   ├── prisma/
│   │   │   │   ├── schema.prisma  # ⭐ MAIN DATABASE SCHEMA
│   │   │   │   ├── seed.ts
│   │   │   │   └── migrations/
│   │   │   └── src/modules/auth/
│   │   ├── task-service/      # Task CRUD + assignment
│   │   ├── notification-service/  # Socket.IO + Email + Push
│   │   └── tracking-service/  # GPS location updates
│   ├── web-partner/           # Partner portal (Next.js) :3001
│   │   └── src/app/           # App Router
│   ├── web-office/            # Office portal (Next.js) :3002
│   │   └── src/app/
│   └── mobile/                # Worker app (Expo)
│       └── src/
├── packages/
│   └── shared/                # Shared types, modules, utilities
│       └── src/
│           ├── types/         # Enums, interfaces, API types
│           ├── prisma/        # Shared PrismaService & PrismaModule
│           ├── microservices/ # Redis config factories, service names
│           ├── api/           # Response helpers, error codes
│           ├── design/        # Design tokens, Tailwind preset
│           └── components/    # Shared React components (AnimatedLogo)
├── infra/
│   └── docker/
│       └── docker-compose.dev.yml
└── package.json               # Root workspace scripts
```

---

## 5. ROLES & PERMISSIONS

| Role | Platform | Can Create Tasks | Can Assign | Can Execute | Can Track Workers |
|------|----------|------------------|------------|-------------|-------------------|
| **PARTNER** | Web | ✅ Own org only | ❌ | ❌ | ❌ |
| **OFFICE** | Web | ❌ | ✅ | ❌ | ✅ (within allowed scope) |
| **WORKER** | Mobile | ❌ | ❌ | ✅ Assigned only | ❌ (is tracked) |

### SaaS Delegation Scope (NEW)
OFFICE user in org A can access org B resources only if:
- `B.managedByOrgId === A.id` and `B.shareLevel` allows it.

---

## 6. DATABASE SCHEMA (Prisma)

**Location**: `apps/api/auth-service/prisma/schema.prisma`

### Core Models (Updated)
```
Organization {
  id,
  name,
  isActive,

  // SaaS Delegation (NEW)
  managedByOrgId?      // nullable FK -> Organization.id
  shareLevel           // enum: NONE | TASKS_ONLY | FULL
}

User { id, email, passwordHash, firstName, lastName, role, organizationId }

RefreshToken { id, token, expiresAt, userId }

Task {
  id, title, description, status, priority, dueDate,
  locationLat, locationLng, locationAddress,
  organizationId, createdById, assignedToId
}

Comment { id, content, taskId, userId }
Attachment { id, fileName, fileUrl, fileType, fileSize, taskId, uploadedById }
TaskEvent { id, eventType, metadata, taskId, userId }
WorkerLastLocation { id, lat, lng, accuracy, userId }
```

### Enums
```typescript
Role: PARTNER | OFFICE | WORKER

ShareLevel: NONE | TASKS_ONLY | FULL

TaskStatus: DRAFT | NEW | ASSIGNED | IN_PROGRESS | BLOCKED | COMPLETED | CANCELED | CLOSED
TaskPriority: LOW | MEDIUM | HIGH | URGENT
TaskEventType: CREATED | UPDATED | ASSIGNED | UNASSIGNED | STATUS_CHANGED | COMMENT_ADDED | ATTACHMENT_ADDED | ATTACHMENT_REMOVED
AttachmentType: IMAGE | DOCUMENT | OTHER
```

### Task Status Flow
```
DRAFT ──► NEW ──► ASSIGNED ──► IN_PROGRESS ──► COMPLETED ──► CLOSED
                      │              │
                      │              ▼
                      │          BLOCKED ───► IN_PROGRESS
                      │              │
                      ▼              ▼
                  CANCELED ◄────────┘
```

---

## 7. API ENDPOINTS REFERENCE

**Base URL**: `http://localhost:4000/api/v1`  
**Swagger**: `http://localhost:4000/docs`

### Auth (`/auth`)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/login` | Login, returns tokens | No |
| POST | `/auth/refresh` | Refresh access token | No |
| POST | `/auth/logout` | Invalidate refresh token | Yes |
| GET | `/auth/me` | Get current user | Yes |

### Organizations / Delegation (NEW) (`/orgs`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/orgs/me` | Get current user org | ALL |
| PATCH | `/orgs/me/delegation` | Set `managedByOrgId` + `shareLevel` | PARTNER (org admin) |
| GET | `/orgs/managed` | List orgs managed by my org | OFFICE |
| GET | `/orgs/:id` | Get org detail (only if allowed) | OFFICE |

> NOTE: "org admin" can be implemented later using membership.  
> MVP: allow PARTNER role user to update their org delegation settings.

### Tasks (`/tasks`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/tasks` | List tasks (scoped) | ALL |
| POST | `/tasks` | Create task | PARTNER |
| GET | `/tasks/:id` | Get task detail (scoped) | ALL |
| PATCH | `/tasks/:id` | Update task | PARTNER (own) |
| DELETE | `/tasks/:id` | Delete task | PARTNER (own) |
| POST | `/tasks/:id/assign` | Assign worker | OFFICE (scoped) |
| POST | `/tasks/:id/start` | Start task | WORKER |
| POST | `/tasks/:id/block` | Block task | WORKER |
| POST | `/tasks/:id/complete` | Complete task | WORKER |

### Tracking (`/tracking`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/tracking/location` | Update worker location | WORKER |
| GET | `/tracking/workers` | Get worker locations (scoped) | OFFICE (requires `shareLevel FULL`) |
| GET | `/tracking/workers/:id` | Get specific worker (scoped) | OFFICE |

---

## 8. SOCKET.IO EVENTS

**Namespace**: Default (`/`)  
**Auth**: Send `authenticate` event after connection

### Client → Server
```typescript
'authenticate' → { userId, role, organizationId }
```

### Server → Client
```typescript
'task.created'           → { task }
'task.updated'           → { task }
'task.assigned'          → { task, workerId }
'task.statusChanged'     → { task, previousStatus, newStatus }
'task.commentAdded'      → { task, comment }
'task.attachmentAdded'   → { task, attachment }
'worker.locationUpdated' → { workerId, lat, lng, accuracy }
```

### Rooms
- `org:{organizationId}` - Organization-wide events
- `role:{role}` - Role-specific events
- `user:{userId}` - User-specific events
- `task:{taskId}` - Task-specific events

---

## 9. TECH STACK QUICK REFERENCE

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
| Cache/Queue | Redis + BullMQ | |
| Storage | S3-compatible | Presigned URLs |
| Email | Nodemailer | SMTP |
| Push | Expo Notifications / FCM | |

---

## 10. COMMANDS REFERENCE

```bash
# Development
pnpm dev:api          # Start all API services (gateway + microservices)
pnpm dev:web          # Start both web apps (partner:3001, office:3002)
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

---

## 11. ENVIRONMENT FILES

| App | File | Key Variables |
|-----|------|---------------|
| gateway | `apps/api/gateway/.env` | `PORT`, `JWT_SECRET`, `REDIS_*`, `CORS_ORIGINS` |
| auth-service | `apps/api/auth-service/.env` | `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `REDIS_*` |
| task-service | `apps/api/task-service/.env` | `DATABASE_URL`, `REDIS_*` |
| notification-service | `apps/api/notification-service/.env` | `REDIS_*`, `SMTP_*`, `FCM_SERVER_KEY` |
| tracking-service | `apps/api/tracking-service/.env` | `DATABASE_URL`, `REDIS_*` |
| web-partner | `apps/web-partner/.env.local` | `NEXT_PUBLIC_API_URL` |
| web-office | `apps/web-office/.env.local` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` |
| mobile | `apps/mobile/.env` | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` |

---

## 12. TEST CREDENTIALS (Seed Data)

| Role | Email | Password |
|------|-------|----------|
| Partner | partner@example.com | password123 |
| Office | office@example.com | password123 |
| Worker 1 | worker1@example.com | password123 |
| Worker 2 | worker2@example.com | password123 |

---

## 13. IMPLEMENTATION STATUS

### Phase 1: Foundation ✅ COMPLETE
- [x] Monorepo structure (pnpm workspaces)
- [x] Docker Compose (PostgreSQL + Redis)
- [x] Prisma schema + migrations
- [x] Seed data
- [x] Environment files
- [x] API Gateway scaffold
- [x] All microservices scaffold
- [x] Web apps scaffold (Partner + Office)
- [x] Mobile app scaffold
- [x] Shared types package

### Phase 2: Authentication ✅ COMPLETE
- [x] Auth service: login, refresh, logout endpoints
- [x] JWT access/refresh token generation
- [x] Refresh token rotation (DB storage with SHA-256 hashing)
- [x] Password hashing (bcrypt, cost factor 12)
- [x] RolesGuard + JwtAuthGuard decorators
- [x] Gateway auth proxy to auth-service
- [x] Web Partner: login page + auth context + registration
- [x] Web Office: login page (premium dark header) + auth context
- [x] Account lockout (5 failed attempts = 15 min lockout)
- [x] Rate limiting (Throttler: 3/sec, 20/10sec, 100/min)
- [x] Security headers (Helmet.js)
- [x] Input validation (class-validator + Zod frontend)
- [x] "Remember Me" functionality (24h default / 30d extended)
- [x] Shared AnimatedLogo component (`@doergo/shared/components`)
- [x] Mobile: login screen + SecureStore + auth context + tab navigation
- [x] Mobile: animated splash screen with gear rotation + button click effect
- [x] Mobile: safe area handling for Android navigation bar

### Phase 3: Task Management 🔲 PENDING
- [ ] Update Prisma schema: Organization delegation fields + migration
- [ ] Update shared types: add ShareLevel enum
- [ ] task-service: Implement CRUD endpoints (scoped)
- [ ] task-service: Implement status transitions (state machine)
- [ ] Partner: create task UI
- [ ] Office: task list with filters
- [ ] Office: assign worker UI
- [ ] TaskEvent creation on changes

### Phase 4: Worker Mobile 🔲 PENDING
- [ ] Worker: my tasks list
- [ ] Worker: task detail screen
- [ ] Worker: start/block/complete actions
- [ ] Comments: add/list API + UI
- [ ] Attachments: camera capture + upload

### Phase 5: Real-time & Tracking 🔲 PENDING
- [ ] Socket.IO gateway setup
- [ ] Event emission on task changes
- [ ] Web: real-time updates
- [ ] Location tracking API
- [ ] Mobile: background location
- [ ] Office: live map view (scoped by delegation rules)

### Phase 6: Notifications 🔲 PENDING
- [ ] BullMQ job queue
- [ ] Email templates
- [ ] Push notification service
- [ ] Notification triggers

---

## 14. SOLID & DRY PRINCIPLES

> **IMPORTANT**: All code in this project MUST follow SOLID and DRY principles.

### DRY (Don't Repeat Yourself)
Use shared modules from `@doergo/shared`.

**Available shared utilities:**
| Import | Purpose |
|--------|---------|
| `SERVICE_NAMES` | Type-safe service name constants |
| `createMicroserviceOptions()` | Redis microservice bootstrap config |
| `createClientOptions(SERVICE_NAMES.X)` | ClientsModule registration |
| `success()`, `error()`, `paginated()` | Standardized API responses |
| `ErrorCodes` | Common error code constants |
| `PrismaModule`, `PrismaService` | Shared database access |
| `AnimatedLogo` | Shared logo component |

### SOLID Principles
Follow controller → service → prisma pattern, inject via DI.

---

## 15. CODING CONVENTIONS

### NestJS Services
```typescript
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @Roles(Role.PARTNER)
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

---

## 16. NEXT IMMEDIATE TASKS (CURRENT SPRINT)

**Current Sprint**: Phase 3 - Task Management + SaaS Delegation

1) Prisma: add `managedByOrgId` + `shareLevel` to Organization + migration
2) Shared types: add ShareLevel enum
3) Add org delegation endpoints:
   - PATCH `/orgs/me/delegation` (set managedByOrgId + shareLevel)
   - GET `/orgs/managed` (office lists orgs it manages)
4) Task-service: implement CRUD (scoped by org + delegation rules)
5) Office: task list can filter tasks by managed org (B, C...)
6) Tracking: office can see workers only if managed org shareLevel = FULL

---

*This document must be read at the start of every session. Update "Implementation Status" and "Next Tasks" as work progresses.*
