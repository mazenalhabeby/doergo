# Crew job time — the plan

> One job, several workers, one leader. Every worker's time counted from their
> own join to their own leave, inside their own shift, for every workflow.
> Status: **plan, nothing built**. Explained in Arabic with voice:
> https://claude.ai/artifact/XY2a2RVnrXusz8THnS8rw3

---

## 0. What is broken today, and what is already fixed

| # | Problem | Where it comes from | Status |
|---|---|---|---|
| P1 | A crew member who never taps gets **0** (Conor: 10h on the job, 0 counted) | `jobWindows()` credits only from a person's own move | **open** |
| P2 | Three people tap *On the way*: **only the first counts**, the others get a silent "done" | `updateStatus` — `expectedFrom` mismatch + same status → success, no event | **open** |
| P3 | One person's *Report issue* turns **everyone's** time into blocked | one shared step per job | **open** |
| P4 | The **leader is a label**: no say over steps or time | `TaskAssignee.role` is read only for display | **open** |
| P5 | A job "running" with **nobody credited** (16:00–17:00) | job pauses at the last *crew* clock-out, not the last *credited* one | **open** |
| P6 | The handover note is asked of **whoever leaves last**, not who knows the job | `handoverDueById = userId` of the last clock-out | **open** |
| P7 | Leader sick or absent: **nothing happens** | no acting leader, no hand-over, no notice | **open** |
| P8 | A queued clock-in refused later was **silent** | outbox `failed` with no surface | ✅ fixed `bfdb5483` (PROD + OTA) |
| P9 | A hand-added shift **in the future** blocked every clock-in | `lastClosed` read future entries | ✅ fixed `8f723bb5` (PROD) |

---

## 1. The model (decisions)

**Separate the job's step from each person's presence.**

