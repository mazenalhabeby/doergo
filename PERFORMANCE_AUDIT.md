# Performance & Security Audit - 2026-04-02

## Round 1 (13 fixes)

1. **N+1 queries** - `Promise.all()` batching + `groupBy` aggregations in `users.service.ts`
2. **Unbounded queries** - `take` limits, `select` instead of `include`, `_count` in `tasks.service.ts`
3. **Socket.IO memory leak** - listener cleanup (`offAny`/`offAnyOutgoing`) on disconnect in `websocket.gateway.ts`
4. **GET request deduplication** - in-flight promise cache in mobile `api.ts`
5. **Component unmount race condition** - `cancelled` flag pattern in task detail `[id].tsx`
6. **Deprecated role check** - removed `CLIENT` fallback in `index.tsx`
7. **Partial failure handling** - `Promise.allSettled` for attendance screen in `attendance.tsx`
8. **Location tracking timeout** - 10s `Promise.race` timeout in `useLocationTracking.ts`
9. **Calendar performance** - O(n*m) to O(1) with pre-computed `Set` in `index.tsx`
10. **MIME type validation** - format validation + fileName length checks in `attachments.service.ts`
11. **Availability endpoint restriction** - removed TECHNICIAN role access + date validation in `technicians.controller.ts`
12. **S3 delete error logging** - improved error logging with user ID in `users.controller.ts`
13. **Status counts optimization** - eliminated duplicate `task.count` query in `tasks.service.ts`

## Round 2 (6 fixes)

14. **Token refresh exponential backoff** - replaced fixed 100ms polling with exponential backoff (50, 100, 200, 400, 800ms) in `auth.service.ts`
15. **Database indexes** - 7 new indexes via Prisma migration `add_performance_indexes`:
    - `Task [assignedToId, status]` - technician task stats groupBy, suggested technicians _count
    - `Task [dueDate]` - due date filtering/sorting
    - `User [organizationId, role, isActive]` - listing org members/technicians
    - `RefreshToken [expiresAt]` - expired token cleanup
    - `TaskEvent [taskId, createdAt]` - timeline queries
    - `TimeEntry [userId, status]` - active clock-in checks
    - `TimeEntry [organizationId, clockInAt]` - org attendance reports
16. **Redis caching** - 30s TTL cache for `getStatusCounts` with per-user/role/org keys + invalidation on all task mutations in `tasks.service.ts`
17. **Session tracking** - `userAgent`/`ipAddress` on RefreshToken, new endpoints `GET/DELETE /auth/sessions` in `auth.service.ts` + `auth.controller.ts`
18. **ScrollView to FlatList** - virtualized task list in FreelancerHome with `ListHeaderComponent` for stats/calendar in `index.tsx`
19. **Health checks + offline queue** - `{ cmd: 'health' }` on all microservices, gateway aggregated `/health` with latency reporting, mobile offline mutation queue (max 50, 10min TTL) in `api.ts`

## Remaining (infrastructure-level, intentionally deferred)

| Item | Reason |
|------|--------|
| `expo-image` for image caching | Requires adding a new dependency - needs testing on device |
| Structured JSON logging | Infrastructure concern - needs a logging library decision (winston/pino) |
| BullMQ job-level timeout | Not supported by the BullMQ `JobsOptions` type in current version |
| HttpOnly cookies for tokens | Major auth flow change affecting web + mobile |
| JTI blacklist for token revocation | Requires Redis-backed blacklist, changes JWT validation flow |
