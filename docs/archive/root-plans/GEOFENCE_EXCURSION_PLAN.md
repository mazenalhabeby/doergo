# Geofence Excursion (“Out of Ring”) — Full Build Plan

> **Status:** ✅ BUILT (Phases 1–4 + notifications) — local only, NOT deployed; mobile is preview-first (no OTA yet). All services type-check; 70 attendance tests pass.
>
> **Open items — decisions taken:** (1) Responsible notified **only at PENDING** (the `OUT_UNREPORTED` warning is employee-only). (2) Approver permission = existing attendance-approval set (`canManageUsers` to approve/reject, `canViewAllTasks` to list). (3) **Hysteresis added** — `GEOFENCE_EXCURSION.RING_HYSTERESIS_M = 15` (out only past radius+buffer, back at ≤ radius).
>
> **Files touched:** schema `GeofenceExcursion`+enum+relation; migration `20260812120000_add_geofence_excursions`; shared `constants/attendance.ts` (`GEOFENCE_EXCURSION`, sweep const) + `types/attendance.ts` (`GeofenceExcursion*`, `activeExcursion` on status); task-service `attendance.service.ts` (heartbeat rewrite + report/approve/reject/list + sweep), `attendance.controller.ts`, `attendance.processor.ts` (sweep on the 1-min tick), spec; gateway `attendance.controller.ts` + `attendance.service.ts`; notification-service `attendance-notification.handler.ts` (6 events); web `lib/api.ts`, `use-realtime-sync.ts`, `out-of-ring-panel.tsx` (new) + `tracking-tab.tsx`, 5 locales; mobile `out-of-ring-sheet.tsx` (new) + `attendance.tsx`, `lib/api/attendance.ts`+`types.ts`+`index.ts`, 5 locales.

> **Original status:** spec approved, not yet built.
> **Goal:** Replace the silent 150 m auto-clock-out with a reason → approval → timed-grace workflow. When a clocked-in worker leaves their space’s geofence ring, they are warned, submit a **reason + how long they’ll be out**, a responsible person **approves (with an adjustable time) or rejects**, and the system runs a **countdown** with automatic re-checks on return/expiry.

---

## 1. Approved decisions (source of truth)

| # | Decision | Answer |
|---|---|---|
| Trigger | When does “out of ring” fire? | Worker crosses **their space’s own ring (radius)** — per-space, `geofenceRadius`. |
| While pending | Reason submitted, not yet approved | **Stay clocked in, wait.** |
| No approver response | Approver never acts | **Wait indefinitely** — never force-clocked-out on its own. |
| Approver can change time? | | **Yes** — approver may grant a different duration than requested. |
| Duration picker | Employee’s choices | **15m / 30m / 1h / 2h + custom.** |
| Scope | Which spaces | **Every space that has a geofence** (a location/ring set). No-location spaces have no ring → never trigger. |
| Auto-clock-out | The old 150 m behavior | **Removed entirely.** The ONLY automatic clock-out is an approver **REJECT**. |

---

## 2. Current behavior being replaced

- **Heartbeat** (mobile → server every 5 min while clocked in), `apps/api/task-service/src/modules/attendance/attendance.service.ts` (`heartbeat()`):
  - `withinGeofence = distance <= location.geofenceRadius` (no accuracy margin).
  - `if (distance >= AUTO_CLOCK_OUT_DISTANCE_METERS /* 150 */) → this.clockOut(...)` — **silent auto clock-out**, no warning.
- Constant `AUTO_CLOCK_OUT_DISTANCE_METERS = 150` in `packages/shared/src/constants/attendance.ts`.
- Mobile already computes `isOutsideGeofence` from the heartbeat response (`apps/mobile/app/(app)/(tabs)/attendance.tsx sendHeartbeat`), and there is a background heartbeat service (`apps/mobile/src/services/background-heartbeat.ts`).
- Manager notifications route through `resolveWatchers(userId, orgId, 'attendance')` (`apps/api/task-service/src/common/notification-routing.service.ts`) — the same routing used by `sendGeofenceAlert` and pending-approval alerts.

**What changes:** the heartbeat no longer clocks anyone out. Instead it drives a new **GeofenceExcursion** state machine.

---

## 3. State machine

An **excursion** is one “left the ring” episode for one clock-in session (`TimeEntry`).

```
                         ┌───────────────── heartbeat: back inside ring ──────────────┐
                         │                                                            ▼
 (in ring) ──leaves──▶ OUT_UNREPORTED ──employee submits reason+time──▶ PENDING ──approve──▶ APPROVED ──timer ends & still out──▶ EXPIRED ─┐
                         │  (warn employee)      (notify responsible)      │              │  (countdown)                                   │
                         │                                                 │              └──back inside ring──▶ RETURNED                  │
                         │                                              reject                                                            │
                         │                                                 ▼                                                              │
                         └──back inside ring──▶ RETURNED           REJECTED → CLOCK OUT                                                    │
                                                                                                                                          │
   EXPIRED spawns a fresh OUT_UNREPORTED ◀───────────────────────────────────────────────────────────────────────────────────────────────┘
```

