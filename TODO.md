# DOERGO - Implementation Checklist

> **Usage**: Check off items as completed. Use `[x]` for done, `[ ]` for pending, `[~]` for in progress.
> **Last Updated**: 2026-02-11 (Schedule & Members Web UI)
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

## PHASE 3: Task Management ✅ COMPLETE

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
- [x] 60/40 layout (Request Details / Activity)
- [x] Activity timeline with real-time updates
- [x] Premium comments section (scrollable, gradient avatars)
- [x] Cancel request in dropdown menu (best practices UX)

### Web - DISPATCHER View
- [x] Tasks list page (`/tasks`) with all org tasks
- [x] Task detail page (`/tasks/[id]`)
- [x] Technician assignment panel
- [x] Technician dropdown selector (fetches from API)
- [x] Filter by status, priority
- [ ] Bulk actions (optional)

### Mobile - Technician App
- [x] My Tasks tab (assigned tasks only)
- [x] Task card component
- [x] Task detail screen
- [x] Start Task button + confirmation
- [x] Block Task button + reason input
- [x] Complete Task button + confirmation
- [x] Pull-to-refresh

---

## PHASE 3.1: Service Reports ✅ COMPLETE

### Database Schema
- [x] `ServiceReport` model (taskId, summary, workPerformed, workDuration, signatures)
- [x] `ReportAttachment` model (BEFORE/AFTER photos)
- [x] `PartUsed` model (name, partNumber, quantity, unitCost)
- [x] `ReportAttachmentType` enum (BEFORE, AFTER)
- [x] Database migration

### Backend - Task Service
- [x] `reports.service.ts` - CRUD operations with authorization
- [x] `reports.controller.ts` - MessagePattern handlers
- [x] `reports.processor.ts` - BullMQ processor
- [x] `reports.module.ts` - Module registration
- [x] `REPORT_JOB_TYPES` in shared package

### Backend - Gateway
- [x] `CompleteTaskDto` - Validation with class-validator
- [x] `UpdateReportDto` - Partial update validation
- [x] `reports.service.ts` - Direct microservice for READ
- [x] `reports.queue.service.ts` - BullMQ for WRITE
- [x] `reports.controller.ts` - REST endpoints
- [x] `POST /tasks/:taskId/complete` - Complete task with report
- [x] `GET /tasks/:taskId/report` - Get task's service report
- [x] `GET /assets/:assetId/reports` - Get maintenance history
- [x] `PATCH /reports/:id` - Update report (within 24h)
- [x] Parts CRUD endpoints

### Web - Task Detail
- [x] `reportsApi` methods in `lib/api.ts`
- [x] `ServiceReportSection` component
- [x] Photo gallery with before/after tabs
- [x] Parts table with cost totals
- [x] Signature display (technician + customer)
- [x] Duration formatting
- [x] Conditional render for COMPLETED/CLOSED tasks

### Mobile - Completion Flow
- [x] `CompleteTaskInput` interface in api.ts
- [x] `reportsApi.completeTask()` method
- [x] Completion modal with summary input
- [x] Work details (optional) input
- [x] Duration display from timer
- [x] Submit button with loading state

### Seed Data
- [x] 4 sample service reports for completed tasks
- [x] Parts used data (compressor, refrigerant, filters, etc.)
- [x] Before/after photo attachments (placeholder URLs)

---

## CODE QUALITY: DRY/SOLID Refactoring ✅ (2026-01-27)

### Shared Types (packages/shared/src/types/attendance.ts)
- [x] Centralized attendance interfaces (TimeEntry, Break, CompanyLocation, AttendanceStatus)
- [x] Break management types (BreakStatus, BreakSummary)
- [x] Input/query param types (ClockInInput, ClockOutInput, AttendanceHistoryParams)
- [x] Helper functions (isBreakActive, getBreakTypeLabel, getTimeEntryStatusLabel)
- [x] Export from types/index.ts

### Shared Utilities (packages/shared/src/utils/)
- [x] `date.ts` - Date manipulation utilities
  - [x] getStartOfDay(), getEndOfDay() - Date boundary calculations
  - [x] buildDateRangeFilter(), buildSingleDayFilter() - Prisma-compatible filters
  - [x] getStartOfWeek(), getEndOfWeek(), getStartOfMonth(), getEndOfMonth()
  - [x] formatDuration(), formatTime(), formatShortDate(), formatFullDate()
  - [x] calculateMinutesBetween(), toISODateString(), getRelativeDayLabel()
- [x] `query.ts` - Query string building utilities
  - [x] buildQueryString() - Filters null/undefined values automatically
  - [x] buildUrlWithQuery() - Builds complete URLs with query parameters
  - [x] parseQueryString() - Parse query string to object
  - [x] buildPaginationParams(), buildDateRangeParams()
- [x] Export from utils/index.ts

### Mobile App Updates (apps/mobile/src/lib/api.ts)
- [x] Import shared types and enums from @doergo/shared
- [x] Remove duplicate type definitions (~95 lines removed)
- [x] Replace URLSearchParams with buildUrlWithQuery()
- [x] Re-export types for convenience

### Web App Updates (apps/web-app/src/lib/api.ts)
- [x] Import shared types and enums from @doergo/shared
- [x] Remove duplicate type definitions (~70 lines removed)
- [x] Replace 10+ URLSearchParams usages with buildUrlWithQuery()
- [x] Keep web-specific types (AttendanceSummary, BreakSummary with different structure)

### Task-Service Updates (apps/api/task-service/src/modules/attendance/)
- [x] Replace hard-coded status strings with enums:
  - [x] 'CLOCKED_IN' → TimeEntryStatus.CLOCKED_IN (10 occurrences)
  - [x] 'CLOCKED_OUT' → TimeEntryStatus.CLOCKED_OUT
  - [x] 'AUTO_OUT' → TimeEntryStatus.AUTO_OUT
  - [x] 'PENDING' → ApprovalStatus.PENDING
  - [x] 'APPROVED' → ApprovalStatus.APPROVED
  - [x] 'REJECTED' → ApprovalStatus.REJECTED
