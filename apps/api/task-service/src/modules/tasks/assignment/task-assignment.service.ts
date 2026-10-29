import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  PrismaService,
  personName,
  notEndedWhere,
  TaskStatus,
  TaskEventType,
  success,
  accessAllowsInSpace,
  canReceiveTasks,
  workerToAssign,
  peopleTaskGate,
  assertFoundInOrg,
} from '@hbcfield/shared';
import { assertMayAssign, assertTargetIsInSpace } from '../core/task-scope';
import { TaskSupportService } from '../core/task-support.service';
import { assertAssigneesAreQualified as assertQualified } from './assignee-credentials';
import { TaskCrewChangeService } from './task-crew-change.service';
import { TaskEventType as DbEventType } from '@prisma/client';
import { TASK_JOBS, type JobData } from '@hbcfield/shared';

/**
 * Who is on a task: assigning, declining, adding and removing assignees, the
 * gates on who may receive work (access profile, credentials), releasing a
 * leaver, and the one writer that decides what an assignment implies.
 */
@Injectable()
export class TaskAssignmentService {
  private readonly logger = new Logger(TaskAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly support: TaskSupportService,
    private readonly crewChange: TaskCrewChangeService,
  ) {}

  /** Refuse an assignment to somebody whose required credential is missing or expired (assignee-credentials.ts). */
  assertAssigneesAreQualified(
    userIds: string[],
    users: { id: string; firstName: string; lastName: string }[],
    workflowId?: string | null,
    organizationId?: string | null,
  ) {
    return assertQualified(this.prisma, userIds, users, workflowId, organizationId);
  }

  /** For the role pool: a crew change goes through the office's own path (primary, status, push). */
  onAssigneesChanged(taskId: string, newlyAssigned: string[], actorId: string) {
    return this.crewChange.onAssigneesChanged(taskId, newlyAssigned, actorId);
  }

  /**
   * Assign a task to a technician (CLIENT or DISPATCHER)
   */
  /**
   * Refuse to hand work to someone who cannot see it.
   *
   * A member's Access Profile can exclude the Tasks surface — they are a
   * clock-only worker. The assignee pickers already hide those people
   * (canReceiveTasks), but nothing checked on the way in, so a task assigned
   * through the API, an integration, or a stale client landed on someone whose
   * app has no Tasks tab: assigned, invisible, and silently never worked.
   *
   * Same permissive rule as everywhere else — canReceiveTasks is true for
   * admins and for anyone with no profile stored, so this only refuses a member
   * whose profile explicitly leaves Tasks out.
   */
  /**
   * Everyone about to receive this task must be able to, and be qualified for it.
   *
   * Two checks, and they answer different questions:
   *
   *   ACCESS  — does their profile include Tasks at all? Unchanged behaviour.
   *   QUALIFIED — for a task type that requires a credential, do they hold a
   *               valid one? An expired gas certificate must take somebody out
   *               of the pool on the day it expires, without a dispatcher
   *               having to remember.
   *
   * The second costs ONE indexed probe when an organization gates nothing —
   * which is every organization until an administrator marks a document type as
   * required for a task type. It is not free, and a cache that made it free
   * would fail OPEN for its lifetime: an expired credential still accepted for
   * a minute after somebody made it mandatory. One index probe on a path a
   * dispatcher hits a few hundred times a day is the better trade.
   */
  async assertAssigneesCanReceiveTasks(
    ids: (string | null | undefined)[],
    /** The task's type. Absent means nothing can be required, so nothing is checked. */
    workflowId?: string | null,
    organizationId?: string | null,
  ) {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (unique.length === 0) return;
    const users = await peopleTaskGate(this.prisma, unique);
    const blocked = users.filter((u) => !canReceiveTasks(u));
    if (blocked.length > 0) {
      const names = blocked.map((u) => personName(u)).join(', ');
      throw new BadRequestException(
        `${names} cannot be assigned tasks — their access profile does not include the Tasks feature.`,
      );
    }

    await this.assertAssigneesAreQualified(unique, users, workflowId, organizationId);
  }

  async assign(data: JobData<typeof TASK_JOBS.assign>) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Authorization: own-org tasks always; a foreign task ONLY with a cross-org
    // CONTROL grant (canAssignTasks) for that task's real space.
    if (task.organizationId !== data.organizationId) {
      if (!task.spaceId || !accessAllowsInSpace(data.access, 'canAssignTasks', task.spaceId)) {
        this.logger.warn(`Authorization denied: assign task across orgs`, { userId: data.userId, taskId: data.id });
        // 404, not 403: another organization's task does not exist to this caller.
        assertFoundInOrg(task, data.organizationId, 'Task');
      }
    } else {
      /*
        The same two questions addAssignee asks. This route skipped both, so a
        member granted "assign" in ONE workspace could reassign any task in the
        organization — to anybody in it — by id. May they assign on THIS task's
        space, and is the person they name on that space's roster?
      */
      assertMayAssign(task, data);
      await assertTargetIsInSpace(this.prisma, task, data.workerId, data);
    }

    // Admin/Dispatcher can reassign at any stage except completed/canceled/closed
    const cannotReassign = [TaskStatus.COMPLETED, TaskStatus.CANCELED, TaskStatus.CLOSED];
    if (cannotReassign.includes(task.status as TaskStatus)) {
      throw new BadRequestException(`Cannot assign a task with status ${task.status}`);
    }