**States** (`enum GeofenceExcursionStatus`):
- `OUT_UNREPORTED` — detected outside the ring; employee warned; **no reason yet**. Stays clocked in.
- `PENDING` — reason + requested minutes submitted; responsible person notified; awaiting decision. Stays clocked in.
- `APPROVED` — approved for `grantedMinutes`; `expiresAt` set; countdown running. Stays clocked in.
- `REJECTED` — terminal. Employee is **clocked out**.
- `RETURNED` — terminal. Employee came back **inside the ring** while an excursion was active → excursion cancelled, employee **keeps clocked in normally**; responsible notified “back in area”.
- `EXPIRED` — terminal for that cycle. `APPROVED` timer ended while **still outside** → this excursion closes `EXPIRED` and a **new `OUT_UNREPORTED` cycle is spawned** (repeat).

**Transitions & who triggers them:**
| From | Event | To | Side effects |
|---|---|---|---|
| (none) | heartbeat: outside ring, clocked in, no active excursion | `OUT_UNREPORTED` | warn employee; (optional) notify responsible “left area” |
| `OUT_UNREPORTED` | employee submits reason + minutes | `PENDING` | notify responsible with reason + requested time |
| `PENDING` | approver approves (optionally adjusts time) | `APPROVED` | set `expiresAt = now + grantedMinutes`; notify employee |
| `PENDING` | approver rejects | `REJECTED` | **clock out** the employee; notify employee |
| `OUT_UNREPORTED`/`PENDING`/`APPROVED` | heartbeat: back inside ring | `RETURNED` | cancel timer; notify responsible “back in area”; keep clocked in |
| `APPROVED` | heartbeat: `now > expiresAt` and still outside | `EXPIRED` (+ new `OUT_UNREPORTED`) | notify responsible “time expired, still out”; restart cycle |
| any active | employee clocks out manually / session ends | close (`RETURNED`/`EXPIRED` n/a → a `CANCELLED`-ish close; reuse `RETURNED`) | no extra clock-out |

> **Primary driver = the heartbeat** (it’s the only thing with live GPS). The “timer expired & still out” check happens on the **next heartbeat after `expiresAt`**, because only the phone knows the current position. A server-side **sweep** is a *safety net* only (see §5.3).

---

## 4. Data model

New Prisma model in `apps/api/auth-service/prisma/schema.prisma` (the schema owner; task-service reads the same client).

```prisma
enum GeofenceExcursionStatus {
  OUT_UNREPORTED
  PENDING
  APPROVED
  REJECTED
  RETURNED
  EXPIRED
}

model GeofenceExcursion {
  id             String   @id @default(cuid())
  organizationId String
  timeEntryId    String                         // the active clock-in session
  userId         String
  spaceId        String                         // the space whose ring was left
  status         GeofenceExcursionStatus @default(OUT_UNREPORTED)

  reason           String?                      // employee-provided
  requestedMinutes Int?                         // what the employee asked
  grantedMinutes   Int?                         // what the approver granted (may differ)

  leftRingAt   DateTime @default(now())         // detected outside
  reportedAt   DateTime?                        // reason submitted → PENDING
  decidedAt    DateTime?                        // approve/reject
  expiresAt    DateTime?                        // APPROVED countdown end (drives sweep + re-check)
  resolvedAt   DateTime?                        // RETURNED / EXPIRED / REJECTED
  approvedById String?

  lastDistanceM Int?                            // distance at detection (context for approver)

  timeEntry    TimeEntry     @relation(fields: [timeEntryId], references: [id], onDelete: Cascade)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([status, expiresAt])                  // sweep: due APPROVED timers
  @@index([timeEntryId])                        // active excursion for a session
  @@index([organizationId, status])             // approver list per org
  @@index([userId, status])
  @@map("geofence_excursions")
}
```
- Add the back-relation `geofenceExcursions GeofenceExcursion[]` on `TimeEntry`.
- **“Active excursion” = latest row for a `timeEntryId` whose status ∈ {OUT_UNREPORTED, PENDING, APPROVED}.** Enforce at most one active per session in code (guards), optionally a partial unique later.
- **Migration:** additive (new enum + table). Hand-author idempotent SQL (`CREATE TYPE IF NOT EXISTS` via `DO $$`; `CREATE TABLE IF NOT EXISTS`; `CREATE INDEX IF NOT EXISTS`) — shadow DB is broken in this repo, follow the established pattern. No backfill.

