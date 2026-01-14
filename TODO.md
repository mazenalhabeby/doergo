# DOERGO - Implementation Checklist

> **Usage**: Check off items as completed. Use `[x]` for done, `[ ]` for pending, `[~]` for in progress.
> **Last Updated**: 2026-01-14

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
- [x] Web Partner (Next.js) - basic setup
- [x] Web Office (Next.js) - basic setup
- [x] Mobile (Expo) - basic setup

---

## PHASE 2: Authentication ✅ (Backend Complete)

### Backend - Auth Service
- [x] `POST /auth/login` - Validate credentials, return tokens
- [x] `POST /auth/refresh` - Refresh access token with rotation
- [x] `POST /auth/logout` - Invalidate refresh token
- [x] `GET /auth/me` - Return current user profile
- [x] Password hashing with bcrypt
- [x] JWT generation (access: 15m, refresh: 7d)
- [x] Refresh token storage in database
- [x] Token rotation (invalidate old refresh token)

### Backend - Gateway
- [x] Proxy `/auth/*` routes to auth-service
- [x] `JwtAuthGuard` - Verify access token
- [x] `RolesGuard` - Check user role
- [x] `@Roles()` decorator
- [x] `@CurrentUser()` decorator
- [x] `@Public()` decorator
- [ ] Global exception filter (nice to have)

### Web - Partner Portal
- [ ] Login page (`/login`)
- [ ] Auth context/provider
- [ ] Protected route wrapper
- [ ] Token storage (httpOnly cookie or localStorage)
- [ ] Auto-refresh on token expiry
- [ ] Logout functionality
- [ ] Redirect to `/tasks` after login

### Web - Office Portal
- [ ] Login page (`/login`)
- [ ] Auth context/provider
- [ ] Protected route wrapper
- [ ] Same auth logic as partner

### Mobile - Worker App
- [ ] Login screen
- [ ] Secure token storage (expo-secure-store)
- [ ] Auth context
- [ ] Auto-refresh logic
- [ ] Navigation to tasks after login

---

## PHASE 3: Task Management 🔲

### Backend - Task Service
- [ ] `GET /tasks` - List tasks (filtered by role/org)
- [ ] `POST /tasks` - Create task (Partner only)
- [ ] `GET /tasks/:id` - Get task detail
- [ ] `PATCH /tasks/:id` - Update task (Partner: own only)
- [ ] `DELETE /tasks/:id` - Soft delete task
- [ ] `POST /tasks/:id/assign` - Assign to worker (Office only)
- [ ] `POST /tasks/:id/unassign` - Remove assignment
- [ ] `POST /tasks/:id/start` - Worker starts task
- [ ] `POST /tasks/:id/block` - Worker blocks with reason
- [ ] `POST /tasks/:id/complete` - Worker completes task
- [ ] Task status state machine (validate transitions)
- [ ] Create TaskEvent on every change
- [ ] Pagination support
- [ ] Filter by status, priority, date range

### Backend - Gateway
- [ ] Proxy `/tasks/*` routes to task-service

### Web - Partner Portal
- [ ] Tasks list page (`/tasks`)
- [ ] Create task form (`/tasks/new`)
- [ ] Task detail page (`/tasks/[id]`)
- [ ] Edit task modal
- [ ] Status badges
- [ ] Filter by status

### Web - Office Portal
- [ ] Tasks list page (`/tasks`) with all org tasks
- [ ] Task detail page (`/tasks/[id]`)
- [ ] Worker assignment panel
- [ ] Worker dropdown selector
- [ ] Filter by status, worker, priority
- [ ] Bulk actions (optional)

### Mobile - Worker App
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

### Web - Partner & Office
- [ ] Comments section on task detail
- [ ] Comment input form
- [ ] Comment list with timestamps
- [ ] Attachment upload dropzone
- [ ] Attachment gallery/list
- [ ] Download attachment
- [ ] Delete attachment (own only)

### Mobile - Worker App
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

### Web - Partner & Office
- [ ] Socket.IO client setup
- [ ] Connect on login
- [ ] Disconnect on logout
- [ ] Listen for task events
- [ ] Update UI in real-time (invalidate queries)
- [ ] Toast notifications for important events

### Mobile - Worker App
- [ ] Socket.IO client setup
- [ ] Background connection handling
- [ ] Listen for assignment events
- [ ] Update task list in real-time
- [ ] Local notifications for new assignments

---

## PHASE 6: Location Tracking 🔲

### Backend - Tracking Service
- [ ] `POST /tracking/location` - Update worker location
- [ ] `GET /tracking/workers` - Get all active workers (Office)
- [ ] `GET /tracking/workers/:id` - Get specific worker
- [ ] Store in `WorkerLastLocation` table
- [ ] Emit `worker.locationUpdated` event
- [ ] Rate limiting (max 1 update per 5 seconds)

### Backend - Gateway
- [ ] Proxy `/tracking/*` routes

### Mobile - Worker App
- [ ] Request location permissions
- [ ] Background location tracking (expo-location)
- [ ] Start tracking when task IN_PROGRESS
- [ ] Stop tracking when task COMPLETED
- [ ] Shift mode toggle (optional)
- [ ] "Tracking ON" indicator
- [ ] Battery-efficient update intervals

### Web - Office Portal
- [ ] Live map page (`/map`)
- [ ] Google Maps integration
- [ ] Worker markers with status
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
- [ ] Email on task created (to Office)
- [ ] Email on task assigned (to Worker)
- [ ] Email on task completed (to Partner)
- [ ] Push on new assignment (to Worker)
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

### Security
- [ ] Rate limiting on all endpoints
- [ ] Input validation (class-validator)
- [ ] SQL injection prevention (Prisma handles)
- [ ] XSS prevention
- [ ] CORS configuration
- [ ] Helmet middleware

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
| 2. Authentication | 🔲 Pending | 0% |
| 3. Task Management | 🔲 Pending | 0% |
| 4. Comments & Attachments | 🔲 Pending | 0% |
| 5. Real-time Updates | 🔲 Pending | 0% |
| 6. Location Tracking | 🔲 Pending | 0% |
| 7. Notifications | 🔲 Pending | 0% |
| 8. Polish & Production | 🔲 Pending | 0% |

**Overall Progress**: ~12%

---

## SESSION LOG

| Date | Session Focus | Completed |
|------|---------------|-----------|
| 2026-01-14 | Initial setup | Phase 1 complete |
| | | |

---

*Update this file at the end of each session with completed items.*