    // Verify the worker: normally a member of the TASK's org; also allow anyone
    // assigned to the task's SPACE (owner-org members, or guest members a CONTROL
    // guest added cross-org — those rows are only ever created for the caller's own
    // users, so no arbitrary user can be injected here).
    let worker = await workerToAssign(this.prisma, data.workerId, task.organizationId);
    if (!worker && task.spaceId) {
      const member = await this.prisma.spaceAssignment.findFirst({
        where: {
          spaceId: task.spaceId,
          userId: data.workerId,
          // Only an ACTIVE assignment (mirrors the roster/routing window).
          ...notEndedWhere(),
        },
        select: { id: true },
      });
      if (member) {
        worker = await workerToAssign(this.prisma, data.workerId);
      }
    }

    if (!worker) {
      throw new NotFoundException('Worker not found or not in your organization');
    }

    // No extra query: the worker row above is loaded whole.
    if (!canReceiveTasks(worker)) {
      throw new BadRequestException(
        `${worker.firstName} ${worker.lastName} cannot be assigned tasks — their access profile does not include the Tasks feature.`,
      );
    }

    // …and qualified for THIS task type. Costs one indexed probe that returns
    // nothing unless the organization has made a certificate mandatory.
    await this.assertAssigneesAreQualified([worker.id], [worker], task.workflowId, task.organizationId);

    const previousAssignee = task.assignedToId;
    const isReassign = previousAssignee && previousAssignee !== data.workerId;

    const updatedTask = await this.prisma.task.update({
      where: { id: data.id },
      data: {
        assignedToId: data.workerId,
        status: TaskStatus.ASSIGNED, // Reset to ASSIGNED on (re)assign
      },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    if (isReassign) {
      /*
        The old lead keeps their crew row (demoted to MEMBER below): that is a change
        of LEAD, as a permanent hand-over writes it — never an UNASSIGNED, which job
        time reads as them LEAVING the job while they are still on it.
      */
      const staysOnCrew = await this.prisma.taskAssignee.findUnique({
        where: { taskId_userId: { taskId: data.id, userId: previousAssignee } },
        select: { id: true },
      });
      if (staysOnCrew) {
        await this.prisma.taskEvent.create({
          data: {
            taskId: data.id,
            userId: data.userId,
            eventType: DbEventType.LEAD_CHANGED,
            metadata: { from: previousAssignee, to: data.workerId, toName: personName(worker), scope: 'PERMANENT', by: 'OFFICE' },
          },
        });
      } else {
        await this.support.createTaskEvent(data.id, data.userId, TaskEventType.UNASSIGNED, {
          previousWorkerId: previousAssignee,
        });
      }
    }

    await this.support.createTaskEvent(data.id, data.userId, TaskEventType.ASSIGNED, {
      workerId: data.workerId,
      workerName: personName(worker),
    });

    /*
      ⚠️ And write the ROW, which this never did.

      Assigning set the column and left `task_assignees` untouched, so the two
      models disagreed the moment either was used: assign Mike, then add Sarah
      through the picker, and the primary is recomputed from the rows — where
      Mike does not appear — so Sarah silently becomes the lead and Mike stops
      being responsible for work he was given.

      "Assign" means "make this person the LEAD", so the row says LEAD and any
      previous lead is demoted. Co-assignees are kept: they are doing the same
      job, and reassigning the lead is not a reason to take everybody else off.
    */
    await this.prisma.taskAssignee.updateMany({
      where: { taskId: data.id, role: 'LEAD' },
      data: { role: 'MEMBER' },
    });
    const alreadyOn = !!(await this.prisma.taskAssignee.findUnique({
      where: { taskId_userId: { taskId: data.id, userId: data.workerId } },
      select: { id: true },
    }));
    await this.prisma.taskAssignee.upsert({
      where: { taskId_userId: { taskId: data.id, userId: data.workerId } },
      create: { taskId: data.id, userId: data.workerId, role: 'LEAD' },
      update: { role: 'LEAD' },
    });

    // The primary, the status and the notification — the same writer as every
    // other path. It re-derives `assignedToId` from the rows, which now agree.
    await this.crewChange.afterAssigneesChanged(data.id, alreadyOn ? [] : [data.workerId], data.userId);

    this.support.invalidateStatusCountsCache(updatedTask.organizationId);

    return success(updatedTask);
  }

  /**
   * Add an assignee to a task
   */
  /** For the role pool: the picker's own refusals (access profile, credentials). */
  async assertCanReceiveTasks(ids: string[], workflowId: string | null | undefined, organizationId: string) {
    return this.assertAssigneesCanReceiveTasks(ids, workflowId, organizationId);
  }

  /** For the role pool: may this caller assign work on this task? (the same rule as the picker) */
  async assertMayAssignTask(
    taskId: string,
    data: { userRole: string; canAssignTasks?: boolean; assignSpaceIds?: string[] },
  ) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { spaceId: true } });
    if (!task) throw new NotFoundException('Task not found');
    assertMayAssign(task, data);
  }

  /**
   * Get task assignees (READ - for direct microservice calls)
   */
  async getAssignees(data: {
    taskId: string;
    userId: string;
    userRole: string;
    canViewAllTasks?: boolean;
    organizationId: string;
  }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.support.taskAccess.assert(task, data, { roleHolderMayRead: true });

    const assignees = await this.prisma.taskAssignee.findMany({
      where: { taskId: data.taskId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return success(assignees);
  }
}