- [x] Replace manual date range calculations with shared utilities (8+ occurrences)
- [ ] Split large attendance.service.ts (1729 lines) into focused services:
  - [ ] attendance.service.ts - Core clock in/out (7 methods)
  - [ ] break.service.ts - Break management (8 methods)
  - [ ] attendance-reports.service.ts - Reports/analytics (4 methods)
  - [ ] attendance-approvals.service.ts - Approval workflow (5 methods)

---

## PHASE 3.3: Technician Management ✅ COMPLETE (2026-01-30)

### Backend - Gateway Module
- [x] `technicians.module.ts` - Module with microservice clients
- [x] `technicians.controller.ts` - REST endpoints with @Roles guards
- [x] `technicians.service.ts` - Proxy to auth-service & task-service
- [x] DTOs: `CreateTechnicianDto`, `UpdateTechnicianDto`, `ListTechniciansDto`

### API Endpoints
- [x] `GET /technicians` - List with filters (status, type, specialty, search), pagination, sorting
- [x] `POST /technicians` - Create technician (auto-generate password if omitted)
- [x] `GET /technicians/:id` - Get detail with stats (tasks, attendance, performance)
- [x] `PATCH /technicians/:id` - Update profile
- [x] `DELETE /technicians/:id` - Deactivate (soft delete)
- [x] `GET /technicians/:id/performance` - Performance metrics & trends
- [x] `GET /technicians/:id/tasks` - Task history
- [x] `GET /technicians/:id/attendance` - Attendance records
- [x] `GET /technicians/:id/assignments` - Location assignments

### Shared Types (`packages/shared/src/types/technician.ts`)
- [x] `TechnicianProfile` - Full technician detail
- [x] `TechnicianListItem` - List view item
- [x] `TechnicianStats` - Tasks, attendance, performance stats
- [x] `PerformanceMetrics` - Summary, trends, comparison
- [x] `PerformanceTrendPoint` - Time-series data point
- [x] Helper functions:
  - [x] `getTechnicianTypeLabel()`, `getTechnicianTypeColor()`
  - [x] `isTechnicianOnline()` - Check if location updated within 5 min
  - [x] `getAvailabilityStatus()`, `getAvailabilityLabel()`, `getAvailabilityColor()`
  - [x] `formatRating()`
  - [x] `SPECIALTY_OPTIONS` array

### Web - Technicians List (`/technicians`)
- [x] Table with pagination (10 per page)
- [x] Search by name/email
- [x] Filters: Status (active/inactive/all), Type (Full-Time/Freelancer), Specialty
- [x] Sorting: name, email, rating, taskCount, createdAt
- [x] Availability indicators (Available/Busy/At Capacity)
- [x] Online status (green dot)
- [x] Rating display with stars + count
- [x] Active task count vs max daily jobs
- [x] Action dropdown (View, Edit, Deactivate)
- [x] "Add Technician" button (ADMIN & DISPATCHER)
- [x] Max-width container styling

### Web - Create Technician (`/technicians/new`)
- [x] Form: First Name, Last Name, Email (required)
- [x] Optional password (auto-generated if blank)
- [x] Employment Type dropdown (Freelancer/Full-Time)
- [x] Specialty dropdown (6 options)
- [x] Max Daily Jobs input (1-20, default: 5)
- [x] Success modal showing generated password (copy button)
- [x] Permission: ADMIN & DISPATCHER
- [x] Max-width container styling

### Web - Technician Detail (`/technicians/:id`)
- [x] Header: Avatar, name, type badge, status badge, email, rating
- [x] Action menu (Edit, Deactivate/Reactivate)
- [x] **Overview Tab** (default):
  - [x] Stats cards (Completion Rate, On-Time Rate, Tasks Completed, Hours This Week)
  - [x] Active Tasks card
  - [x] Recent Activity card
- [x] **Tasks Tab**:
  - [x] Task history table (Task, Status, Priority, Due Date, Created)
  - [x] Clickable rows → task detail
- [x] **Attendance Tab**:
  - [x] Clock-in/out records table
  - [x] Duration formatting (h:mm)
  - [x] Geofence status badge (In Zone / Out of Zone)
- [x] **Locations Tab**:
  - [x] Location assignment cards
  - [x] Primary location highlight
  - [x] Schedule & effective date display
- [x] **Performance Tab**:
  - [x] Summary cards (3-column)
  - [x] Tasks Completed line chart (Recharts)
  - [x] Performance Metrics dual-axis chart (On-Time Rate + Hours)
  - [x] Period Comparison card with ±% changes
- [x] Max-width container styling (loading, error, main)

### Web - Availability Calendar (`/technicians/availability`)
- [x] View mode toggle: Week / Month
- [x] Technician filter dropdown
- [x] Navigation: Today, Prev, Next
- [x] Calendar grid with weekday headers
- [x] Week view: Technician names (up to 4, "+N more")
- [x] Month view: Colored dots + count
- [x] Today highlight (blue circle)
- [x] Summary cards (Total, Online, Coverage Gaps)
- [x] Legend (Online, Offline, Today)
- [x] Permission: ADMIN & DISPATCHER
- [x] Max-width container styling

### Permissions Update
- [x] DISPATCHER can now create technicians
- [x] DISPATCHER can now edit technicians
- [x] DISPATCHER can now deactivate technicians
- [x] Updated `canManage` check in all technician pages

---

## PHASE 3.4: Invitation System ✅ COMPLETE (2026-02-04)

### Database Schema
- [x] `Invitation` model (codeHash, targetRole, status, expiresAt, technicianType, workMode, specialty, maxDailyJobs)
- [x] `InvitationStatus` enum (PENDING, ACCEPTED, EXPIRED, REVOKED)
- [x] Database migration: `add_invitation_system`

