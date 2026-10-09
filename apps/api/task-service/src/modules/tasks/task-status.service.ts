import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Optional,
} from '@nestjs/common';
import { ROLE_WAVE_CLOSED } from './role-pool.service';
import { ClientProxy } from '@nestjs/microservices';
import { WorkflowConfigCache } from '../../common/cache/workflow-config-cache.service';
import { fixOfTap, judgeOccurrence } from '../../common/occurrence.util';
import { ClockGateService } from './handover/clock-gate.service';
import { CrewService } from './handover/crew.service';
import { PresenceService } from '../attendance/presence/presence.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { type TaskAccessFacts } from '../../common/task-access/task-access.service';
import { resolveSpaceDefaultWorkflowId } from '../../common/space-workflow.util';
import { prepareStepSubmission, crmIntents, type PreparedStepSubmission } from './step-submission';
import {
  TaskStatus,
  TaskEventType,
  Role,
  STATUS_TRANSITIONS,
  success,
  isAtSite,
  formatDistance,
  type OccurrenceEvidence,
  type ResolvedAccess,
  ATTENDANCE_CONSTANTS,
  accessAllowsInSpace,
  mayChangeStatus,
  endOfSiteDay,
  tzOffsetMs,
  ONE_AT_A_TIME_STATUSES,
  OFFICE_START_CODES,
  OFFICE_START_REASON_MAX,
  stepCapabilities,
  stepStartsWork,
  isWorkOver,
} from '@hbcfield/shared';
import { firstValueFrom, timeout } from 'rxjs';
import { TaskSupportService } from './task-support.service';

/**
 * Moving a task through its steps: the status change itself (with its step
 * form, the clock gate, the arrival geofence and the crew), and resuming a
 * paused job.
 */
@Injectable()
export class TaskStatusService {
  private readonly logger = new Logger(TaskStatusService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly workflowCache: WorkflowConfigCache,
    // A job on its way or arrived puts its member in the field at once, not at the next heartbeat.
    private readonly presence: PresenceService,
    // "Clocked in to start work" — one gate for step moves, resume and joining a crew.
    private readonly clockGate: ClockGateService,
    // A crew on one job: presence, own stops, the lead (shared tasks/crew.ts).
    private readonly crew: CrewService,
    private readonly support: TaskSupportService,
    // The CRM side of step forms (add_customer_activity). Optional: absent, the
    // answers are still stored — only the client-timeline echo is skipped.
    @Optional() @Inject('AUTH_SERVICE') private readonly authClient?: ClientProxy,
  ) {}

