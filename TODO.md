# DOERGO - Implementation Checklist

> **Usage**: Check off items as completed. Use `[x]` for done, `[ ]` for pending, `[~]` for in progress.
> **Last Updated**: 2026-01-16 (Phase 2 Complete + Token Refresh Grace Period)
>
> **IMPORTANT**: All code MUST follow **SOLID** and **DRY** principles. See CLAUDE.md Section 13.

---

## PHASE 1: Foundation ✅

### Infrastructure
- [x] Create monorepo with pnpm workspaces
- [x] Setup Docker Compose (PostgreSQL + Redis)
- [x] Create all `.env.example` files
- [x] Copy `.env.example` to `.env` for all services

### Database
- [x] Design Prisma schema (all models)
- [x] Run initial migration
- [x] Create seed data (users + sample tasks)
- [x] Generate Prisma client

### Backend Scaffolding
- [x] API Gateway (NestJS) - basic setup
- [x] Auth Service - basic setup
- [x] Task Service - basic setup
- [x] Notification Service - basic setup
- [x] Tracking Service - basic setup
- [x] Shared package (types/enums)

### Frontend Scaffolding
- [x] Web App (Next.js) - merged CLIENT + DISPATCHER portal with RBAC
- [x] Mobile (Expo) - TECHNICIAN app

---

## PHASE 2: Authentication ✅ COMPLETE

### Backend - Auth Service
- [x] `POST /auth/login` - Validate credentials, return tokens
- [x] `POST /auth/refresh` - Refresh access token with rotation
- [x] `POST /auth/logout` - Invalidate refresh token
- [x] `GET /auth/me` - Return current user profile
- [x] `POST /auth/register` - User registration (CLIENT role)
- [x] Password hashing with bcrypt (cost factor 12)
- [x] JWT generation (access: 15m, refresh: 7d) - configurable via `.env`
- [x] Refresh token storage in database (SHA-256 hashed)
- [x] Token rotation (invalidate old refresh token)
- [x] Token refresh grace period (60s) for concurrent requests
- [x] Atomic token claiming to prevent race conditions
- [x] Wait loop for cached tokens from concurrent requests
- [x] Dynamic token monitor (web + mobile) reads expiration from JWT
- [x] Account lockout (5 failed attempts = 15 min)
- [x] Data normalization (lowercase email, names)
- [x] `POST /auth/forgot-password` - Generate reset token (email TODO)
- [x] `POST /auth/reset-password` - Validate token, update password
- [x] Password reset token model in Prisma schema (SHA-256 hashed)

### Backend - Gateway
- [x] Proxy `/auth/*` routes to auth-service
- [x] `JwtAuthGuard` - Verify access token
- [x] `RolesGuard` - Check user role
- [x] `@Roles()` decorator
- [x] `@CurrentUser()` decorator
- [x] `@Public()` decorator
- [x] Rate limiting (`@nestjs/throttler`)
- [x] Security headers (Helmet.js)
- [x] Input validation (class-validator DTOs)
- [x] Role injection prevention (hardcoded CLIENT)
- [x] Swagger disabled in production
- [x] Global exception filter (consistent error responses)

### Web - Unified Portal (web-app)
- [x] Login page (`/login`) with sliding animation
- [x] Registration form with validation
- [x] Auth context/provider
- [x] Protected route wrapper (withAuth HOC)
- [x] Token storage (localStorage/sessionStorage)
- [x] "Keep me signed in" functionality
- [x] Auto-refresh on token expiry
- [x] Logout functionality
- [x] Redirect to `/dashboard` after login
- [x] Toast notifications (Sonner)
- [x] Zod validation matching backend DTOs
- [x] Shared Spinner components
- [x] Shared validation schemas (`lib/validation.ts`)
- [x] Forgot password page (`/forgot-password`) with API integration
- [x] Reset password page (`/reset-password`)
- [x] Skeleton loaders (auth + dashboard)
- [x] Role-based sidebar navigation (CLIENT vs DISPATCHER)
- [x] Role-based dashboard views
- [x] Unauthorized page for wrong roles (TECHNICIAN → mobile)

### Mobile - Technician App
- [x] Login screen with premium dark header UI
- [x] Secure token storage (expo-secure-store)
- [x] Auth context with auto-refresh
- [x] Auto-refresh logic (every 10 min)
- [x] Navigation guards (redirect based on auth)
- [x] Tab navigation (Tasks + Profile)
- [x] TECHNICIAN role enforcement
- [x] Animated splash screen with logo animation
- [x] Gear rotation entrance animation
- [x] "Start button" click effect with particles
- [x] Zoom transition to app
- [x] Safe area handling for Android navigation bar

---

## PHASE 3: Task Management ✅ (Backend & Web Complete)