### Backend - Auth Service
- [x] `invitation.service.ts` - Create, validate, accept, revoke, list
- [x] SHA-256 hashed invitation codes (plaintext never stored)
- [x] Code format: 6-8 character alphanumeric, auto-uppercased
- [x] Configurable expiration (1-720 hours, default: 72)
- [x] Accept creates user with pre-assigned role, org, technician settings

### Backend - Gateway
- [x] `invitations.module.ts` - Module with microservice clients
- [x] `invitations.controller.ts` - REST endpoints with rate limiting
- [x] DTOs: `CreateInvitationDto`, `AcceptInvitationDto`, `ListInvitationsDto`
- [x] `POST /invitations` - Create invitation code (10/min rate limit)
- [x] `GET /invitations` - List org invitations with status/pagination filters
- [x] `GET /invitations/validate/:code` - Public validation (10/min rate limit)
- [x] `POST /invitations/accept` - Public accept & register (5/min rate limit)
- [x] `DELETE /invitations/:id` - Revoke invitation

### Shared Types
- [x] `Invitation` interface
- [x] `InvitationValidation` interface
- [x] `CreateInvitationInput` interface

### Web - Invitations Page
- [x] Invitations management page (`/invitations`)
- [x] Invitation list with status badges
- [x] Create invitation dialog (role, type, workMode, specialty, maxDailyJobs)
- [x] Revoke invitation with confirmation

### Mobile - Registration
- [x] Registration screen with invitation code input
- [x] Code validation before form submission
- [x] Auto-login after successful registration

### Seed Data
- [x] Pending technician invitation (FULL_TIME, ON_SITE, Electrical)
- [x] Pending dispatcher invitation

---

## PHASE 3.5: WorkMode Decoupling ✅ COMPLETE (2026-02-04)

### Concept
Decoupled two concerns previously conflated in `TechnicianType`:
- **TechnicianType** (FREELANCER | FULL_TIME) = billing/employment model (who pays expenses)
- **WorkMode** (ON_SITE | ON_ROAD | HYBRID) = where the technician works

### Database Schema
- [x] `WorkMode` enum (ON_SITE, ON_ROAD, HYBRID)
- [x] `workMode` field on User model (default: HYBRID)
- [x] `workMode` field on Invitation model
- [x] Database migration: `add_work_mode`
- [x] Data migration: FULL_TIME→ON_SITE, FREELANCER→ON_ROAD

### Shared Types
- [x] `WorkMode` enum in `@doergo/shared`
- [x] `workMode` added to: TechnicianProfile, TechnicianListItem, CreateTechnicianInput, UpdateTechnicianInput, TechniciansQueryParams
- [x] `workMode` added to: Invitation, InvitationValidation, CreateInvitationInput
- [x] Helper functions: `getWorkModeLabel()`, `getWorkModeColor()`, `canUseAttendance()`, `canBeAssignedToLocation()`

### Backend - Gate Logic Changes
- [x] Attendance service: gate on `workMode === ON_ROAD` instead of `technicianType !== FULL_TIME`
- [x] Locations service: gate on `workMode === ON_ROAD` instead of `technicianType !== FULL_TIME`
- [x] Technicians service: `workMode` in availability query response

### Backend - Auth Service
- [x] Login response includes `workMode`
- [x] `validateToken` includes `workMode`
- [x] Users service: `workMode` in all CRUD operations and response mappings
- [x] Invitation service: `workMode` in create, validate, and accept flows

### Backend - Gateway DTOs
- [x] `create-technician.dto.ts`: `workMode` field (default: HYBRID)
- [x] `update-technician.dto.ts`: `workMode` field
- [x] `list-technicians.dto.ts`: `workMode` filter
- [x] `invitations/dto/index.ts`: `workMode` field

### Mobile
- [x] `api.ts`: `WorkMode` in User and LoginResponse types
- [x] `_layout.tsx`: Tab visibility gated on workMode:
  - ON_ROAD: Tasks tab only (no Clock)
  - ON_SITE: Clock tab only (no Tasks)
  - HYBRID: Both Tasks + Clock

### Web
- [x] `api.ts`: `WorkMode` import/export, `workMode` in TechnicianAvailability
- [x] Technicians list: WorkMode filter dropdown + badge column
- [x] Create technician: WorkMode select field
- [x] Create invitation dialog: WorkMode select field

### Seed Data
- [x] technician1 (FULL_TIME): `workMode: ON_SITE`
- [x] technician2 (FREELANCER): `workMode: ON_ROAD`
- [x] Pending technician invitation: `workMode: ON_SITE`

---

## PHASE 3.6: Dynamic Mobile Onboarding ✅ COMPLETE (2026-02-10)

### Concept
Decoupled account creation from organization membership. New users register without an org, then choose a path: Create Org, Join by Code (with admin approval), or Use Invitation Code. Existing users are unaffected (`onboardingCompleted: true`).

### Phase 3.6.1: Schema Changes & Migration
- [x] `JoinPolicy` enum (OPEN, INVITE_ONLY, CLOSED)
- [x] `JoinRequestStatus` enum (PENDING, APPROVED, REJECTED, CANCELED)
- [x] `JoinRequest` model (userId, organizationId, message, status, reviewedById, rejectionReason, assignedRole, assignedPlatform)
- [x] `joinCodeHash` and `joinPolicy` fields on Organization model
- [x] `onboardingCompleted` field on User model (default: true)
- [x] Database migration with `UPDATE "users" SET "onboardingCompleted" = true`

### Phase 3.6.2: Shared Package Updates
- [x] `packages/shared/src/types/onboarding.ts` - All onboarding types (JoinPolicy, JoinRequestStatus, JoinRequest, OnboardingStatus, OrgCodeValidation, CreateOrganizationInput, etc.)
- [x] `packages/shared/src/constants/onboarding.ts` - ORG_CODE_LENGTH, ORG_CODE_CHARSET, limits, helpers
- [x] `packages/shared/src/utils/crypto.ts` - Extracted shared `hashCode()` function
- [x] Updated types/index.ts and constants/index.ts exports
- [x] Updated `CurrentUserData` with `onboardingCompleted`, nullable `organizationId`