  /**
   * "Resume work" on a paused job — by somebody on it (the one who stopped, or
   * whoever has been given it since: their own time starts here). A move into
   * work, so the clock gate applies exactly as it does to Start work.
   *
   * Not paused any more (a second tap, an offline replay, or the job was moved
   * meanwhile): answered with the job as it is, nothing written.
   */
  async resumeWork(data: TaskAccessFacts & { id: string; evidence?: OccurrenceEvidence }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.id } });
    if (!task) throw new NotFoundException('Task not found');
    const onTheJob =
      task.assignedToId === data.userId ||
      !!(await this.prisma.taskAssignee.findFirst({ where: { taskId: task.id, userId: data.userId }, select: { id: true } }));
    if (!onTheJob || task.organizationId !== data.organizationId) {
      throw new ForbiddenException({ message: 'Only somebody on this job can resume it', code: 'TASK_REASSIGNED' });
    }
    if (task.pausedAt) {
      await this.clockGate.assertWorkerClockedIn(task, data.userId, data.organizationId, true);
      const at = judgeOccurrence(data.evidence, task.pausedAt).at;
      const resumed = await this.prisma.task.updateMany({
        where: { id: task.id, pausedAt: { not: null } },
        data: { pausedAt: null, pausedById: null },
      });
      if (resumed.count > 0) {
        await this.support.createTaskEvent(task.id, data.userId, TaskEventType.RESUMED, { at: at.toISOString() });
        // Picked up again: one job at a time for whoever resumed it, and the crew is asked to join.
        await this.crew.leaveOtherJobs(data.userId, task.organizationId, task.id, at);
        void this.crew.announceStart(task.id, data.userId, at);
        this.notificationClient.emit('task_updated', {
          task: await this.prisma.task.findUnique({ where: { id: task.id } }),
          actorId: data.userId,
        });
        this.support.invalidateStatusCountsCache(task.organizationId);
      }
    }
    return success(await this.prisma.task.findUnique({
      where: { id: task.id },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    }));
  }

  /**
   * Update task status (role-based)
   * - TECHNICIAN: can update assigned tasks (IN_PROGRESS, BLOCKED, COMPLETED)
   * - CLIENT: can cancel their own tasks
   * - DISPATCHER: can cancel any task in their org
   */
  async updateStatus(data: {
    id: string;
    status: string;
    userId: string;
    userRole: string;
    canViewAllTasks?: boolean;
    organizationId: string;
    reason?: string;
    lat?: number;
    lng?: number;
    /**
     * The error radius the device reported, in metres.
     *
     * Widens the arrival zone rather than being ignored. Absent means the client
     * made no claim about accuracy and is treated as zero tolerance, so an older
     * app that does not send it behaves exactly as it always did.
     */
    accuracy?: number;
    /** The status the phone saw when the member tapped — see the conflict check below. */
    expectedFrom?: string;
    /** When and where the tap happened, from a phone that may have been offline. */
    evidence?: OccurrenceEvidence;
    /**
     * Answers to the form of the step being moved into — see step-submission.ts.
     * Untrusted: re-validated here against the step's own definition.
     */
    answers?: unknown;
    // Server-authoritative cross-org grant map (forwarded from the gateway).
    // Used to allow a guest org to move a task in a space explicitly shared to it.
    access?: unknown;
    /**
     * The office starting somebody's job for them (packages/shared/src/tasks/job-time.ts):
     * why — required — and optionally when it really started. Recorded as the
     * office's action, and the worker is told.
     */
    onBehalf?: { reason?: string; at?: string };
  }) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
      // The site's zone, for the due-date gate below — "today" is a fact about
      // where the work is, not about where this container happens to run.
      include: { space: { select: { timezone: true } } },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Role-based authorization
    // Any assigned user can set execution statuses on their assigned tasks
    // ADMIN/DISPATCHER can also cancel tasks they have authority over.
    // Recognise BOTH the LEAD (assignedToId) and multi-assignee MEMBER rows.
    const isAssignedUser =
      task.assignedToId === data.userId ||
      !!(await this.prisma.taskAssignee.findFirst({
        where: { taskId: task.id, userId: data.userId },
        select: { id: true },
      }));
    const isCancelation = data.status === TaskStatus.CANCELED;
    // Managers (ADMIN or "view all tasks") run the board and may move any card to
    // any column of its workflow; field workers only advance their own tasks along
    // the workflow's declared transitions.
    const hasManageAuthority = data.userRole === Role.ADMIN || !!data.canViewAllTasks;

    if (isCancelation) {
      // Cancellation authorization (new access-flag model).
      if (data.userRole === Role.ADMIN) {
        if (task.createdById !== data.userId && task.organizationId !== data.organizationId) {
          throw new ForbiddenException('You can only cancel tasks in your organization');
        }
      } else if (data.canViewAllTasks) {
        // "View all tasks" grant → can cancel any task in their org.
        if (task.organizationId !== data.organizationId) {
          throw new ForbiddenException('You can only cancel tasks in your organization');
        }
      } else {
        // No org-wide authority: cannot cancel (assigned users execute, they
        // don't cancel — they contact someone who can).
        if (!isAssignedUser) {
          throw new ForbiddenException('You can only update status of tasks assigned to you');
        }
        throw new ForbiddenException('You cannot cancel tasks assigned to you. Contact an administrator.');
      }
    } else {
      // Any non-cancel status: canonical execution statuses AND custom-workflow
      // columns (including an "Assigned" column, which the old code wrongly sent to
      // "Access denied"). A worker may set these on tasks assigned to them; a
      // manager may move any card on the board.
      if (!isAssignedUser && !hasManageAuthority) {
        this.logger.warn(`Authorization denied: non-assigned user attempted status update`, { userId: data.userId, taskId: data.id, status: data.status });
        // The code is what an offline phone shows: "the office gave this job to
        // someone else before your change arrived".
        throw new ForbiddenException({ message: 'You can only update execution status of tasks assigned to you', code: 'TASK_REASSIGNED' });
      }
      // Cross-org isolation (C2): the authority checks above never compared the
      // task's org to the caller's, so an ADMIN / canViewAllTasks holder in one
      // tenant could drive a task in ANOTHER tenant. A foreign task may only be
      // moved with a CONTRIBUTE/CONTROL (canCreateTasks) grant for its real space
      // — mirroring update() (:943) and assign() (:1036). Own-org tasks skip this.
      if (task.organizationId !== data.organizationId) {
        if (!task.spaceId || !accessAllowsInSpace((data as any).access, 'canCreateTasks', task.spaceId)) {
          throw new ForbiddenException('You can only update the status of tasks in your organization');
        }
      }
    }

    /*
      ── The change was made from a status the task is no longer in ──

      A phone offline for an hour sends "ARRIVED, from EN_ROUTE". Meanwhile the
      office cancelled the job. Applying ARRIVED on top of a state the member
      never saw would be wrong, and refusing it with a transition error would
      tell them nothing — so it is a 409 carrying the task as it is now, and the
      phone says in words what happened.

      Already where they were moving it (another device got there first, or the
      office did): nothing to do, answered as done, and no second event.
    */
    /*
      ── The step the job is already in ──

      A crew member tapping it (three people pressing "On the way" together,
      or a phone that had not caught up) is WITH the job: joined from their own
      tap (shared crew.ts), and nothing moves. It used to be answered "done"
      with nothing written — the second and third person counted nothing.
    */
    if (isAssignedUser && task.status === data.status) {
      await this.crew.joinAs(task, data.userId, { evidence: data.evidence }).catch((err: unknown) => {
        /*
          ⚠️ NEVER A NEW REFUSAL HERE. This tap was always answered "done"; an
          old app or a replayed outbox op treats a refusal as permanent. A join
          that cannot happen (a step that counts no time, off the clock, a guest
          from another organization) leaves it at that.
        */
        if (!(err instanceof HttpException) || err.getStatus() >= 500) throw err;
      });
      return success(await this.prisma.task.findUnique({
        where: { id: data.id },
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
      }));
    }

    if (data.expectedFrom && task.status !== data.expectedFrom) {
      if (task.status === data.status) {
        return success(await this.prisma.task.findUnique({
          where: { id: data.id },
          include: {
            assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        }));
      }
      throw new ConflictException({
        message: `This task was moved to ${task.status} before your change arrived`,
        code: 'TASK_STATE_CONFLICT',
        params: { current: { id: task.id, status: task.status, assignedToId: task.assignedToId, updatedAt: task.updatedAt } },
      });
    }

    /*
      ── When it happened ──

      Without evidence the change happened now, as it always has. With it, the
      tap's own time is recorded and judged by the shared rule the phone already
      ran: refused only when impossible (the future, or before the change it
      follows), flagged when the clock looks moved or the record is old.

      ⚠️ "Before the change it follows" reads the previous change's OWN time, not
      when its row was written: three changes made offline arrive in one push,
      seconds apart, and the second must be compared with 09:00, not 11:14.
    */
    let previousAt: Date | null = null;
    if (data.evidence || data.onBehalf?.at) {
      const lastChange = await this.prisma.taskEvent.findFirst({
        where: { taskId: task.id, eventType: TaskEventType.STATUS_CHANGED },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, metadata: true },
      });
      const previousOccurred = (lastChange?.metadata as { occurredAt?: string } | null)?.occurredAt;
      previousAt = previousOccurred ? new Date(previousOccurred) : lastChange?.createdAt ?? null;
    }
    const judged = judgeOccurrence(data.evidence, previousAt);
    let occurredAt = judged.at;
    const occurrenceFlags = judged.flags;

    // Validate status transition — honor the task's workflow (its own, else its
    // space's) when present; otherwise the canonical field-service machine.
    let effWorkflowId: string | null = (task as any).workflowId ?? null;
    if (!effWorkflowId && (task as any).spaceId) {
      effWorkflowId = await resolveSpaceDefaultWorkflowId(this.prisma, (task as any).spaceId);
    }
    let allowedTransitions: string[] | null = null;
    let workflowStatusKeys: string[] | null = null;
    // Is the task already in a terminal status? Set from the workflow below when
    // there is one; otherwise from the canonical statuses.
    let currentIsFinished =
      task.status === TaskStatus.COMPLETED ||
      task.status === TaskStatus.CLOSED ||
      task.status === TaskStatus.CANCELED;
    // The task's effective workflow — also where the target step's FORM is read.
    let wf: any = null;
    if (effWorkflowId) {
      // Read from the per-org workflow cache (Redis) instead of the DB.
      wf = await this.workflowCache.getWorkflow(data.organizationId, effWorkflowId);
      workflowStatusKeys = wf?.statuses?.map((s: { key: string }) => s.key) ?? null;
      const cur = wf?.statuses?.find((s: { key: string }) => s.key === task.status);
      if (cur) allowedTransitions = cur.transitions ?? [];
      // A workflow marks its own terminal columns; honour those rather than the
      // canonical names, which a custom workflow need not use. Only when the
      // workflow actually defines this status — otherwise the canonical answer
      // stands, rather than being overwritten with "not finished".
      if (cur) {
        const c = cur as { isFinal?: boolean; isCanceled?: boolean };
        currentIsFinished = !!c.isFinal || !!c.isCanceled;
      }
    }
    // Fallback to the canonical machine when there's no workflow, or the current
    // status isn't part of it (mixed/legacy data).
    if (allowedTransitions === null) {
      allowedTransitions = STATUS_TRANSITIONS[task.status as TaskStatus] || [];
    }
    // A manager dragging on the board may drop a card into ANY column of the task's
    // workflow (free-form kanban) — even where the workflow declares no transitions
    // (e.g. a Support flow) — as long as the target is a real status of that
    // workflow (or a valid canonical status). Execution users follow the declared
    // transitions.
    const targetIsValidStatus = workflowStatusKeys
      ? workflowStatusKeys.includes(data.status as string)
      : (Object.values(TaskStatus) as string[]).includes(data.status as string);
    /*
      One rule, shared with the screens that offer the move (mayChangeStatus in
      @hbcfield/shared). Written twice, it drifted: the board let a manager drag
      a finished task the service refused, and the task page hid a transition
      the service allowed.
    */
    const permitted = mayChangeStatus({
      from: task.status as string,
      to: data.status as string,
      allowedTargets: allowedTransitions,
      targetIsValidStatus,
      isManager: hasManageAuthority,
      fromIsFinished: currentIsFinished,
    });
    if (!permitted) {
      throw new BadRequestException(
        `Invalid status transition from ${task.status} to ${data.status}. Allowed: ${allowedTransitions.join(', ') || 'none'}`,
      );
    }

    // ── Crew mode: the leader moves the step (shared crew.ts mayMoveStep) ──
    if (isAssignedUser) {
      await this.crew.assertMayMoveStep(task, { userId: data.userId, userRole: data.userRole, organizationId: data.organizationId, access: data.access as ResolvedAccess | undefined }, hasManageAuthority);
    }

    // ── Clocked in to start work ──
    // Before the location check: "clock in first" is the more useful thing to
    // hear than "you are 3 km away" — the clock-in itself checks where they are.
    const startsWork = stepStartsWork(data.status, stepCapabilities(wf, data.status));
    // Was the job already counting before this move? (Starting it asks the crew to join.)
    const wasCounting = !task.pausedAt && stepStartsWork(task.status as string, stepCapabilities(wf, task.status as string));
    const onClock = startsWork ? await this.clockGate.assertWorkerClockedIn(task, data.userId, data.organizationId, isAssignedUser) : null;

    /*
      ── The office starting somebody's job for them ──

      Allowed — a phone dies on site — but never silent: it needs a reason, it
      is recorded as the office's action FOR that person ("Started by Anna
      (office) for Mike"), and they are told. The time it really started may be
      given, never before they clocked in and never in the future, so job time
      still only runs inside their shift.
    */
    let officeStart: { forUserId: string; reason: string; at: Date | null } | null = null;
    if (startsWork && !isAssignedUser && task.assignedToId) {
      const reason = (data.onBehalf?.reason ?? '').trim().slice(0, OFFICE_START_REASON_MAX);
      if (!reason) {
        const who = await this.prisma.user.findUnique({ where: { id: onClock?.userId ?? task.assignedToId }, select: { firstName: true, lastName: true } });
        throw new BadRequestException({
          message: 'Say why the office is starting this job for them.',
          code: OFFICE_START_CODES.REASON_REQUIRED,
          params: {
            name: who ? `${who.firstName} ${who.lastName}`.trim() : '',
            clockInAt: onClock?.clockInAt.toISOString() ?? null,
          },
        });
      }
      let at: Date | null = null;
      if (data.onBehalf?.at) {
        at = new Date(data.onBehalf.at);
        const tooEarly = onClock ? at.getTime() < onClock.clockInAt.getTime() : false;
        if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 60_000 || tooEarly || (previousAt && at.getTime() < previousAt.getTime())) {
          throw new BadRequestException({
            message: 'The start time must be inside their shift, after the last change and not in the future.',
            code: OFFICE_START_CODES.TIME_OUTSIDE_SHIFT,
            params: { clockInAt: onClock?.clockInAt.toISOString() ?? null },
          });
        }
      }
      officeStart = { forUserId: onClock?.userId ?? task.assignedToId, reason, at };
    }
    // The office's own time for the start, when it gave one.
    if (officeStart?.at) occurredAt = officeStart.at;

    // ── Assigned user execution enforcement ──

    // (0) Location Verification — assigned user must be within geofence of task location to arrive/start
    const locationRequiredStatuses = [TaskStatus.ARRIVED, TaskStatus.IN_PROGRESS];

    if (
      isAssignedUser &&
      locationRequiredStatuses.includes(data.status as TaskStatus) &&
      task.locationLat != null &&
      task.locationLng != null
    ) {
      /*
        The position of the TAP when the phone recorded one — a change synced
        from a basement must not be judged by where the phone is at sync time.
      */
      const fix = fixOfTap(data.evidence, occurredAt, occurrenceFlags);
      if (fix) {
        data.lat = fix.lat;
        data.lng = fix.lng;
        data.accuracy = fix.accuracy;
      }
      if (data.lat == null || data.lng == null) {
        throw new BadRequestException(
          'Location verification required. Please enable GPS and try again.',
        );
      }

      /*
        Judged by the SAME rule as clocking in at a workspace.

        This used to be its own haversine against a private 20-metre constant,
        and it was wrong twice over. Twenty metres is inside the error of an
        ordinary phone fix — 5 to 50 metres, worse beside a building — so a
        technician standing at the customer's door was regularly told they were
        thirty-five metres away. And the device REPORTS how unsure it is, which
        the check discarded: a fix saying "here, ±40m" was judged as though it
        had said "here, exactly".

        `isAtSite` already answers this, widening the zone by the reported
        accuracy for exactly the reason it matters most where the signal is
        worst. Wrongly refusing somebody who is standing at the job stops them
        working; wrongly accepting produces a record a human can look at.
      */
      const radius = await this.arrivalRadiusFor(task);
      const at = isAtSite(
        { lat: data.lat, lng: data.lng, accuracy: data.accuracy ?? null },
        { lat: task.locationLat, lng: task.locationLng, geofenceRadius: radius, geofencePolygon: null },
      );

      if (!at.inside) {
        /*
          A CODE and the two figures, so the phone and the web write the
          sentence in the member's language with the distance as a person says
          it. The English `message` stays for any client that reads only that —
          and it says "9,631 km", never "9630871m", which is what a member once
          read here.
        */
        const away = Math.round(at.distanceToCentre ?? at.metresOutside);
        const arriving = data.status === TaskStatus.ARRIVED;
        throw new BadRequestException({
          message: `You are ${formatDistance(away)} from the job site. You need to be within ${formatDistance(radius)} to ${arriving ? 'mark it as arrived' : 'start the job'}. Please move closer and try again.`,
          code: arriving ? 'TOO_FAR_TO_ARRIVE' : 'TOO_FAR_TO_START',
          params: { distanceMetres: away, radiusMetres: radius },
        });
      }
    }

    /*
      (a) Due Date Gate — cannot start a task whose dueDate is in the future.

      ⚠️ "Today" is the SITE's day. This used to be `new Date().setHours(23,...)`,
      which is the container's day, and the container runs in UTC: a job due at
      20:00 in New York is 01:00 the next day in UTC, so this refused to let
      anyone set off — on the afternoon it was due. Nobody hit it while due
      dates were dates, because midnight local is still the same UTC day either
      side of the Atlantic. An hour on the due date makes it an everyday event.

      ⚠️ Still DAY-granular, deliberately. Comparing instants would refuse to
      let a member leave at 12:13 for a 13:00 appointment — which is exactly
      when they must leave to arrive on time.
    */
    if (isAssignedUser && data.status === TaskStatus.EN_ROUTE) {
      if (task.dueDate) {
        const tz = task.space?.timezone || 'UTC';
        // The day the member set off, which for a change synced later is not today.
        const endOfToday = endOfSiteDay(occurredAt, tzOffsetMs(occurredAt, tz) / 60_000);
        if (task.dueDate > endOfToday) {
          throw new BadRequestException(
            'Cannot start this task yet — it is scheduled for a future date. You can start it on the due date.',
          );
        }
      }
    }

    // (b) Single Active Task — only one task in execution state at a time
    //     BLOCKED is excluded, so blocking a task frees the slot
    if (isAssignedUser && data.status === TaskStatus.ACCEPTED) {
      const activeTaskCount = await this.prisma.task.count({
        where: {
          assignedToId: data.userId,
          // The one list, shared with the phone (it says this before the tap).
          status: { in: [...ONE_AT_A_TIME_STATUSES] as TaskStatus[] },
          id: { not: data.id },
        },
      });

      if (activeTaskCount > 0) {
        const activeTask = await this.prisma.task.findFirst({
          where: {
            assignedToId: data.userId,
            status: { in: [...ONE_AT_A_TIME_STATUSES] as TaskStatus[] },
            id: { not: data.id },
          },
          select: { title: true },
        });
        throw new BadRequestException(
          `You already have an active task: "${activeTask?.title || 'Unknown'}". Complete or block it before accepting another.`,
        );
      }
    }

    /*
      ── What this step asks ──

      Judged after every other gate and BEFORE anything is written: a refused
      form must leave the job exactly where it was.
    */
    const submission: PreparedStepSubmission | null = await prepareStepSubmission(this.prisma as any, {
      task: { id: task.id },
      workflow: wf,
      statusKey: data.status,
      answers: data.answers,
      isAssignedUser,
    });

    // Build update data with route timestamps
    const updateData: any = { status: data.status as any };
    // A role task reaching a FINISHED step (canonical or the workflow's own) asks its role for nobody more.
    if ((task as any).openRoleId) {
      const target = wf?.statuses?.find((s: { key: string }) => s.key === data.status) as { isFinal?: boolean; isCanceled?: boolean } | undefined;
      if ((target && (target.isFinal || target.isCanceled)) || isWorkOver(String(data.status))) {
        updateData.openSpotsLeft = 0;
        updateData.openWave = ROLE_WAVE_CLOSED;
      }
    }
    // Any move of a paused job ends the pause — the job is being dealt with.
    if (task.pausedAt) {
      updateData.pausedAt = null;
      updateData.pausedById = null;
    }

    // Set routeStartedAt when transitioning to EN_ROUTE
    if (data.status === TaskStatus.EN_ROUTE) {
      updateData.routeStartedAt = occurredAt;
      // Reset route data for a fresh tracking session
      updateData.routeDistance = 0;
      updateData.routeEndedAt = null;
    }

    // Set routeEndedAt when transitioning to ARRIVED
    if (data.status === TaskStatus.ARRIVED) {
      updateData.routeEndedAt = occurredAt;
    }

    /*
      Only if the task is STILL in the status every check above was made
      against. Two changes racing (a phone replaying while the office drags the
      card) used to both pass their checks and the second silently won.
    */
    /*
      With a form, the move and its answers are ONE write: either the job moved
      and its report exists, or neither happened. The form is snapshotted with
      the answers, so a definition edited later cannot change what was asked.
    */
    let submissionId = null as string | null;
    const moved = submission
      ? await this.prisma.$transaction(async (tx) => {
          const m = await tx.task.updateMany({ where: { id: data.id, status: task.status }, data: updateData });
          if (m.count === 0) return m;
          const row = await tx.taskStepSubmission.create({
            data: {
              organizationId: task.organizationId,
              taskId: task.id,
              statusKey: submission.statusKey,
              formVersion: submission.form.version,
              form: submission.form as any,
              answers: submission.answers as any,
              submittedById: data.userId,
              // When the member answered: the tap, not when the phone found signal.
              submittedAt: occurredAt,
            },
            select: { id: true },
          });
          submissionId = row.id;
          return m;
        })
      : await this.prisma.task.updateMany({
          where: { id: data.id, status: task.status },
          data: updateData,
        });
    if (moved.count === 0) {
      const now = await this.prisma.task.findUnique({ where: { id: data.id }, select: { id: true, status: true, assignedToId: true, updatedAt: true } });
      throw new ConflictException({
        message: `This task was moved to ${now?.status ?? 'another status'} at the same moment`,
        code: 'TASK_STATE_CONFLICT',
        params: { current: now },
      });
    }
    const updatedTask = await this.prisma.task.findUniqueOrThrow({
      where: { id: data.id },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    await this.support.createTaskEvent(data.id, data.userId, TaskEventType.STATUS_CHANGED, {
      oldStatus: task.status,
      newStatus: data.status,
      reason: data.reason,
      // The tap's time, always — the next change is ordered against it.
      occurredAt: occurredAt.toISOString(),
      ...(occurrenceFlags.length ? { occurrenceFlags } : {}),
      ...(submissionId ? { stepSubmissionId: submissionId } : {}),
      // Read by the history ("Started by Anna (office) for Mike") and by job time (it is Mike's).
      ...(officeStart ? { byOffice: true, forUserId: officeStart.forUserId, officeReason: officeStart.reason } : {}),
    });

    // Into work: the worker leaves any other job they were on (one job at a time),
    // and a job that has just started asks its crew on the clock to join.
    if (startsWork) {
      const worker = officeStart?.forUserId ?? (isAssignedUser ? data.userId : null);
      if (worker) await this.crew.leaveOtherJobs(worker, task.organizationId, task.id, occurredAt);
      if (!wasCounting) void this.crew.announceStart(task.id, worker ?? data.userId, occurredAt);
    }

    if (officeStart) {
      const by = await this.prisma.user.findUnique({ where: { id: data.userId }, select: { firstName: true, lastName: true } });
      this.notificationClient.emit('task_started_for_you', {
        taskId: task.id,
        taskTitle: updatedTask.title,
        userId: officeStart.forUserId,
        byName: by ? `${by.firstName} ${by.lastName}`.trim() : '',
        reason: officeStart.reason,
        organizationId: task.organizationId,
      });
    }

    // The answers' CRM side — never allowed to undo the move.
    if (submission && submissionId && task.customerId) {
      await this.applyStepFormCrm({
        submissionId,
        submission,
        task: { title: updatedTask.title, customerId: task.customerId, spaceId: task.spaceId, organizationId: task.organizationId, timezone: task.space?.timezone ?? null },
        userId: data.userId,
        userRole: data.userRole,
      });
    }

    // Notify about status change
    this.notificationClient.emit('task_status_changed', {
      task: updatedTask,
      oldStatus: task.status,
      newStatus: data.status,
      // Who moved it — a creator completing their own task is not emailed about it.
      actorId: data.userId,
      watcherIds: await this.support.taskWatcherIds(updatedTask.assignedToId, updatedTask.organizationId),
    });

    // Only the member moving the job themselves: an office drag is not evidence of where anybody is.
    if (isAssignedUser && (data.status === TaskStatus.EN_ROUTE || data.status === TaskStatus.ARRIVED)) {
      void this.presence.onJobMoved({
        userId: data.userId,
        organizationId: updatedTask.organizationId,
        reason: data.status === TaskStatus.EN_ROUTE ? 'ON_THE_WAY' : 'AT_JOB',
        at: occurredAt,
      });
    }

    // (c) Blocked Task Reminder — after accepting a new task, remind about blocked ones
    if (isAssignedUser && data.status === TaskStatus.ACCEPTED) {
      try {
        const blockedTasks = await this.prisma.task.findMany({
          where: { assignedToId: data.userId, status: TaskStatus.BLOCKED },
          select: { id: true, title: true },
        });
        if (blockedTasks.length > 0) {
          this.notificationClient.emit('blocked_tasks_reminder', {
            userId: data.userId,
            blockedTasks: blockedTasks.map(t => ({ id: t.id, title: t.title })),
            newTaskId: data.id,
            newTaskTitle: updatedTask.title,
          });
        }
      } catch (err) {
        this.logger.warn('Failed to send blocked tasks reminder', err);
      }
    }

    this.support.invalidateStatusCountsCache(updatedTask.organizationId);

    return success(submissionId ? { ...updatedTask, stepSubmissionId: submissionId } : updatedTask);
  }

  /**
   * A step form's CRM fields, written to the job's client — through the SAME
   * service path a member uses (`add_customer_activity`), as the member who
   * moved the job, so the CRM's own reach and work rules decide. Only when the
   * job's workspace (else the organization) runs CRM.
   *
   * ⚠️ Best-effort by design: the move and its answers are already committed.
   * A client the mover cannot reach, CRM being off, or auth-service being down
   * is logged and passed over — never a reason to refuse the move after the fact.
   */
  private async applyStepFormCrm(args: {
    submissionId: string;
    submission: PreparedStepSubmission;
    task: { title: string; customerId: string; spaceId: string | null; organizationId: string; timezone: string | null };
    userId: string;
    userRole: string;
  }): Promise<void> {
    try {
      const intents = crmIntents({
        submissionId: args.submissionId,
        form: args.submission.form,
        answers: args.submission.answers,
        taskTitle: args.task.title,
        moverId: args.userId,
        timezone: args.task.timezone,
      });
      if (!intents.length || !this.authClient) return;
      if (!(await this.runsCrm(args.task.spaceId, args.task.organizationId))) return;
      for (const intent of intents) {
        try {
          await firstValueFrom(
            this.authClient.send(
              { cmd: 'add_customer_activity' },
              {
                ...intent,
                customerId: args.task.customerId,
                organizationId: args.task.organizationId,
                authorId: args.userId,
                caller: { userId: args.userId, role: args.userRole },
              },
            ).pipe(timeout(5000)),
          );
        } catch (err: any) {
          this.logger.warn(`Step form CRM ${intent.type} skipped for submission ${args.submissionId}: ${err?.message ?? err}`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Step form CRM failed for submission ${args.submissionId}: ${err?.message ?? err}`);
    }
  }

  /** Does the job's workspace (else its organization) run the CRM module? */
  private async runsCrm(spaceId: string | null, organizationId: string): Promise<boolean> {
    if (spaceId) {
      const space = await this.prisma.companyLocation.findFirst({
        where: { id: spaceId, organizationId },
        select: { enabledModules: true, organization: { select: { enabledModules: true } } },
      });
      if (space) {
        const mods = ((space.enabledModules as string[] | null) ?? (space.organization?.enabledModules as string[] | null) ?? []);
        return mods.includes('crm');
      }
    }
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { enabledModules: true } });
    return ((org?.enabledModules as string[] | null) ?? []).includes('crm');
  }

  /**
   * How close counts as "at the job".
   *
   * The workspace's own geofence radius, because that is the number an
   * organization has already chosen to mean "near enough to a site" — it is set
   * on the workspace, understood by whoever set it, and bounded there between 10
   * and 500 metres. Falling back to ATTENDANCE_CONSTANTS.DEFAULT_GEOFENCE_RADIUS
   * rather than a number private to this file, so there is one default in the
   * product instead of two that disagree (this one said 20 while attendance said
   * 50, and nobody had chosen the 20).
   *
   * ⚠️ A limitation worth naming: the radius describes the WORKSPACE, while a
   * task is often at a customer's address. It is being used as the
   * organization's tolerance for "at a site" rather than as a fact about this
   * particular place. That is a real improvement on a hardcoded 20 and still not
   * the same as a radius per customer site, which is what this should grow into
   * if anybody needs different tolerances for a depot and a tower block.
   */
  private async arrivalRadiusFor(task: { spaceId?: string | null }): Promise<number> {
    const fallback = ATTENDANCE_CONSTANTS.DEFAULT_GEOFENCE_RADIUS;
    if (!task.spaceId) return fallback;
    const space = await this.prisma.companyLocation.findUnique({
      where: { id: task.spaceId },
      select: { geofenceRadius: true },
    });
    return space?.geofenceRadius && space.geofenceRadius > 0 ? space.geofenceRadius : fallback;
  }
}