### Backend - Task Service
- [x] `GET /tasks` - List tasks (filtered by role/org)
- [x] `POST /tasks` - Create task (CLIENT only)
- [x] `GET /tasks/:id` - Get task detail
- [x] `PUT /tasks/:id` - Update task (CLIENT: own only)
- [x] `DELETE /tasks/:id` - Delete task
- [x] `PATCH /tasks/:id/assign` - Assign to technician (DISPATCHER only)
- [ ] `POST /tasks/:id/unassign` - Remove assignment
- [x] `PATCH /tasks/:id/status` - Update task status (TECHNICIAN)
- [x] Task status state machine (validate transitions)
- [x] Create TaskEvent on every change
- [x] Pagination support
- [x] Filter by status, priority
- [x] `GET /tasks/:id/timeline` - Get task activity timeline
- [x] `POST /tasks/:id/comments` - Add comment
- [x] `GET /tasks/:id/comments` - Get task comments

### Backend - Gateway
- [x] Proxy `/tasks/*` routes to task-service
- [x] All endpoints with proper @Roles decorators

### Web - CLIENT View
- [x] Tasks list page (`/tasks`) - own tasks only
- [x] Create task form (`/tasks/new`)
- [x] Task detail page (`/tasks/[id]`)
- [ ] Edit task page (`/tasks/[id]/edit`)
- [x] Status badges component
- [x] Priority badges component
- [x] Filter by status, priority
- [x] Search within tasks
- [x] Pagination
- [x] Delete task with confirmation
- [x] Add comments

### Web - DISPATCHER View
- [x] Tasks list page (`/tasks`) with all org tasks
- [x] Task detail page (`/tasks/[id]`)
- [x] Technician assignment panel
- [x] Technician dropdown selector (fetches from API)
- [x] Filter by status, priority
- [ ] Bulk actions (optional)

### Mobile - Technician App
- [ ] My Tasks tab (assigned tasks only)
- [ ] Task card component
- [ ] Task detail screen
- [ ] Start Task button + confirmation
- [ ] Block Task button + reason input
- [ ] Complete Task button + confirmation
- [ ] Pull-to-refresh

---

## PHASE 4: Comments & Attachments 🔲

### Backend - Task Service
- [ ] `GET /tasks/:id/comments` - List comments
- [ ] `POST /tasks/:id/comments` - Add comment
- [ ] `DELETE /tasks/:id/comments/:commentId` - Delete own comment
- [ ] `GET /tasks/:id/attachments` - List attachments
- [ ] `POST /tasks/:id/attachments/presign` - Get upload URL
- [ ] `POST /tasks/:id/attachments` - Confirm attachment
- [ ] `DELETE /tasks/:id/attachments/:attachmentId` - Remove
- [ ] S3 presigned URL generation
- [ ] File type validation
- [ ] File size limits

### Web - CLIENT & DISPATCHER
- [ ] Comments section on task detail
- [ ] Comment input form
- [ ] Comment list with timestamps
- [ ] Attachment upload dropzone
- [ ] Attachment gallery/list
- [ ] Download attachment
- [ ] Delete attachment (own only)

### Mobile - Technician App
- [ ] Comments section on task detail
- [ ] Add comment input
- [ ] Camera capture for photos
- [ ] Gallery picker
- [ ] Upload progress indicator
- [ ] Attachment preview

### Timeline
- [ ] `GET /tasks/:id/timeline` - Combined events
- [ ] Timeline component (web)
- [ ] Timeline component (mobile)

---

## PHASE 5: Real-time Updates 🔲

### Backend - Notification Service
- [ ] Socket.IO gateway setup
- [ ] Authentication middleware (verify JWT)
- [ ] Room management (org, role, user, task)
- [ ] `authenticate` event handler
- [ ] Event broadcasting methods

### Backend - Integration
- [ ] Emit `task.created` from task-service
- [ ] Emit `task.updated` from task-service
- [ ] Emit `task.assigned` from task-service
- [ ] Emit `task.statusChanged` from task-service
- [ ] Emit `task.commentAdded` from task-service
- [ ] Emit `task.attachmentAdded` from task-service

### Web - CLIENT & DISPATCHER
- [ ] Socket.IO client setup
- [ ] Connect on login
- [ ] Disconnect on logout
- [ ] Listen for task events
- [ ] Update UI in real-time (invalidate queries)
- [ ] Toast notifications for important events

### Mobile - Technician App
- [ ] Socket.IO client setup
- [ ] Background connection handling
- [ ] Listen for assignment events
- [ ] Update task list in real-time
- [ ] Local notifications for new assignments

---

## PHASE 6: Location Tracking 🔲

