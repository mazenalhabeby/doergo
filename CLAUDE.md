# DOERGO - Project Reference Document
> **Purpose**: Single source of truth for AI assistants. Read this first before any task.
> **Last Updated**: 2026-01-14

---

## 1. PROJECT IDENTITY

| Key | Value |
|-----|-------|
| Name | Doergo |
| Type | 3-role task management & field execution platform |
| Monorepo | pnpm workspaces |
| Root | `/Users/pc/work/doergo` |

**Core Flow**: `Partner creates task` → `Office assigns worker` → `Worker executes` → `Real-time updates`

---

## 2. ARCHITECTURE OVERVIEW

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

## 3. DIRECTORY STRUCTURE

```
doergo/
├── apps/
│   ├── api/
│   │   ├── gateway/           # API Gateway - routes to microservices
│   │   │   └── src/
│   │   │       ├── main.ts    # Entry: port 4000, prefix /api/v1
│   │   │       └── modules/   # auth/, tasks/, tracking/, users/
│   │   ├── auth-service/      # Auth microservice
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
│   └── shared/                # Shared types, enums, constants
│       └── src/types/index.ts
├── infra/
│   └── docker/
│       └── docker-compose.dev.yml
└── package.json               # Root workspace scripts
```

---

## 4. ROLES & PERMISSIONS

| Role | Platform | Can Create Tasks | Can Assign | Can Execute | Can Track Workers |
|------|----------|------------------|------------|-------------|-------------------|
| **PARTNER** | Web | ✅ Own org only | ❌ | ❌ | ❌ |
| **OFFICE** | Web | ❌ | ✅ | ❌ | ✅ |
| **WORKER** | Mobile | ❌ | ❌ | ✅ Assigned only | ❌ (is tracked) |

---

## 5. DATABASE SCHEMA (Prisma)

**Location**: `apps/api/auth-service/prisma/schema.prisma`

### Core Models
```
Organization { id, name, isActive }
User { id, email, passwordHash, firstName, lastName, role, organizationId }
RefreshToken { id, token, expiresAt, userId }
Task { id, title, description, status, priority, dueDate, locationLat, locationLng, locationAddress, organizationId, createdById, assignedToId }
Comment { id, content, taskId, userId }
Attachment { id, fileName, fileUrl, fileType, fileSize, taskId, uploadedById }
TaskEvent { id, eventType, metadata, taskId, userId }
WorkerLastLocation { id, lat, lng, accuracy, userId }
```

### Enums
```typescript
Role: PARTNER | OFFICE | WORKER
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

## 6. API ENDPOINTS REFERENCE

**Base URL**: `http://localhost:4000/api/v1`
**Swagger**: `http://localhost:4000/docs`

### Auth (`/auth`)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/login` | Login, returns tokens | No |
| POST | `/auth/refresh` | Refresh access token | No |
| POST | `/auth/logout` | Invalidate refresh token | Yes |
| GET | `/auth/me` | Get current user | Yes |

### Tasks (`/tasks`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/tasks` | List tasks | ALL |
| POST | `/tasks` | Create task | PARTNER |
| GET | `/tasks/:id` | Get task detail | ALL |
| PATCH | `/tasks/:id` | Update task | PARTNER (own) |
| DELETE | `/tasks/:id` | Delete task | PARTNER (own) |
| POST | `/tasks/:id/assign` | Assign worker | OFFICE |
| POST | `/tasks/:id/start` | Start task | WORKER |
| POST | `/tasks/:id/block` | Block task | WORKER |
| POST | `/tasks/:id/complete` | Complete task | WORKER |

### Tracking (`/tracking`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/tracking/location` | Update worker location | WORKER |
| GET | `/tracking/workers` | Get all worker locations | OFFICE |
| GET | `/tracking/workers/:id` | Get specific worker | OFFICE |

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

---

## 8. TECH STACK QUICK REFERENCE

| Layer | Technology | Notes |
|-------|------------|-------|
| Web Frontend | Next.js 15 + TypeScript | App Router |
| UI Components | Tailwind CSS + shadcn/ui | |
| State/Data | TanStack Query | |
| Mobile | React Native + Expo | SDK 52 |
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

## 9. COMMANDS REFERENCE

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

## 10. ENVIRONMENT FILES

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

## 11. TEST CREDENTIALS (Seed Data)

| Role | Email | Password |
|------|-------|----------|
| Partner | partner@example.com | password123 |
| Office | office@example.com | password123 |
| Worker 1 | worker1@example.com | password123 |
| Worker 2 | worker2@example.com | password123 |

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
- [x] Web apps scaffold (Partner + Office)
- [x] Mobile app scaffold
- [x] Shared types package

### Phase 2: Authentication 🔲 PENDING
- [ ] Auth service: login, refresh, logout endpoints
- [ ] JWT access/refresh token generation
- [ ] Refresh token rotation (DB storage)
- [ ] Password hashing (bcrypt)
- [ ] RolesGuard decorator
- [ ] Gateway auth proxy to auth-service
- [ ] Web: login page + auth context
- [ ] Mobile: login screen + secure storage

### Phase 3: Task Management 🔲 PENDING
- [ ] Task CRUD endpoints (task-service)
- [ ] Task status transitions (state machine)
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
- [ ] Office: live map view

### Phase 6: Notifications 🔲 PENDING
- [ ] BullMQ job queue
- [ ] Email templates
- [ ] Push notification service
- [ ] Notification triggers

---

## 13. CODING CONVENTIONS

### NestJS Services
```typescript
// Pattern: Controller → Service → Prisma
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

## 14. COMMON TASKS QUICK GUIDE

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

## 15. TROUBLESHOOTING

| Issue | Solution |
|-------|----------|
| Docker not running | `docker info` to check, start Docker Desktop |
| DB connection failed | Check `DATABASE_URL` in `.env`, ensure Docker containers running |
| Prisma client outdated | `pnpm db:generate` |
| Port already in use | Kill process: `lsof -ti:PORT \| xargs kill -9` |
| Redis connection refused | Check Redis container: `docker ps` |
| CORS errors | Check `CORS_ORIGINS` in gateway `.env` |

---

## 16. NEXT IMMEDIATE TASKS

**Current Sprint**: Phase 2 - Authentication

1. **auth-service**: Implement login endpoint
   - File: `apps/api/auth-service/src/modules/auth/auth.service.ts`
   - Validate credentials, generate JWT pair

2. **auth-service**: Implement refresh endpoint
   - Store refresh tokens in DB
   - Implement rotation (invalidate old on refresh)

3. **gateway**: Proxy auth routes
   - File: `apps/api/gateway/src/modules/auth/auth.controller.ts`

4. **gateway**: Add JwtAuthGuard
   - Verify access token on protected routes

5. **web-partner**: Login page
   - File: `apps/web-partner/src/app/login/page.tsx`

---

*This document should be read at the start of every session. Update section 12 (Implementation Status) and section 16 (Next Tasks) as work progresses.*