### Phase 3.6.3: OnboardingCompleteGuard
- [x] `@SkipOnboardingCheck()` decorator
- [x] `OnboardingCompleteGuard` - Returns 403 if `onboardingCompleted === false`
- [x] Guard order: ThrottlerGuard → JwtAuthGuard → RolesGuard → OnboardingCompleteGuard
- [x] `@SkipOnboardingCheck()` on `GET /auth/me` and `POST /auth/logout`

### Phase 3.6.4: Auth Service Backend
- [x] `register()` creates orphan user when `companyName` is empty (null org, onboardingCompleted: false)
- [x] `login()` and `validateToken()` include `onboardingCompleted` in response
- [x] Onboarding module: `onboarding.service.ts`, `onboarding.controller.ts`, `onboarding.module.ts`
- [x] `createOrganization()` - Path A: Create org, generate join code, update user → ADMIN
- [x] `validateOrgCode()` - Path B: Hash code, find org by joinCodeHash
- [x] `submitJoinRequest()` - Path B: Validate code, check limits, create PENDING request
- [x] `acceptInvitationForExistingUser()` - Path C: Validate invitation, update user
- [x] `getOnboardingStatus()` - Return status + pending request info
- [x] `listJoinRequests()` - Admin: paginated list
- [x] `approveJoinRequest()` - Admin: update user + mark APPROVED with push notification
- [x] `rejectJoinRequest()` - Admin: mark REJECTED with push notification
- [x] `cancelJoinRequest()` - User: cancel own request
- [x] `regenerateJoinCode()` - Generate new 8-char code
- [x] `updateJoinPolicy()` - Update org join policy

### Phase 3.6.5: Gateway Layer
- [x] `RegisterDto.companyName` made optional
- [x] Onboarding module with `@SkipOnboardingCheck()`:
  - [x] `POST /onboarding/create-org` - Create organization (Path A)
  - [x] `GET /onboarding/validate-org-code/:code` - Validate org code (Path B)
  - [x] `POST /onboarding/join-by-code` - Submit join request (Path B)
  - [x] `POST /onboarding/accept-invitation` - Accept invitation (Path C)
  - [x] `GET /onboarding/status` - Get onboarding status
  - [x] `DELETE /onboarding/join-requests/:id` - Cancel own join request
- [x] Join Requests module (ADMIN/DISPATCHER):
  - [x] `GET /join-requests` - List pending requests
  - [x] `PATCH /join-requests/:id/approve` - Approve with role assignment
  - [x] `PATCH /join-requests/:id/reject` - Reject with reason
- [x] Organizations module:
  - [x] `GET /organizations/join-code` - Get org join code info
  - [x] `POST /organizations/regenerate-join-code` - Generate new join code
  - [x] `PATCH /organizations/settings` - Update join policy

### Phase 3.6.6: Mobile App
- [x] `onboardingApi` in api.ts (getStatus, createOrganization, validateOrgCode, submitJoinRequest, acceptInvitation, cancelJoinRequest)
- [x] `needsOnboarding` in auth context (derived from `user.onboardingCompleted`)
- [x] `refreshUser()` method in auth context
- [x] 3-way navigation guard (auth → onboarding → app)
- [x] Simplified register screen (no company name, no invitation code)
- [x] `(onboarding)/_layout.tsx` - Stack layout
- [x] `choose-path.tsx` - 3 option cards (Create Org, Join Org, Use Invitation)
- [x] `create-org.tsx` - Path A: Name + address → create org → main app
- [x] `join-org.tsx` - Path B: Org code → verify → message → submit request
- [x] `use-invitation.tsx` - Path C: Invitation code → verify → accept → main app
- [x] `pending-approval.tsx` - Waiting screen with 30s polling, cancel, retry

### Phase 3.6.7: Web App
- [x] `joinRequestsApi` in api.ts (list, approve, reject)
- [x] `organizationsApi` in api.ts (getJoinCode, regenerateJoinCode, updateSettings)
- [x] Join Requests page (`/join-requests`) with approve/reject dialogs
- [x] Settings page (`/settings`) with join code + join policy management
- [x] "Join Requests" nav item in sidebar (ADMIN + DISPATCHER)

### Phase 3.6.8: Seed Data
- [x] `onboardingCompleted: true` for all 4 existing users
- [x] Org join code: `ACME2026` (SHA-256 hashed), `joinPolicy: OPEN`
- [x] Orphan user: `newuser@example.com / password123` (no org, onboardingCompleted: false)
- [x] Pending join request from orphan user to Acme Corp

### Phase 3.6.9: Push Notifications
- [x] `@EventPattern('join_request_submitted')` → websocket to org
- [x] `@EventPattern('join_request_approved')` → push + websocket to user
- [x] `@EventPattern('join_request_rejected')` → push + websocket to user

---

## PHASE 3.7: Schedule & Members Web UI ✅ COMPLETE (2026-02-11)

### Concept
Built the web frontend for schedule management and organization members management. Extracted technician detail tabs into separate components for maintainability.

### Tab Extraction (Refactor)
- [x] Extracted 5 existing inline tabs from `technicians/[id]/page.tsx` (~867 lines → ~335 lines)
- [x] `_components/overview-tab.tsx` - Stats cards + recent activity
- [x] `_components/tasks-tab.tsx` - Task history table
- [x] `_components/attendance-tab.tsx` - Clock-in/out records
- [x] `_components/locations-tab.tsx` - Location assignment cards
- [x] `_components/performance-tab.tsx` - Recharts line charts + period comparison
- [x] `_components/index.ts` - Barrel exports

### Schedule Tab (New)
- [x] `_components/schedule-tab.tsx` - Weekly schedule editor
- [x] Read mode: table with 7 rows (Mon-Sun), formatted times ("9:00 AM"), active/off badges
- [x] Edit mode: `<input type="time">` for start/end, Switch toggle, notes Input
- [x] Empty state with "Set Schedule" CTA
- [x] Uses `techniciansApi.getSchedule()` / `techniciansApi.setSchedule()`