---

## 5. Backend (task-service) changes

### 5.1 Heartbeat rewrite — `attendance.service.ts heartbeat()`
Replace the 150 m auto-clock-out with excursion driving:
1. Compute `inRing = distance <= location.geofenceRadius` (keep it simple = the ring; see §8 hysteresis note).
2. Load the session’s **active excursion** (if any).
3. **Outside + no active excursion** → create `OUT_UNREPORTED` (leftRingAt, lastDistanceM) → emit `geofence_excursion_out` (warn employee; optional responsible “left area”).
4. **Outside + active `APPROVED` and `now > expiresAt`** → close it `EXPIRED`, emit `geofence_excursion_expired`, spawn a new `OUT_UNREPORTED`.
5. **Outside + active `OUT_UNREPORTED`/`PENDING`/`APPROVED`(not expired)** → no state change (optionally refresh `lastDistanceM`).
6. **Inside ring + active excursion** → set `RETURNED` (resolvedAt), emit `geofence_excursion_returned` (notify responsible “back in area”).
7. Return `{ inRing, distance, activeExcursion }` to the mobile app (drives its UI). **Never auto-clock-out.**

### 5.2 New service methods + endpoints (gateway forwards → task-service `@MessagePattern`)
- `reportExcursion(userId, { reason, requestedMinutes })` → moves the session’s active `OUT_UNREPORTED` → `PENDING`; emits `geofence_excursion_requested` to responsible. `POST /attendance/excursions/report`.
- `approveExcursion(id, approverId, { grantedMinutes? })` → `PENDING` → `APPROVED`, `expiresAt = now + (grantedMinutes ?? requestedMinutes)`; emits `geofence_excursion_approved` to employee. `PATCH /attendance/excursions/:id/approve`. (Guard: approver must have manage/notify permission for this employee — reuse the approvals permission check.)
- `rejectExcursion(id, approverId)` → `PENDING` → `REJECTED`, then **`clockOut(userId, …, notes: "Out-of-ring rejected")`**; emits `geofence_excursion_rejected` to employee. `PATCH /attendance/excursions/:id/reject`.
- `listActiveExcursions(orgId, requester)` → PENDING/APPROVED for the approver surface (org- + permission-scoped like `approval.service.ts`). `GET /attendance/excursions?status=active`.
- Include the current user’s **active excursion in `getStatus()`** (so mobile gets it with the status poll) — add `activeExcursion` to the status payload.

### 5.3 Sweep (safety net) — `attendance.scheduler.ts` + `attendance.processor.ts`
- Register a repeatable job `GEOFENCE_EXCURSION_SWEEP` (reuse the ~1-min cadence of the shift-reminder sweep).
- It finds `APPROVED` excursions with `expiresAt < now` and **flags** them for the approver (e.g. emits a `geofence_excursion_expired` reminder / marks a `timerExpired` flag) so the approver sees the timer lapsed **even if the phone stopped heart-beating**. It does **not** clock anyone out and does **not** decide “still out” (no GPS) — the authoritative in/out + the `EXPIRED→new cycle` happens on the next heartbeat (§5.1.4). Indexed by `@@index([status, expiresAt])`.

### 5.4 Constants — `packages/shared/src/constants/attendance.ts`
- Retire the heartbeat’s use of `AUTO_CLOCK_OUT_DISTANCE_METERS` (keep the constant or repurpose; the heartbeat no longer clocks out).
- Add: `EXCURSION_DURATION_PRESETS = [15, 30, 60, 120]` (minutes), `EXCURSION_CUSTOM_MAX_MINUTES` (e.g. 480), optional `EXCURSION_RING_HYSTERESIS_M`.

---

## 6. Notifications — `notification-service`

New event types (task-service `notificationClient.emit(...)` → handler `apps/api/notification-service/src/handlers/attendance-notification.handler.ts` → `websocket.gateway.ts` + push):
| Event | To | When |
|---|---|---|
| `geofence_excursion_out` | employee (`user:{id}`) | left the ring (warn) |
| `geofence_excursion_requested` | responsible (via `resolveWatchers`, ADMIN role room) | reason submitted (approve/reject) |
| `geofence_excursion_approved` | employee | approver granted time |
| `geofence_excursion_rejected` | employee | approver rejected (→ clocked out) |
| `geofence_excursion_returned` | responsible | employee back inside the ring |
| `geofence_excursion_expired` | responsible (+ employee) | timer lapsed while still out |

Recipients for the “responsible” events come from `resolveWatchers(userId, organizationId, 'attendance')` (same as `sendGeofenceAlert`). Push via `push.service.ts`, in-app via the socket (org room + role), same pattern as `attendance_pending_approval`.

