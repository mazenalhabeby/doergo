import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Optional,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { WorkflowConfigCache } from '../../common/cache/workflow-config-cache.service';
import { judgeOccurrence } from '../../common/occurrence.util';
import { ClockGateService } from './handover/clock-gate.service';
import { CrewService } from './handover/crew.service';
import { PresenceService } from '../attendance/presence/presence.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { prepareStepSubmission, type PreparedStepSubmission } from './step-submission';
import {
  TaskStatus,
  TaskEventType,
  success,
  type ResolvedAccess,
  stepCapabilities,
  stepStartsWork,
  assertFoundInOrg,
} from '@hbcfield/shared';
import { TaskSupportService } from './task-support.service';
import { TASK_WITH_PEOPLE_INCLUDE, type OfficeStart, type UpdateStatusInput } from './task-status.types';
import { assertMayMoveStatus, assertTransitionAllowed, managesBoard, previousChangeAt } from './task-status-gates';
import { assertAtJobSite, assertDueBySiteDay, assertNoOtherActiveTask, officeStartFor } from './task-status-checks';
import { statusUpdateData, writeStatusMove } from './task-status-write';
import { afterStatusMove, type AfterMoveDeps } from './task-status-after';
import { emitEvent, taskUpdatedEvent } from '@hbcfield/shared/microservices';
import { TASK_JOBS, type JobData } from '@hbcfield/shared';