1. **The job has one step**, as today. It is moved by the **effective leader** or the office.
   - Effective leader = today's hand-over if one is active → the LEAD if they are on the clock and joined → otherwise the **first joined crew member** (acting leader, today only, automatic).
   - The office (ADMIN, or `canViewAllTasks` in the task's workspace) can always move it, as today.
2. **Each crew member has their own presence**: `joined` → `left`, and their own `self-blocked` → `resumed`.
   - Time is counted per person from **join** to **leave**, clipped to **their shift minus their rests** (unchanged rule), in the job step's kind — **unless they are self-blocked**, then it is *blocked* for them only.
3. **Joining** (any of):
   - their own tap on any step, including the step the job is **already in** (fixes P2) — joined at **their tap's time**;
   - **"I'm with him"** on the leader-started notification — joined at the **leader's start** if confirmed within **30 min** and they were clocked in at that moment, else at their tap;
   - the office joining them (with a reason, like the office start).
4. **Leaving** (any of): their own *Leave job*; their **clock-out**; **joining another job** (one job at a time — recorded, not only computed); being **removed** from the crew (today's `LEFT`).
5. **Issues**:
   - **My issue** (any joined member) → only their time is blocked; the job and the others carry on (fixes P3).
   - **Job issue** (effective leader or office) → the job step goes to Blocked, as today.
6. **Pausing**: the job pauses when the **last joined member** leaves or clocks out (fixes P5).
   **Handover**: asked of the last joined member out; the leader is notified. A leader leaving while the crew carries on is offered *Leave a note for the crew* (fixes P6).
7. **Leader absent** (fixes P7):
   - **Automatic** acting leader (rule 1) — the job is never stuck;
   - the leader can **hand over this job only**, for **today** or **permanently**, to someone on **this job's crew**;
   - the **office** can change the leader any time (exists), and gets a **morning notice** when a job's leader has approved time off today.
8. **Solo jobs are unchanged**: the only worker is the leader; join/leave are implicit in their moves and clock.
9. **Workflow-agnostic**: everything keys off the step's **kind** (`stepTimeKind`: travel / working / blocked / none, from capabilities), never its name.

---

## 2. Data model (one additive migration)

```prisma
enum TaskEventType {
  // … existing …
  CREW_JOINED      /// metadata: { at, viaLeaderAt?, byOffice?, forUserId?, reason? }
  CREW_LEFT        /// metadata: { at, why: 'SELF'|'CLOCK_OUT'|'OTHER_JOB'|'REMOVED'|'OFFICE' }
  SELF_BLOCKED     /// metadata: { at, reason }
  SELF_RESUMED     /// metadata: { at }
  LEAD_CHANGED     /// metadata: { from, to, scope: 'TODAY'|'PERMANENT', by: 'LEADER'|'OFFICE'|'AUTO', reason? }
}

model Task {
  // … existing …
  /// A leader handed over FOR TODAY: who leads until when. Null = the LEAD row decides.
  leadOverrideId    String?
  leadOverride      User?     @relation("TaskLeadOverride", fields: [leadOverrideId], references: [id], onDelete: SetNull)
  leadOverrideUntil DateTime?
}

model Organization {
  /// Crew rules switched on (leader-only steps, presence). Off = today's behaviour.
  crewMode Boolean @default(false)
}
```

- Migration hand-authored, idempotent: `ALTER TYPE "TaskEventType" ADD VALUE IF NOT EXISTS …` ×5, `ADD COLUMN IF NOT EXISTS` ×3, FK `ON DELETE SET NULL`.
- **No new table.** Presence is events on the job's own history; the existing `@@index([taskId, createdAt])` on `task_events` already serves every read (all reads are per task). No new index.
- The *permanent* hand-over is the existing `TaskAssignee.role` swap (LEAD ↔ MEMBER) — no second source of truth.
- The *acting* leader is **derived**, never stored: storing it would go stale the moment the leader clocks in.

---

## 3. Shared (`packages/shared/src/tasks/`) — the one rule, used by server, web and phone

| File | What |
|---|---|
| `crew.ts` **new** | `effectiveLeader({ leadId, override, now, onClock, joined, joinOrder })` · `mayMoveStep(actor, ctx)` · `joinMoment({ leaderStartAt, confirmAt, clockInAt, windowMin: 30 })` · `CREW_CODES` (`NOT_ON_CREW`, `LEADER_MOVES_STEPS`, `NOT_JOINED`, `LEAD_TARGET_NOT_ON_CREW`) |
| `job-time.ts` | `WorkTimelineEvent.kind` += `'JOINED' \| 'SELF_BLOCKED' \| 'SELF_RESUMED'` (and `LEFT` from `CREW_LEFT`). `jobWindows()` opens a window on `JOINED`. New `personalSpans(spans, selfBlocks)` re-labels a person's spans as *blocked* inside their own self-block windows. `jobSpans()` ignores personal events (the job's line is unchanged). |
| `handover.ts` | `pausesJob({ leaverId, joinedOnClock })` — the last-joined rule, one place |
| `sync/operations.ts` | `task.join`, `task.leave`, `task.selfIssue`, `task.selfResume`, `task.lead` — so all of it works offline, with the tap's own time and evidence |
| `__tests__` | the day from the mockup, both ways: today's rules → 7h/3h/0; crew rules → 7h/8h30/9h30 = 25h; simultaneous taps; self-block; leader absent; solo job unchanged; a custom workflow (delivery) |

**DRY:** the server, the web card, the phone card and the report all call the same functions — as `job-time.ts` already does.

---

## 4. Server — task-service

**New `CrewService`** (`modules/tasks/crew/`, single responsibility; `TasksService` does not grow):

| Method | Does |
|---|---|
| `join(taskId, userId, { at, viaLeaderAt?, evidence })` | must be on the crew (else 404); idempotent while joined; clock gate (`assertWorkerClockedIn`, the mover); writes `CREW_JOINED`; leaves their other in-work job (`CREW_LEFT why: OTHER_JOB`) |
| `leave(taskId, userId, why)` | writes `CREW_LEFT`; if they were the last joined on the clock → `JobPauseService.pause` |
| `selfIssue / selfResume` | joined members only; writes `SELF_BLOCKED` / `SELF_RESUMED`; resume needs the clock (it is work again) |
| `changeLead(taskId, actor, to, scope, reason)` | actor = effective leader of **this** task or office (`canAssignTasks` in the task's space); `to` must be on **this** task's crew, not external; TODAY → `leadOverride*` until the end of the workspace's local day; PERMANENT → role swap; `LEAD_CHANGED` event; notifies both |
| `presence(taskIds)` | who is joined / self-blocked now, for many tasks in **one** query — for lists and the board |

**Changes to existing code:**

| Where | Change |
|---|---|
| `tasks.service.ts › updateStatus` | (a) a crew member tapping the step the job is already in → `crew.join` instead of a silent success (P2); (b) with `crewMode` on, a step move by a non-leader crew member → `400 LEADER_MOVES_STEPS {leader}` (off: allowed, as today, and the mover is joined); (c) a move into a counted step joins the mover |
| `handover/job-pause.service.ts` | pause when the **last joined** member on the clock leaves (not the last crew member); every clock-out writes `CREW_LEFT why: CLOCK_OUT` for that person's joined jobs |
| `handover/job-time.service.ts` | read the 5 new events; per-person `personalSpans`; `byWorker` lists every joined member |
| notifications | `task_crew_started` → clocked-in crew members, with an **I'm with him** action; `task_lead_changed`; `task_lead_needed` (below) |
| new cron `leaderAbsentSweep` | 06:30 in each workspace's zone, **`cron_locks` lease** (never `pg_advisory_lock` — PgBouncer): today's jobs whose LEAD has APPROVED time off covering today → notify through the **existing routing** (workspace → watchers → nobody), with *Make {acting} leader* / *Choose someone*. One query per org, bounded `take`. |

---

## 5. Gateway — endpoints

| Method | Route | Gate |
|---|---|---|
| POST | `/tasks/:id/crew/join` | JWT; caller on the crew (service) |
| POST | `/tasks/:id/crew/leave` | JWT; caller joined (service) |
| POST | `/tasks/:id/crew/issue` · `/crew/resume` | JWT; caller joined (service) |
| PUT | `/tasks/:id/lead` | JWT; effective leader of this task **or** `@RequirePermissionInSpace('canAssignTasks')` — narrowed in the service |
| GET | `/tasks/:id/crew` | the task's read gate (same as `GET /tasks/:id`) |

- DTOs with class-validator: ids `@Matches(ID)`, `scope @IsIn(['TODAY','PERMANENT'])`, `reason @MaxLength(500)`, evidence as the other queued ops.
- Each added to the **audit route map** (`audit.interceptor.ts`) and to `external-observer-writes.spec.ts` expectations.

---

## 6. Phone (`apps/mobile`)

| Where | What |
|---|---|
| `components/job/job-page.tsx` + new `job-crew.tsx` | crew panel: who is on the job now, self-blocked with reason, the leader (and *acting*) |
| `job-dock.tsx` | **leader**: steps, *Job issue*, *Hand over lead* · **member**: *I'm with him* / *Join*, *My issue* / *Resume mine*, *Leave job*; with `crewMode` on, steps hidden for members with "Tobias moves the steps" |
| new `sheets/hand-over-lead-sheet.tsx` | this job's crew only · *Today only* / *Permanently* · optional reason |
| `hooks/usePushNotifications.ts` | notification category with the **I'm with him** action (JS API, OTA-safe; iOS `time-sensitive` already in place) |
| `offline/` | the five ops through the outbox with evidence; overlay shows *joined · queued*; a refused crew op uses the refused-op pattern from `refused-shift.ts` (generalised, not copied) |
| `job-time-card.tsx` | per-person rows include personal blocked time |
| `clock-out-sheet.tsx` | leader leaving while the crew carries on → *Leave a note for the crew* |
| `i18n/locales/*.json` | 5 languages, formal *Sie* |

## 7. Web (`apps/web-app`)

| Where | What |
|---|---|
| `tasks/[id]/_components/task-detail-sidebar.tsx` | crew with live presence; leader + *acting* chip; *Change leader* dialog (today / permanent, reason) — reuses the existing promote action |
| `job-time-card.tsx` | per-person rows, personal blocked |
| activity timeline | renders the 5 new events in words |
| `org settings` | the `crewMode` switch, with what it changes |

---

## 8. Security

1. **The server is the boundary.** Every crew rule (on the crew, joined, effective leader, target on *this* crew) is checked in `CrewService`, never only in the UI.
2. **Refusals are 404** for a task the caller cannot see (no existence leak), **400 with a code** for a rule they can act on.
3. **The leader change can only hand to this job's crew**, never add someone; adding stays behind `canAssignTasks` (the existing assign path and the grant ceiling).
4. **External members** hold no clock → cannot join (`@DenyExternal` on the crew routes, and the service check).
5. **Times are the tap's own** (`judgeOccurrence`): never before the clock-in, never in the future, out-of-order refused — the same evidence rules as clock-in.
6. **"I'm with him" cannot back-date beyond 30 min** or before the member's own clock-in — enforced server-side in `joinMoment`.
7. **Idempotent**: phone-made ids as Idempotency-Key, so a replay never writes twice.
8. **Audited**: every write in the audit log with WHO, and on the job's own history.
9. **Rate limits**: the default throttler; join/leave are per-user, per-task idempotent.

## 9. Performance

1. **No timers, no background counting.** Time is derived from saved moments, as today.
2. **No new table, no new index.** All reads are per task on `task_events(taskId, createdAt)`.
3. **Presence for lists in one query** (`presence(taskIds)`), never per row.
4. **The workflow cache** already resolves step kinds per flow (`WorkflowConfigCache`) — reused.
5. **The pause check** asks one indexed question (joined members with an open time entry).
6. **The morning sweep** is one query per organization under a lease, bounded.
7. **Job time stays bounded by the clock** (`exclusiveSpans` + shift clipping) — the invariant tests already hold it.

## 10. Design system, DRY, SOLID

- **Design**: Amazen Trust tokens only; one filled action per surface; `warn` for *self-blocked* (owed, not wrong), `critical` only for a refusal; never the word "paid".
- **DRY**: one shared rule set (`crew.ts`, `job-time.ts`, `handover.ts`) read by server, web, phone and reports; the refused-op surface generalised from `refused-shift.ts`; the promote action reused for *Change leader*.
- **SOLID**: `CrewService` owns presence and leadership (SRP); `TasksService.updateStatus` asks it rather than growing; the clock gate, pause and time services keep their single jobs; new event kinds extend the timeline without changing existing readers (OCP).

## 11. Order of work

| Phase | What | Ships |
|---|---|---|
| **0** | English UI mockup of the exact phone + web screens — **approve before any UI code** | artifact |
| **1** | Shared rules + tests (the mockup's day both ways) | — |
| **2** | Migration + `CrewService` + endpoints + `updateStatus` P2 fix + job-time reading the new events. `crewMode` **off** by default: old apps keep working, and P2 (same-step tap joins) helps everyone at once | server deploy |
| **3** | Phone: crew panel, join/leave, my issue, hand-over sheet, notification action, offline ops | OTA 1.0.6 + 1.0.7 after dev preview |
| **4** | Web: crew panel, change leader, job-time card, activity, the `crewMode` switch | web deploy after local review |
| **5** | Pause rule (last joined), handover to last joined + crew note, morning leader-absent sweep | server deploy |
| **6** | Switch `crewMode` on for HBC USA first; watch a week of real crews; then default | per org |

**Compatibility:** phase 2 never refuses an old app — leader-only steps exist only behind `crewMode`, switched on per organization once its phones run the new app.

**Done when:** the mockup day counts 7h / 8h30 / 9h30 in the real system; three simultaneous *On the way* taps credit all three; a self-block leaves the others working; a job never runs with nobody credited; a sick leader's job moves without anybody stuck.