---

## 7. Clients

### 7.1 Mobile — `apps/mobile/app/(app)/(tabs)/attendance.tsx` + `src/services/background-heartbeat.ts`
- The heartbeat response / `getStatus()` now carries `activeExcursion`. Drive UI from it:
  - `OUT_UNREPORTED` → **Out-of-Ring warning sheet**: “You’re outside **{space}**.” + **reason** input + **duration picker** (15m / 30m / 1h / 2h / **custom**) → `POST /attendance/excursions/report`.
  - `PENDING` → “Waiting for approval…” banner.
  - `APPROVED` → **live countdown** to `expiresAt` (“Approved · 43:12 left”).
  - `REJECTED` → app reflects the clock-out.
  - `RETURNED` → banner clears; back to normal clocked-in.
  - `EXPIRED` → the next heartbeat produces a new `OUT_UNREPORTED` → sheet re-appears (repeat).
- Reuse the existing toast/sheet patterns; a background push (`geofence_excursion_*`) can also surface it when the app is backgrounded.

### 7.2 Web (approver) — `apps/web-app/src/app/(dashboard)/attendance/`
- New surface (extend the **Geofence Alerts** panel in `tracking-tab.tsx`, or a dedicated “Out of Ring” card, and/or a tab like Approvals): list `PENDING` excursions with worker, space, **reason**, **requested time**, distance, and **Approve (with editable time) / Reject** actions.
- Show **APPROVED** excursions with a **live countdown** and a “timer expired” state (from the sweep flag).
- **Real-time:** add the `geofence_excursion_*` events to `use-realtime-sync.ts` and invalidate the excursions query keys (mirror the `attendance-active` / `locationAttendanceBatch` fix) so it updates live.
- i18n keys for all new strings in all 5 locales.

---

## 8. Edge cases & notes
- **No-location space** → no ring → heartbeat `inRing` trivially true → never triggers. ✔
- **Phone goes dark** (app killed / no signal) → no heartbeat → excursion frozen in its current state; per “wait indefinitely,” nothing auto-clocks-out. The sweep only flags expired APPROVED timers for the approver. (Acceptable per spec; call out to the user.)
- **GPS flapping near the edge** → to avoid rapid OUT/RETURNED toggling, add **hysteresis**: treat as “out” when `distance > radius (+ small buffer)` and “back” only when `distance <= radius`, and/or require 2 consecutive readings. Tunable via `EXCURSION_RING_HYSTERESIS_M`.
- **Approver grants less than already elapsed** → `expiresAt` in the past → next heartbeat treats as expired → re-cycles. (Fine.)
- **Manual clock-out while an excursion is active** → close the active excursion (no double clock-out).
- **Concurrency** (reason submitted the same moment as reject) → guard every transition on the expected `status` (`updateMany where status = X`), like the refresh-token atomic-claim pattern.
- **Multiple spaces**: the excursion is bound to `timeEntry.locationId` (the space they’re clocked into).

---

## 9. Implementation phases
1. **Schema + migration** — `GeofenceExcursion` model, enum, `TimeEntry` relation, hand-authored idempotent migration. `pnpm db:generate`.
2. **Backend core** — heartbeat rewrite (state machine), the 4 service methods + gateway endpoints, `getStatus` includes `activeExcursion`, the sweep job, notification events + handler + push. Unit tests for the transitions.
3. **Mobile** — status/excursion wiring, warning sheet + reason + duration picker, PENDING/APPROVED/countdown UI, push handling. Preview in Expo → OTA.
4. **Web** — approver list + approve(edit time)/reject + live timers, realtime-sync keys, i18n (5 locales).
5. **Cutover + cleanup** — remove the heartbeat auto-clock-out path, retire/repurpose `AUTO_CLOCK_OUT_DISTANCE_METERS`, verify no other caller relies on it; docs.

## 10. Deploy
- Additive migration auto-applies via the auth-service entrypoint; no backfill.
- Rebuild **auth-service** (schema) + **task-service** (logic/sweep) + **notification-service** (events) + **web-app** (UI). Mobile ships via **OTA** after Expo preview. Follow the standard git-bundle → `--env-file .env.production` build/up flow with a rollback tag.

## 11. Open items to confirm before Phase 1
- Notify the **responsible immediately at `OUT_UNREPORTED`** (before a reason), or only at `PENDING` (reason submitted, per your wording)? Plan assumes **only at PENDING**, with an optional “left area” heads-up.
- Any **permission** nuance for who may approve (reuse the existing attendance-approval permission = `canManageUsers` / space managers / watchers)? Plan assumes the same set as pending-approval + `resolveWatchers`.
- Add **hysteresis buffer** to the ring for GPS noise (recommended), or strict radius only?