### Backend - Tracking Service
- [ ] `POST /tracking/location` - Update technician location
- [ ] `GET /tracking/workers` - Get all active technicians (DISPATCHER)
- [ ] `GET /tracking/workers/:id` - Get specific technician
- [ ] Store in `WorkerLastLocation` table
- [ ] Emit `worker.locationUpdated` event
- [ ] Rate limiting (max 1 update per 5 seconds)

### Backend - Gateway
- [ ] Proxy `/tracking/*` routes

### Mobile - Technician App
- [ ] Request location permissions
- [ ] Background location tracking (expo-location)
- [ ] Start tracking when task IN_PROGRESS
- [ ] Stop tracking when task COMPLETED
- [ ] Shift mode toggle (optional)
- [ ] "Tracking ON" indicator
- [ ] Battery-efficient update intervals

### Web - DISPATCHER View (Live Map)
- [ ] Live map page (`/map`)
- [ ] Google Maps integration
- [ ] Technician markers with status
- [ ] Task location markers
- [ ] Click marker for details
- [ ] Auto-refresh positions
- [ ] Filter by status

---

## PHASE 7: Notifications 🔲

### Backend - Notification Service
- [ ] BullMQ queue setup
- [ ] Email job processor
- [ ] Push notification job processor
- [ ] Email templates (task created, assigned, completed)
- [ ] FCM integration for push

### Triggers
- [ ] Email on task created (to DISPATCHER)
- [ ] Email on task assigned (to TECHNICIAN)
- [ ] Email on task completed (to CLIENT)
- [ ] Push on new assignment (to TECHNICIAN)
- [ ] Push on status change (to relevant users)

### Web
- [ ] Notification bell icon
- [ ] Notification dropdown
- [ ] Mark as read

### Mobile
- [ ] Push notification handling
- [ ] Notification permissions
- [ ] Deep linking from notification

---

## PHASE 8: Polish & Production 🔲

### Security ⚠️ AUDIT COMPLETE - ISSUES FOUND
- [x] Rate limiting on all endpoints (3/sec, 20/10sec, 100/min)
- [x] Input validation (class-validator)
- [x] SQL injection prevention (Prisma + validation)
- [x] XSS prevention (input validation)
- [x] CORS configuration (whitelisted origins only)
- [x] Helmet middleware (security headers)
- [x] IDOR vulnerability fixed (authorization checks on /users/:id)
- [x] JWT none-algorithm attack protected
- [x] Account lockout (5 failed attempts)
- [x] NoSQL injection protected
- [x] Command injection protected
- [x] Path traversal protected
- [x] Email enumeration protected (forgot-password)
- [x] **CRITICAL**: Add @Roles to task endpoints
- [x] **CRITICAL**: Add @Roles to tracking endpoints (IDOR)
- [x] **CRITICAL**: Remove hardcoded JWT fallback 'secret'
- [x] **CRITICAL**: Remove token logging in auth.service.ts
- [x] **CRITICAL**: Generate strong JWT secrets (replace .env defaults)
- [ ] **HIGH**: Migrate tokens to HttpOnly cookies (XSS protection)
- [ ] **HIGH**: Implement JTI blacklist for token revocation

> **Full audit report:** `SECURITY_AUDIT_REPORT.md` (17 vulnerabilities)

### Testing
- [ ] Auth service unit tests
- [ ] Task service unit tests
- [ ] E2E test: full task lifecycle
- [ ] API integration tests

### DevOps
- [ ] Production Docker Compose
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Environment-specific configs
- [ ] Logging setup (Winston/Pino)
- [ ] Error tracking (Sentry)
- [ ] Health check endpoints

### Documentation
- [ ] API documentation (Swagger complete)
- [ ] Deployment guide
- [ ] Environment setup guide

---

## QUICK STATUS

| Phase | Status | Progress |
|-------|--------|----------|
| 1. Foundation | ✅ Complete | 100% |
| 2. Authentication | ✅ Complete | 100% |
| 3. Task Management | ✅ Backend+Web Complete | 85% |
| 4. Comments & Attachments | 🔲 Pending | 0% |
| 5. Real-time Updates | 🔲 Pending | 0% |
| 6. Location Tracking | 🔲 Pending | 0% |
| 7. Notifications | 🔲 Pending | 0% |
| 8. Polish & Production | ✅ Critical Fixed | 25% |

**Overall Progress**: ~45%

### ✅ Security Status
**All 5 CRITICAL vulnerabilities have been fixed.**
Remaining: 2 HIGH severity items (HttpOnly cookies, JTI blacklist).
See `SECURITY_AUDIT_REPORT.md` for full details.

---

## CODE QUALITY CHECKLIST

Before completing any task, verify:

