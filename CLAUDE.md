# DOERGO - Project Reference Document
> **Purpose**: Single source of truth for AI assistants. Read this first before any task.
> **Last Updated**: 2026-01-16 (Phase 2 Complete + Token Refresh Grace Period)

---

## 1. PROJECT IDENTITY

| Key | Value |
|-----|-------|
| Name | Doergo |
| Type | 3-role task management & field execution platform |
| Monorepo | pnpm workspaces |
| Root | `/Users/pc/work/doergo` |

**Core Flow**: `Client creates task` → `Dispatcher assigns technician` → `Technician executes` → `Real-time updates`

---

## 2. ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                    │
├───────────────────────────────────┬─────────────────────────────────┤
│              web-app              │         mobile                  │
│         (Next.js + RBAC)          │     (React Native/Expo)         │
│   :3000 (CLIENT & DISPATCHER)     │       (TECHNICIAN only)         │
└─────────────────┬─────────────────┴──────────────┬──────────────────┘
                  │                                │
                  └────────────────────────────────┘
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
│   ├── web-app/               # Unified web portal (Next.js) :3000
│   │   └── src/app/           # App Router with role-based views
│   │                          # CLIENT sees: Dashboard, My Tasks, Create Task, Invoices
│   │                          # DISPATCHER sees: Dashboard, All Tasks, Technicians, Live Map, Managed Orgs
│   └── mobile/                # Technician app (Expo)
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

## 4. ROLES & PERMISSIONS

| Role | Platform | Can Create Tasks | Can Assign | Can Execute | Can Track Technicians |
|------|----------|------------------|------------|-------------|----------------------|
| **CLIENT** | Web | ✅ Own org only | ❌ | ❌ | ❌ |
| **DISPATCHER** | Web | ❌ | ✅ | ❌ | ✅ (within allowed scope) |
| **TECHNICIAN** | Mobile | ❌ | ❌ | ✅ Assigned only | ❌ (is tracked) |

### Multi-Tenant SaaS Delegation
Organizations can grant access to other organizations:
- **DISPATCHER** from Org A can access Org B's data only if B grants access via `OrganizationAccess`
- Access levels: `NONE`, `TASKS_ONLY`, `TASKS_ASSIGN`, `FULL`

---

## 5. DATABASE SCHEMA (Prisma)

**Location**: `apps/api/auth-service/prisma/schema.prisma`

### Core Models
```
Organization { id, name, isActive, grantedAccess[], receivedAccess[] }
OrganizationAccess { id, grantorOrgId, granteeOrgId, accessLevel, canViewTasks, canAssignWorkers, canViewWorkers, canViewTracking }
User { id, email, passwordHash, firstName, lastName, role, organizationId, failedLoginAttempts, lockedUntil }
RefreshToken { id, tokenHash, expiresAt, userId, usedAt, replacedByTokenHash, cachedAccessToken, cachedRefreshToken }
PasswordResetToken { id, tokenHash, expiresAt, used, userId }
Task { id, title, description, status, priority, dueDate, locationLat, locationLng, locationAddress, organizationId, createdById, assignedToId }
Comment { id, content, taskId, userId }
Attachment { id, fileName, fileUrl, fileType, fileSize, taskId, uploadedById }
TaskEvent { id, eventType, metadata, taskId, userId }
WorkerLastLocation { id, lat, lng, accuracy, userId }
```

### Enums
```typescript
Role: CLIENT | DISPATCHER | TECHNICIAN
AccessLevel: NONE | TASKS_ONLY | TASKS_ASSIGN | FULL
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
| POST | `/auth/register` | Register new CLIENT account | No |
| POST | `/auth/refresh` | Refresh access token | No |
| POST | `/auth/logout` | Invalidate refresh token | Yes |
| POST | `/auth/forgot-password` | Request password reset email | No |
| POST | `/auth/reset-password` | Reset password with token | No |
| GET | `/auth/me` | Get current user | Yes |

### Tasks (`/tasks`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/tasks` | List tasks | ALL |
| POST | `/tasks` | Create task | CLIENT |
| GET | `/tasks/:id` | Get task detail | ALL |
| PATCH | `/tasks/:id` | Update task | CLIENT (own) |
| DELETE | `/tasks/:id` | Delete task | CLIENT (own) |
| POST | `/tasks/:id/assign` | Assign technician | DISPATCHER |
| POST | `/tasks/:id/start` | Start task | TECHNICIAN |
| POST | `/tasks/:id/block` | Block task | TECHNICIAN |
| POST | `/tasks/:id/complete` | Complete task | TECHNICIAN |