/**
 * Moving a task through its steps: the status change itself (with its step
 * form, the clock gate, the arrival geofence and the crew), and resuming a
 * paused job. The gates live in task-status-gates.ts / task-status-checks.ts,
 * the write in task-status-write.ts — this file runs them in order.
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
  async resumeWork(data: JobData<typeof TASK_JOBS.resumeWork>) {
    const task = await this.prisma.task.findUnique({ where: { id: data.id } });
    // Before any other read: another organization's task is answered like a missing one.
    assertFoundInOrg(task, data.organizationId, 'Task');
    const onTheJob =
      task.assignedToId === data.userId ||
      !!(await this.prisma.taskAssignee.findFirst({
        where: { taskId: task.id, userId: data.userId },
        select: { id: true },
      }));
    if (!onTheJob) {
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
        emitEvent(this.notificationClient, taskUpdatedEvent, {
          task: await this.prisma.task.findUnique({ where: { id: task.id } }),
          actorId: data.userId,
        });
        this.support.invalidateStatusCountsCache(task.organizationId);
      }
    }
    return success(
      await this.prisma.task.findUnique({
        where: { id: task.id },
        include: TASK_WITH_PEOPLE_INCLUDE,
      }),
    );
  }

  /**
   * Update task status (role-based)
   * - TECHNICIAN: can update assigned tasks (IN_PROGRESS, BLOCKED, COMPLETED)
   * - CLIENT: can cancel their own tasks
   * - DISPATCHER: can cancel any task in their org
   */
  async updateStatus(data: UpdateStatusInput) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
      // The site's zone, for the due-date gate — "today" is a fact about
      // where the work is, not about where this container happens to run.
      include: { space: { select: { timezone: true } } },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Recognise BOTH the LEAD (assignedToId) and multi-assignee MEMBER rows.
    const isAssignedUser =
      task.assignedToId === data.userId ||
      !!(await this.prisma.taskAssignee.findFirst({
        where: { taskId: task.id, userId: data.userId },
        select: { id: true },
      }));
    const hasManageAuthority = managesBoard(data);
    assertMayMoveStatus(task, data, { isAssignedUser, hasManageAuthority }, this.logger);

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
      return success(await this.taskWithPeople(data.id));
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
    if (data.expectedFrom && task.status !== data.expectedFrom) {
      if (task.status === data.status) {
        return success(await this.taskWithPeople(data.id));
      }
      throw new ConflictException({
        message: `This task was moved to ${task.status} before your change arrived`,
        code: 'TASK_STATE_CONFLICT',
        params: {
          current: { id: task.id, status: task.status, assignedToId: task.assignedToId, updatedAt: task.updatedAt },
        },
      });
    }

    /*
      ── When it happened ──

      Without evidence the change happened now, as it always has. With it, the
      tap's own time is recorded and judged by the shared rule the phone already
      ran: refused only when impossible (the future, or before the change it
      follows), flagged when the clock looks moved or the record is old.
    */
    const previousAt = data.evidence || data.onBehalf?.at ? await previousChangeAt(this.prisma, task.id) : null;
    const judged = judgeOccurrence(data.evidence, previousAt);
    let occurredAt = judged.at;
    const occurrenceFlags = judged.flags;

    // The task's effective workflow — also where the target step's FORM is read.
    const wf = await assertTransitionAllowed(this.prisma, this.workflowCache, task, data, hasManageAuthority);

    // ── Crew mode: the leader moves the step (shared crew.ts mayMoveStep) ──
    if (isAssignedUser) {
      const actor = {
        userId: data.userId,
        userRole: data.userRole,
        organizationId: data.organizationId,
        access: data.access as ResolvedAccess | undefined,
      };
      await this.crew.assertMayMoveStep(task, actor, hasManageAuthority);
    }

    // ── Clocked in to start work ──
    // Before the location check: "clock in first" is the more useful thing to
    // hear than "you are 3 km away" — the clock-in itself checks where they are.
    const startsWork = stepStartsWork(data.status, stepCapabilities(wf, data.status));
    // Was the job already counting before this move? (Starting it asks the crew to join.)
    const wasCounting =
      !task.pausedAt && stepStartsWork(task.status as string, stepCapabilities(wf, task.status as string));
    const onClock = startsWork
      ? await this.clockGate.assertWorkerClockedIn(task, data.userId, data.organizationId, isAssignedUser)
      : null;

    // The office starting somebody's job for them — see officeStartFor.
    const officeStart: OfficeStart | null =
      startsWork && !isAssignedUser && task.assignedToId
        ? await officeStartFor(this.prisma, data, task.assignedToId, onClock, previousAt)
        : null;
    // The office's own time for the start, when it gave one.
    if (officeStart?.at) occurredAt = officeStart.at;

    // ── Assigned user execution enforcement ──
    if (isAssignedUser) await assertAtJobSite(this.prisma, task, data, occurredAt, occurrenceFlags);
    if (isAssignedUser && data.status === TaskStatus.EN_ROUTE) assertDueBySiteDay(task, occurredAt);
    if (isAssignedUser && data.status === TaskStatus.ACCEPTED) {
      await assertNoOtherActiveTask(this.prisma, data.userId, data.id);
    }

    /*
      ── What this step asks ──

      Judged after every other gate and BEFORE anything is written: a refused
      form must leave the job exactly where it was.
    */
    const submission: PreparedStepSubmission | null = await prepareStepSubmission(this.prisma, {
      task: { id: task.id },
      workflow: wf,
      statusKey: data.status,
      answers: data.answers,
      isAssignedUser,
    });

    const submissionId = await writeStatusMove(this.prisma, {
      task,
      taskId: data.id,
      updateData: statusUpdateData(task, wf, data.status, occurredAt),
      submission,
      userId: data.userId,
      occurredAt,
    });
    const updatedTask = await this.prisma.task.findUniqueOrThrow({
      where: { id: data.id },
      include: TASK_WITH_PEOPLE_INCLUDE,
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

    const move = { task, updatedTask, data, isAssignedUser, startsWork, wasCounting, officeStart, occurredAt };
    await afterStatusMove(this.afterDeps(), { ...move, submission, submissionId });

    return success(submissionId ? { ...updatedTask, stepSubmissionId: submissionId } : updatedTask);
  }

  /** The collaborators the after-effects use — this service's own. */
  private afterDeps(): AfterMoveDeps {
    const { prisma, notificationClient, presence, crew, support, logger, authClient } = this;
    return { prisma, notificationClient, presence, crew, support, logger, authClient };
  }

  /** The task as a status answer returns it. */
  private taskWithPeople(id: string) {
    return this.prisma.task.findUnique({ where: { id }, include: TASK_WITH_PEOPLE_INCLUDE });
  }
}