- [ ] **DRY**: No duplicated code - use `@doergo/shared` utilities
- [ ] **SOLID**: Single responsibility, proper abstraction
- [ ] **Types**: All functions/methods have proper TypeScript types
- [ ] **Validation**: Input validated on both frontend (Zod) and backend (class-validator)
- [ ] **Security**: No hardcoded secrets, proper auth checks
- [ ] **Tests**: Unit tests for critical business logic (when applicable)

---

## SESSION LOG

| Date | Session Focus | Completed |
|------|---------------|-----------|
| 2026-01-14 | Initial setup | Phase 1 complete |
| 2026-01-14 | Authentication backend | Auth service + Gateway complete |
| 2026-01-14 | Security hardening | Rate limiting, account lockout, Helmet, validation |
| 2026-01-14 | Web CLIENT login | Login page, registration, auth context |
| 2026-01-14 | Code organization | DRY/SOLID refactor, shared modules |
| 2026-01-15 | Web DISPATCHER auth | Login page with premium dark header, auth context |
| 2026-01-15 | Shared components | AnimatedLogo component in @doergo/shared/components |
| 2026-01-15 | Remember Me | Backend token expiration (24h / 30d), rememberMe DTO field |
| 2026-01-15 | Mobile auth | Login screen, SecureStore, auth context, tab navigation |
| 2026-01-15 | Mobile splash | Animated splash with gear rotation, button click effect |
| 2026-01-15 | Security audit | Comprehensive penetration testing, IDOR fix, audit complete |
| 2026-01-15 | Role rename | PARTNER→CLIENT, OFFICE→DISPATCHER, WORKER→TECHNICIAN |
| 2026-01-15 | Multi-tenant SaaS | OrganizationAccess table, AccessLevel enum, delegation model |
| 2026-01-15 | Web app merge | Merged web-partner + web-office → single web-app (port 3000) with RBAC |
| 2026-01-15 | Documentation | Updated CLAUDE.md design system, TODO.md role terminology |
| 2026-01-15 | Password Reset | Backend forgot/reset-password endpoints, DTOs, PasswordResetToken model |
| 2026-01-15 | Global Exception | Gateway GlobalExceptionFilter for consistent error responses |
| 2026-01-15 | Web Password Reset | Forgot-password API integration, reset-password page |
| 2026-01-15 | Security Audit | Comprehensive pentest - 17 vulnerabilities found (see SECURITY_AUDIT_REPORT.md) |
| 2026-01-15 | React Version Fix | Pinned react to 19.1.0 for mobile compatibility |
| 2026-01-16 | Security Fixes | Fixed all 5 CRITICAL vulnerabilities (@Roles, IDOR, JWT secrets, token logging) |
| 2026-01-16 | Task Management | Backend task-service complete, Gateway tasks routes, Web app tasks pages with real API |
| 2026-01-16 | Token Refresh | Grace period (60s), atomic claiming, concurrent request handling, configurable expiration via .env, dynamic token monitors |

---

## SHARED MODULES REFERENCE

**Import from `@doergo/shared`:**

```typescript
// Microservices
import { SERVICE_NAMES, createMicroserviceOptions, createClientOptions } from '@doergo/shared';

// API Responses
import { success, error, paginated, ErrorCodes } from '@doergo/shared';

// Types
import { Role, AccessLevel, TaskStatus, TaskPriority, ApiResponse } from '@doergo/shared';
// Role: CLIENT | DISPATCHER | TECHNICIAN
// AccessLevel: NONE | TASKS_ONLY | TASKS_ASSIGN | FULL

// React Components (for web apps)
import { AnimatedLogo } from '@doergo/shared/components';
// Props: size ('small' | 'default' | 'large'), variant ('light' | 'dark'), primaryColor (hex)
```

---

## DESIGN SYSTEM QUICK REFERENCE

### Brand Colors
| Name | Hex | Tailwind |
|------|-----|----------|
| Primary | `#2563EB` | `blue-600` |
| Primary Hover | `#1D4ED8` | `blue-700` |
| Success | `#16A34A` | `green-600` |
| Warning | `#CA8A04` | `yellow-600` |
| Error | `#DC2626` | `red-600` |

### Role-Based Navigation
| Role | Navigation Items |
|------|------------------|
| CLIENT | Dashboard, My Tasks, Create Task, Invoices |
| DISPATCHER | Dashboard, All Tasks, Technicians, Live Map, Managed Orgs |
| TECHNICIAN | Tasks tab, Profile tab (mobile only) |

### Status Badge Colors
| Status | Color Class |
|--------|-------------|
| NEW | `blue-600/blue-100` |
| ASSIGNED | `purple-600/purple-100` |
| IN_PROGRESS | `amber-600/amber-100` |
| BLOCKED | `red-600/red-100` |
| COMPLETED | `green-600/green-100` |

> See CLAUDE.md Section 19 for complete design system documentation.

---

*Update this file at the end of each session with completed items.*