### Tracking (`/tracking`)
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/tracking/location` | Update technician location | TECHNICIAN |
| GET | `/tracking/workers` | Get all technician locations | DISPATCHER |
| GET | `/tracking/workers/:id` | Get specific technician | DISPATCHER |

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

| Role | Email | Password |
|------|-------|----------|
| Client | client@example.com | password123 |
| Dispatcher | dispatcher@example.com | password123 |
| Technician 1 | technician1@example.com | password123 |
| Technician 2 | technician2@example.com | password123 |

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

### Phase 3: Task Management 🔲 PENDING
- [ ] Task CRUD endpoints (task-service)
- [ ] Task status transitions (state machine)
- [ ] Web CLIENT: create task UI
- [ ] Web DISPATCHER: task list with filters
- [ ] Web DISPATCHER: assign technician UI
- [ ] TaskEvent creation on changes

### Phase 4: Technician Mobile 🔲 PENDING
- [ ] Technician: my tasks list
- [ ] Technician: task detail screen
- [ ] Technician: start/block/complete actions
- [ ] Comments: add/list API + UI
- [ ] Attachments: camera capture + upload

### Phase 5: Real-time & Tracking 🔲 PENDING
- [ ] Socket.IO gateway setup
- [ ] Event emission on task changes
- [ ] Web: real-time updates
- [ ] Location tracking API
- [ ] Mobile: background location
- [ ] Web DISPATCHER: live map view

### Phase 6: Notifications 🔲 PENDING
- [ ] BullMQ job queue
- [ ] Email templates
- [ ] Push notification service
- [ ] Notification triggers

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
| `success()`, `error()`, `paginated()` | Standardized API responses |
| `ErrorCodes` | Common error code constants |
| `PrismaModule`, `PrismaService` | Shared database access |
| `AnimatedLogo` | Shared logo component (from `@doergo/shared/components`) |

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
  @Roles(Role.CLIENT)
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

---

## 17. NEXT IMMEDIATE TASKS

**Current Sprint**: Phase 3 - Task Management

1. **task-service**: Implement CRUD endpoints
   - File: `apps/api/task-service/src/modules/tasks/tasks.service.ts`
   - GET /tasks (list with filters), POST /tasks, GET /tasks/:id, PATCH, DELETE

2. **task-service**: Implement status transitions
   - State machine for valid status changes
   - Create TaskEvent on every change

3. **gateway**: Proxy task routes
   - File: `apps/api/gateway/src/modules/tasks/tasks.controller.ts`

4. **web-app**: Tasks list page (role-based views)
   - File: `apps/web-app/src/app/(dashboard)/tasks/page.tsx`
   - CLIENT: Table view of own tasks
   - DISPATCHER: Table view with filters, technician assignment

5. **web-app**: Create task form (CLIENT only)
   - File: `apps/web-app/src/app/(dashboard)/tasks/new/page.tsx`

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

#### CLIENT View
- Dashboard: Task stats (Total, In Progress, Completed, Pending)
- Navigation: Dashboard, My Tasks, Create Task, Invoices
- Actions: Create tasks, view own tasks, add comments

#### DISPATCHER View
- Dashboard: Operations stats (Active Tasks, Technicians Online, Completed Today, Pending Assignment)
- Navigation: Dashboard, All Tasks, Technicians, Live Map, Managed Orgs
- Actions: Assign technicians, view all tasks, track locations

#### TECHNICIAN View (Mobile Only)
- Tabs: Tasks, Profile
- Actions: Start/block/complete tasks, add photos, update location

### Animation Guidelines
- Transitions: 200-300ms duration, ease-out timing
- Hover states: Scale 1.02 for interactive elements
- Loading: Pulse animation for skeletons
- Toast: Slide in from top-right

---

*This document should be read at the start of every session. Update section 12 (Implementation Status) and section 17 (Next Tasks) as work progresses.*