### Time-Off Tab (New)
- [x] `_components/time-off-tab.tsx` - Time-off request management
- [x] Status filter Select (All/Pending/Approved/Rejected/Canceled)
- [x] Table: dates, duration, reason, status badges, reviewer, actions dropdown
- [x] "Request Time Off" Dialog with Calendar `mode="range"` + Textarea for reason
- [x] Approve AlertDialog confirmation
- [x] Reject Dialog with rejection reason Textarea
- [x] Cancel action for own pending requests

### Members Management (Backend)
- [x] `listOrgMembers()` in users.service.ts - paginated member list with search + role filter
- [x] `updateMemberRole()` in users.service.ts - validates can't change own role, can't demote last ADMIN
- [x] `removeMember()` in users.service.ts - validates can't remove self, can't remove last ADMIN
- [x] 3 MessagePattern handlers in users.controller.ts (list_org_members, update_member_role, remove_member)
- [x] `GET /organizations/members` (ADMIN, DISPATCHER) - list org members
- [x] `PATCH /organizations/members/:id/role` (ADMIN only) - update member role/permissions
- [x] `DELETE /organizations/members/:id` (ADMIN only) - remove member
- [x] Gateway DTOs: ListMembersQueryDto, UpdateMemberRoleDto

### Members Page (Frontend)
- [x] `/members` page with search, role filter, pagination
- [x] Table: Name + email, Role badge, Platform badge, Status, Joined date, Actions dropdown
- [x] Edit Role Dialog: role Select, platform Select, 4 permission Checkboxes (auto-defaults by role)
- [x] Remove AlertDialog with red confirmation
- [x] "Invite Member" button links to `/invitations`
- [x] Only ADMIN sees action dropdowns (can't act on self)

### Sidebar Updates
- [x] ADMIN: added "Members" (`/members`, Users icon) + "Schedule" (`/technicians/availability`, Calendar icon)
- [x] DISPATCHER: added "Members" (`/members`, Users icon), updated Schedule URL

### API Client
- [x] `OrgMember` type + `UpdateMemberRoleInput` type in api.ts
- [x] `organizationsApi.getMembers()`, `.updateMemberRole()`, `.removeMember()` methods

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

## PHASE 5: Real-time Updates ✅ COMPLETE

### Backend - Notification Service
- [x] Socket.IO gateway setup
- [x] Authentication middleware (`authenticate` event)
- [x] Room management (org, role, user, task)
- [x] Event broadcasting methods
- [x] Socket.IO Admin UI integration (@socket.io/admin-ui)
- [x] HTTP monitoring endpoints (/socket/stats, /socket/clients, /health)
- [x] Enhanced logging (CONNECT/DISCONNECT/AUTH/EMIT prefixes)
- [x] Message tracking (onAny/onAnyOutgoing middleware)

### Backend - Integration
- [x] Emit `task.created` from task-service
- [x] Emit `task.updated` from task-service
- [x] Emit `task.assigned` from task-service
- [x] Emit `task.statusChanged` from task-service
- [x] Emit `task.commentAdded` from task-service
- [x] Emit `task.attachmentAdded` from task-service
- [x] Emit `worker.locationUpdated` from tracking-service

### Web - CLIENT & DISPATCHER
- [x] Socket.IO client setup (lib/socket.ts)
- [x] Connect on login with user auth
- [x] Disconnect on logout
- [x] Listen for location updates (Live Map)
- [x] Real-time position updates on map

### Mobile - Technician App
- [x] Location tracking hook (useLocationTracking)
- [x] Background location updates
- [x] Send location with taskId to API

---

## PHASE 5.1: Route Tracking ✅ COMPLETE

### Backend - Database
- [x] LocationHistory model (stores GPS points)
- [x] Task route fields (routeStartedAt, routeEndedAt, routeDistance)
- [x] Database migration

### Backend - Tracking Service
- [x] Store location in LocationHistory when task is EN_ROUTE
- [x] Haversine distance calculation
- [x] Incremental distance updates on Task
- [x] `GET /tracking/workers/:id/current-route` endpoint
- [x] `GET /tracking/tasks/:taskId/route` endpoint

### Backend - Task Service
- [x] Set routeStartedAt when status → EN_ROUTE
- [x] Set routeEndedAt when status → ARRIVED
- [x] Reset route data on new EN_ROUTE

### Mobile - Technician App
- [x] Auto-start tracking when status changes to EN_ROUTE
- [x] Auto-stop tracking when status changes to ARRIVED
- [x] Show tracking indicator (not manual toggle)

### Web - DISPATCHER View
- [x] Live Map page (`/live-map`)
- [x] OpenStreetMap with Leaflet
- [x] Technician markers with online/offline status
- [x] Route polyline visualization
- [x] Route info panel (distance, time, points)
- [x] Auto-refresh route every 10 seconds
- [x] Task detail shows route tracking data

---

## PHASE 6: Location Tracking ✅ COMPLETE

### Backend - Tracking Service
- [x] `POST /tracking/location` - Update technician location
- [x] `GET /tracking/workers` - Get all active technicians (DISPATCHER)
- [x] `GET /tracking/workers/:id` - Get specific technician
- [x] Store in `WorkerLastLocation` table
- [x] Store in `LocationHistory` table (when EN_ROUTE)
- [x] Emit `worker.locationUpdated` event

### Backend - Gateway
- [x] Proxy `/tracking/*` routes
- [x] @Roles(TECHNICIAN) for location updates
- [x] @Roles(DISPATCHER) for worker queries

### Mobile - Technician App
- [x] Request location permissions
- [x] Background location tracking (expo-location)
- [x] Auto-start tracking when task EN_ROUTE
- [x] Auto-stop tracking when task ARRIVED
- [x] "Tracking active" indicator
- [x] Send taskId with location updates

### Web - DISPATCHER View (Live Map)
- [x] Live map page (`/live-map`)
- [x] OpenStreetMap + Leaflet integration
- [x] Technician markers with status
- [x] Task location markers
- [x] Click marker for details (popup)
- [x] Auto-refresh positions (polling)
- [x] Route visualization (polyline)

---

## PHASE 7: Notifications 🔶 (Push ✅, Email 🔲)

### Backend - BullMQ Infrastructure ✅
- [x] BullMQ queue setup (task queue implemented)
- [x] Shared queue configuration (`@doergo/shared/queues`)
- [x] Gateway producer (TasksQueueService)
- [x] Task-service processor (TasksProcessor)
- [x] Bull Board monitoring (`/admin/queues`)
- [x] Exactly-once job processing (prevents duplicate tasks)
- [x] Automatic retries with exponential backoff
- [x] Job persistence across restarts

### Backend - Push Notifications ✅ COMPLETE (2026-01-30)
- [x] `UserPushToken` model for storing Expo push tokens
- [x] Database migration: `add_user_push_tokens`
- [x] Push service using `expo-server-sdk` (Expo Push API)
- [x] Gateway endpoints: `POST /users/push-token`, `DELETE /users/push-token/:token`
- [x] MessagePattern handlers for token registration/removal
- [x] Push notifications for task events (assigned, status changed, comments)
- [x] Push notifications for attendance events (clock in/out)

### Mobile - Push Notifications ✅ COMPLETE (2026-01-30)
- [x] `usePushNotifications` hook with permission handling
- [x] Android notification channels (default, tasks, attendance)
- [x] Notification tap navigates to task detail
- [x] Push token cleanup on logout
- [x] expo-device dependency for device info

### Backend - Email Notifications 🔲
- [ ] Email job processor
- [ ] Email templates (task created, assigned, completed)
- [ ] SMTP configuration and Nodemailer integration

### Web - In-App Notifications 🔲
- [ ] Notification bell icon
- [ ] Notification dropdown
- [ ] Mark as read
- [ ] Notification preferences page

---

## PHASE 7.1: Attendance Foundation ✅ COMPLETE (2026-01-26)

- [x] `TechnicianType` enum (FREELANCER, FULL_TIME)
- [x] `technicianType` field on User model
- [x] `CompanyLocation` model (name, address, lat, lng, geofenceRadius)
- [x] Database migration: `add_technician_type_and_company_locations`
- [x] Locations module in task-service (service, processor, controller)
- [x] Locations module in gateway (controller, service, queue service, DTOs)
- [x] CRUD API endpoints: POST/GET/PATCH/DELETE `/api/v1/locations`
- [x] Shared types and constants (`ATTENDANCE_CONSTANTS`, `LOCATION_JOB_TYPES`)
- [x] Seed data: 3 sample company locations

---

## PHASE 7.2: Scheduling & Availability ✅ COMPLETE (2026-01-30)

### Database Schema
- [x] `TechnicianSchedule` model (weekly work schedule with day/start/end times)
- [x] `TimeOff` model (vacation/sick leave with approval workflow)
- [x] `TimeOffStatus` enum (PENDING, APPROVED, REJECTED, CANCELED)
- [x] Database migration: `add_technician_schedules_and_time_off`

### Backend - Task Service
- [x] `technicians.service.ts` - Schedule, time-off, and availability logic
- [x] `setSchedule()` - Upsert weekly schedule entries
- [x] `getSchedule()` - Get weekly schedule for technician
- [x] `requestTimeOff()` - Create time-off request
- [x] `getTimeOff()` - Get time-off requests with status filter
- [x] `approveTimeOff()` - Approve/reject time-off with reason
- [x] `cancelTimeOff()` - Cancel own pending time-off request
- [x] `getAvailability()` - Calculate availability for all technicians on date

### Backend - Gateway
- [x] REST endpoints with proper route ordering:
  - [x] `GET /technicians/availability` - All availability for date
  - [x] `PATCH /technicians/time-off/:id/approve` - Approve/reject
  - [x] `DELETE /technicians/time-off/:id` - Cancel request
  - [x] `GET /technicians/:id/schedule` - Get schedule
  - [x] `POST /technicians/:id/schedule` - Set schedule
  - [x] `GET /technicians/:id/time-off` - Get time-off requests
  - [x] `POST /technicians/:id/time-off` - Request time off

### Web - Availability Calendar
- [x] Updated `/technicians/availability` to use real API data
- [x] Fetches availability for each day in view
- [x] Shows scheduled/time-off/not-scheduled status with tooltips
- [x] Displays work hours and time-off reasons
- [x] Summary cards with real counts
- [x] Week and month views

---

## PHASE 7.3: Technician Assignment 🔲

- [ ] `TechnicianAssignment` model (user → location mapping)
- [ ] Assignment CRUD endpoints
- [ ] Location-based schedule support

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
| 3. Task Management | ✅ Complete | 100% |
| 3.1 Service Reports | ✅ Complete | 100% |
| 3.2 Role System Overhaul | ✅ Complete | 100% |
| 3.3 Technician Management | ✅ Complete | 100% |
| 3.4 Invitation System | ✅ Complete | 100% |
| 3.5 WorkMode Decoupling | ✅ Complete | 100% |
| 3.6 Dynamic Mobile Onboarding | ✅ Complete | 100% |
| 3.7 Schedule & Members Web UI | ✅ Complete | 100% |
| 4. Comments & Attachments | 🔲 Pending | 0% |
| 5. Real-time Updates | ✅ Complete | 100% |
| 5.1 Route Tracking | ✅ Complete | 100% |
| 6. Location Tracking | ✅ Complete | 100% |
| 7. Notifications (Push) | ✅ Complete | 100% |
| 7. Notifications (Email) | 🔲 Pending | 0% |
| 7.1 Attendance Foundation | ✅ Complete | 100% |
| 7.2 Scheduling & Availability | ✅ Complete | 100% |
| 8. Polish & Production | ✅ Critical Fixed | 25% |
| Code Quality | ✅ DRY/SOLID | 90% |

**Overall Progress**: ~90%

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
| 2026-01-19 | Phase 3 Complete | Mobile task detail block reason modal, updated TODO.md checklist - Phase 3 fully complete |
| 2026-01-19 | API DRY Optimization | Created shared validators, constants, decorators, guards; updated all API services to use shared utilities |
| 2026-01-19 | BullMQ Job Queue | Implemented BullMQ for exactly-once task processing, Bull Board monitoring, fixed duplicate task creation bug |
| 2026-01-20 | Route Tracking | LocationHistory model, Haversine distance calc, route API endpoints, auto-tracking on EN_ROUTE |
| 2026-01-20 | Live Map Enhancement | Route polyline visualization, route info panel, task detail route data section |
| 2026-01-20 | Socket.IO Monitoring | Admin UI integration, stats endpoints (/socket/stats, /socket/clients), enhanced logging |
| 2026-01-21 | Task Detail UI | 60/40 layout, activity timeline, premium comments, cancel in dropdown menu |
| 2026-01-22 | ServiceReport Feature | ServiceReport/ReportAttachment/PartUsed models, reports module (task-service + gateway), ServiceReportSection web component, mobile completion modal, seed data with 4 sample reports |
| 2026-01-26 | Attendance Foundation | Phase 7.1 - TechnicianType enum, CompanyLocation model, Locations CRUD API, seed data |
| 2026-01-26 | Role System Overhaul | Phase 3.2 - ADMIN role, Platform enum, granular permissions, migrations |
| 2026-01-27 | DRY/SOLID Refactoring | Shared attendance types, date utilities, query string builder, removed duplicate types from mobile/web (~165 lines), replaced hard-coded strings with enums |
| 2026-01-30 | Technician Management | Phase 3.3 - Full technician CRUD API (9 endpoints), shared types (TechnicianProfile, TechnicianStats, PerformanceMetrics), web pages (list, create, detail with 5 tabs, availability calendar), DISPATCHER can now manage technicians |
| 2026-01-30 | Push Notifications | Phase 6 (Push) - UserPushToken model, Expo Push API integration, task/attendance event notifications, mobile usePushNotifications hook with Android channels, notification tap navigation |
| 2026-01-30 | Availability Calendar | Phase 7.2 - TechnicianSchedule and TimeOff models, schedule/time-off CRUD endpoints, time-off approval workflow, availability query API, web calendar with real API data |
| 2026-02-04 | Invitation System | Phase 3.4 - Invitation model, SHA-256 hashed codes, full REST API (create/validate/accept/revoke), rate limiting, web invitations page, mobile registration screen, seed data |
| 2026-02-04 | WorkMode Decoupling | Phase 3.5 - WorkMode enum (ON_SITE/ON_ROAD/HYBRID), decoupled from TechnicianType (billing-only), backend gate logic, mobile tab visibility, web filters/forms, data migration |
| 2026-02-10 | Dynamic Mobile Onboarding | Phase 3.6 - Decoupled registration from org membership, 3-path onboarding wizard (Create Org/Join by Code/Use Invitation), JoinRequest model with approval workflow, OnboardingCompleteGuard, 5 mobile onboarding screens, web join-requests + settings pages, push notifications for join request lifecycle |
| 2026-02-11 | Schedule & Members Web UI | Phase 3.7 - Extracted 5 technician detail tabs into `_components/`, added Schedule tab (weekly editor with read/edit modes), Time-Off tab (request/approve/reject/cancel), Members backend (listOrgMembers/updateMemberRole/removeMember with safety guards), Members page (search/filter/edit role/remove), sidebar nav updates |

---

## SHARED MODULES REFERENCE

**Import from `@doergo/shared`:**

```typescript
// Microservices
import { SERVICE_NAMES, createMicroserviceOptions, createClientOptions } from '@doergo/shared';

// BullMQ Queues
import {
  createBullMQConfig,      // BullModule.forRootAsync() config
  QUEUE_NAMES,             // { TASKS, NOTIFICATIONS, TRACKING }
  TASK_JOB_TYPES,          // { CREATE, UPDATE, ASSIGN, ... }
  DEFAULT_JOB_OPTIONS,     // { CRITICAL, STANDARD, FAST }
} from '@doergo/shared';

// API Responses
import { success, error, paginated, ErrorCodes } from '@doergo/shared';

// Types & Enums
import { Role, AccessLevel, TaskStatus, TaskPriority, ApiResponse } from '@doergo/shared';
// Role: CLIENT | DISPATCHER | TECHNICIAN
// AccessLevel: NONE | TASKS_ONLY | TASKS_ASSIGN | FULL

// NestJS Decorators (use in controllers)
import { Roles, Public, CurrentUser, CurrentUserData } from '@doergo/shared';

// NestJS Guards
import { RolesGuard, hasRole, isClient, isDispatcher, isTechnician } from '@doergo/shared';

// Validation Decorators (use in DTOs)
import {
  EmailField,           // Email validation + lowercase transform
  PasswordField,        // Basic password (min 1 char)
  StrongPasswordField,  // Strong password (8+ chars, uppercase, lowercase, number)
  NameField,            // Name validation + optional capitalize
  CompanyNameField,     // Company name (2-100 chars)
  TokenField,           // Non-empty string token
} from '@doergo/shared';

// Auth Constants
import {
  MAX_SESSIONS_PER_USER,          // 5
  MAX_FAILED_ATTEMPTS,            // 5
  LOCKOUT_DURATION_MINUTES,       // 15
  PASSWORD_RESET_EXPIRATION_HOURS,// 1
  REFRESH_TOKEN_GRACE_PERIOD_SECONDS, // 60
  BCRYPT_COST_FACTOR,             // 12
  PASSWORD_MIN_LENGTH,            // 8
  PASSWORD_MAX_LENGTH,            // 128
} from '@doergo/shared';

// Task Constants
import {
  STATUS_TRANSITIONS,             // Record<TaskStatus, TaskStatus[]>
  isValidStatusTransition,        // (current, new) => boolean
  canRoleSetStatus,               // (role, status) => boolean
  ACTIVE_STATUSES,                // [NEW, ASSIGNED, IN_PROGRESS, BLOCKED]
  TERMINAL_STATUSES,              // [COMPLETED, CANCELED, CLOSED]
  TASK_TITLE_MAX_LENGTH,          // 200
  TASK_DESCRIPTION_MAX_LENGTH,    // 5000
} from '@doergo/shared';

// React Components (for web apps)
import { AnimatedLogo } from '@doergo/shared/components';
// Props: size ('small' | 'default' | 'large'), variant ('light' | 'dark'), primaryColor (hex)

// Date Utilities (2026-01-27)
import {
  getStartOfDay, getEndOfDay,         // Date boundary calculations
  buildDateRangeFilter,                // Prisma-compatible date filter
  buildSingleDayFilter,                // Single day filter
  getStartOfWeek, getEndOfWeek,        // Week boundaries
  getStartOfMonth, getEndOfMonth,      // Month boundaries
  formatDuration,                      // "1h 30m" format
  formatTime, formatShortDate,         // Display formatting
  formatFullDate, getRelativeDayLabel, // "Today", "Yesterday", etc.
  calculateMinutesBetween,             // Minutes between dates
  toISODateString,                     // "YYYY-MM-DD" format
} from '@doergo/shared';

// Query String Utilities (2026-01-27)
import {
  buildQueryString,        // Build query string from object (filters null/undefined)
  buildUrlWithQuery,       // Build URL with query string
  parseQueryString,        // Parse query string to object
  buildPaginationParams,   // { page, limit } helper
  buildDateRangeParams,    // { startDate, endDate } helper
} from '@doergo/shared';

// Attendance Types (2026-01-27)
import {
  TimeEntry, Break, CompanyLocation, AttendanceStatus,
  BreakStatus, ClockInInput, ClockOutInput,
  AttendanceHistoryParams, PaginatedResponse,
} from '@doergo/shared';

// Attendance Helper Functions
import { isBreakActive, getBreakTypeLabel, getTimeEntryStatusLabel } from '@doergo/shared';

// Technician Types (2026-01-30)
import {
  TechnicianProfile,           // Full technician detail
  TechnicianListItem,          // List view item
  TechnicianStats,             // Tasks, attendance, performance stats
  PerformanceMetrics,          // Summary, trends, comparison
  PerformanceTrendPoint,       // Time-series data point
  TechnicianType,              // FREELANCER | FULL_TIME
} from '@doergo/shared';

// Technician Helper Functions
import {
  getTechnicianTypeLabel,      // "Freelancer" | "Full-Time"
  getTechnicianTypeColor,      // Badge color classes
  isTechnicianOnline,          // Check if location updated within 5 min
  getAvailabilityStatus,       // 'available' | 'busy' | 'at_capacity'
  getAvailabilityLabel,        // "Available" | "Busy" | "At Capacity"
  getAvailabilityColor,        // Badge color classes
  formatRating,                // Rating display string
  SPECIALTY_OPTIONS,           // Specialty dropdown options
} from '@doergo/shared';

// Schedule & Time-Off Types (2026-01-30)
import {
  ScheduleEntry,               // Weekly schedule entry (day, start, end, isActive)
  TimeOffStatus,               // PENDING | APPROVED | REJECTED | CANCELED
  TimeOffRequest,              // Time-off request with status
  TechnicianAvailability,      // Availability for single technician
  AvailabilityResponse,        // Bulk availability response
} from '@doergo/shared';

// WorkMode Types (2026-02-04)
import {
  WorkMode,                    // ON_SITE | ON_ROAD | HYBRID
  getWorkModeLabel,            // "On-Site" | "On-Road" | "Hybrid"
  getWorkModeColor,            // Badge color classes
  canUseAttendance,            // true for ON_SITE or HYBRID
  canBeAssignedToLocation,     // true for ON_SITE or HYBRID
} from '@doergo/shared';

// Invitation Types (2026-02-04)
import {
  Invitation,                  // Full invitation interface
  InvitationValidation,        // Validation response
  CreateInvitationInput,       // Create invitation input
  InvitationStatus,            // PENDING | ACCEPTED | EXPIRED | REVOKED
} from '@doergo/shared';

// Onboarding Types (2026-02-10)
import {
  JoinPolicy,                  // OPEN | INVITE_ONLY | CLOSED
  JoinRequestStatus,           // PENDING | APPROVED | REJECTED | CANCELED
  JoinRequest,                 // Full join request interface
  OnboardingStatus,            // Onboarding status response
  OrgCodeValidation,           // Org code validation response
  CreateOrganizationInput,     // Create org input (name, address?)
  SubmitJoinRequestInput,      // Join request input (orgCode, message?)
  ApproveJoinRequestInput,     // Approve input (role, platform?, etc.)
  RejectJoinRequestInput,      // Reject input (reason?)
} from '@doergo/shared';

// Onboarding Constants
import {
  ORG_CODE_LENGTH,             // 8
  ORG_CODE_CHARSET,            // Excludes I, O, 0, 1
  JOIN_REQUEST_MAX_PENDING_PER_USER,  // 3
  JOIN_REQUEST_MESSAGE_MAX_LENGTH,    // 500
  getJoinPolicyLabel,          // "Open" | "Invite Only" | "Closed"
  getJoinRequestStatusLabel,   // Status display labels
  getJoinRequestStatusColor,   // Status badge colors
} from '@doergo/shared';

// Crypto Utilities (2026-02-10)
import { hashCode } from '@doergo/shared';  // SHA-256 hash for codes

// Onboarding Guard (2026-02-10)
import { SkipOnboardingCheck, OnboardingCompleteGuard } from '@doergo/shared';
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
| ADMIN | Dashboard, My Tasks, Create Task, Invoices, Invitations, Join Requests, Members, Schedule, Settings |
| DISPATCHER | Dashboard, All Tasks, Technicians, Live Map, Managed Orgs, Invitations, Join Requests, Members, Schedule |
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
