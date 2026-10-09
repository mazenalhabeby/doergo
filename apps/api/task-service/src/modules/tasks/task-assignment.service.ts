import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { RolePoolService } from './role-pool.service';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  TaskStatus,
  TaskEventType,
  success,
  accessAllowsInSpace,
  canReceiveTasks,
  credentialStanding,
  credentialBlocks,
  TERMINAL_STATUSES,
} from '@hbcfield/shared';
import { TaskSupportService } from './task-support.service';
import { assertMayAssign, assertTargetIsInSpace } from './task-scope';

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
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly support: TaskSupportService,
    // A task open to a WORK role (shared tasks/role-pool.ts) — beside the name flow.
    @Inject(forwardRef(() => RolePoolService)) private readonly rolePool: RolePoolService,
  ) {}

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
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, role: true, enabledModules: true, firstName: true, lastName: true },
    });
    const blocked = users.filter((u) => !canReceiveTasks(u));
    if (blocked.length > 0) {
      const names = blocked.map((u) => `${u.firstName} ${u.lastName}`.trim()).join(', ');
      throw new BadRequestException(
        `${names} cannot be assigned tasks — their access profile does not include the Tasks feature.`,
      );
    }

    await this.assertAssigneesAreQualified(unique, users, workflowId, organizationId);
  }

  /**
   * Refuse an assignment to somebody whose required credential is missing or expired.
   *
   * MISSING is as disqualifying as EXPIRED, deliberately. "You must hold a gas
   * certificate to do gas work" does not become untrue because nobody ever
   * uploaded one — and a gate that let an absent credential through would be
   * satisfied by never providing it.
   *
   * EXPIRING is not blocked. Losing a technician a month early causes exactly
   * the scramble this exists to prevent; that case is a reminder, not a refusal.
   */
  async assertAssigneesAreQualified(
    userIds: string[],
    users: { id: string; firstName: string; lastName: string }[],
    workflowId?: string | null,
    organizationId?: string | null,
  ) {
    if (!workflowId || !organizationId) return;

    // The short-circuit. Indexed on [organizationId, isCredential]; an
    // organization that gates nothing gets an empty result and returns here,
    // before the second query is ever built.
    const gatingTypes = await this.prisma.documentType.findMany({
      where: {
        organizationId,
        isCredential: true,
        isActive: true,
        requiredForWorkflowIds: { has: workflowId },
      },
      select: { id: true, label: true },
    });
    if (gatingTypes.length === 0) return;

    // What these people actually hold. One query for everyone, never one each.
    const held = await this.prisma.document.findMany({
      where: {
        organizationId,
        userId: { in: userIds },
        typeId: { in: gatingTypes.map((t) => t.id) },
        status: { in: ['ISSUED', 'SIGNED'] },
      },
      select: { userId: true, typeId: true, expiresOn: true },
    });

    const now = new Date();
    const valid = new Set<string>();
    for (const doc of held) {
      // A credential with no expiry does not lapse; one past its date does.
      if (!credentialBlocks(credentialStanding(doc.expiresOn, now))) {
        valid.add(`${doc.userId}:${doc.typeId}`);
      }
    }

    const problems: string[] = [];
    for (const user of users) {
      const missing = gatingTypes.filter((t) => !valid.has(`${user.id}:${t.id}`));
      if (missing.length > 0) {
        problems.push(
          `${`${user.firstName} ${user.lastName}`.trim()} (${missing.map((t) => t.label).join(', ')})`,
        );
      }
    }

    if (problems.length > 0) {
      // Names the person AND the credential, because "cannot be assigned" on
      // its own sends a dispatcher hunting through settings.
      throw new BadRequestException(
        `Cannot assign — a required certificate is missing or expired: ${problems.join('; ')}`,
      );
    }
  }

  async assign(data: {
    id: string;
    workerId: string;
    userId: string;
    userRole: string;
    canViewAllTasks?: boolean;
    /** The ORG-wide resolution of canAssignTasks. */
    canAssignTasks?: boolean;
    /** Spaces where the caller holds canAssignTasks through a SPACE role. */
    assignSpaceIds?: string[];
    organizationId: string;
  }) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Authorization: own-org tasks always; a foreign task ONLY with a cross-org
    // CONTROL grant (canAssignTasks) for that task's real space.
    if (task.organizationId !== data.organizationId) {
      if (!task.spaceId || !accessAllowsInSpace((data as any).access, 'canAssignTasks', task.spaceId)) {
        this.logger.warn(`Authorization denied: assign task across orgs`, { userId: data.userId, taskId: data.id });
        throw new ForbiddenException('You can only assign tasks in your organization');
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
    let worker = await this.prisma.user.findFirst({
      where: { id: data.workerId, organizationId: task.organizationId, isActive: true },
    });
    if (!worker && task.spaceId) {
      const member = await this.prisma.spaceAssignment.findFirst({
        where: {
          spaceId: task.spaceId,
          userId: data.workerId,
          // Only an ACTIVE assignment (mirrors the roster/routing window).
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
        },
        select: { id: true },
      });
      if (member) {
        worker = await this.prisma.user.findFirst({ where: { id: data.workerId, isActive: true } });
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
    await this.assertAssigneesAreQualified(
      [worker.id],
      [worker],
      task.workflowId,
      task.organizationId,
    );

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
      await this.support.createTaskEvent(data.id, data.userId, TaskEventType.UNASSIGNED, {
        previousWorkerId: previousAssignee,
      });
    }

    await this.support.createTaskEvent(data.id, data.userId, TaskEventType.ASSIGNED, {
      workerId: data.workerId,
      workerName: `${worker.firstName} ${worker.lastName}`,
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
    await this.afterAssigneesChanged(data.id, alreadyOn ? [] : [data.workerId], data.userId);

    this.support.invalidateStatusCountsCache(updatedTask.organizationId);

    return success(updatedTask);
  }

  /**
   * Decline task assignment (TECHNICIAN only)
   * Returns task to NEW status and removes assignment
   */
  async decline(data: { id: string; userId: string; userRole: string; canViewAllTasks?: boolean; organizationId: string }) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    /*
      A decline can arrive hours after the tap, from a phone that was offline.
      By then the office may have given the job to someone else, or it may
      have moved on — each is said with a code the phone can put in words,
      rather than a bare 403/400 that reads as "the app broke".
    */
    // A task taken from a ROLE goes back to the role — re-offered — never to nobody.
    if (task.openRoleId) {
      return this.rolePool.returnToRole({ taskId: task.id, userId: data.userId, organizationId: data.organizationId, reason: (data as any).reason ?? null });
    }
    if (task.assignedToId !== data.userId) {
      throw new ForbiddenException({ message: 'You can only decline tasks assigned to you', code: 'TASK_REASSIGNED' });
    }
    if (task.status !== TaskStatus.ASSIGNED) {
      throw new ConflictException({
        message: `This task was moved to ${task.status} before your decline arrived`,
        code: 'TASK_STATE_CONFLICT',
        params: { current: { id: task.id, status: task.status, assignedToId: task.assignedToId, updatedAt: task.updatedAt } },
      });
    }

    const previousWorker = task.assignedTo;

    // Claimed, not overwritten: a reassignment landing between the read above
    // and this write must not be undone by a decline meant for the old one.
    const claimed = await this.prisma.task.updateMany({
      where: { id: data.id, assignedToId: data.userId, status: TaskStatus.ASSIGNED },
      data: { assignedToId: null, status: TaskStatus.NEW },
    });
    if (claimed.count === 0) {
      const now = await this.prisma.task.findUnique({ where: { id: data.id }, select: { id: true, status: true, assignedToId: true, updatedAt: true } });
      throw new ConflictException({
        message: `This task was changed at the same moment`,
        code: now?.assignedToId === data.userId ? 'TASK_STATE_CONFLICT' : 'TASK_REASSIGNED',
        params: { current: now },
      });
    }
    const updatedTask = await this.prisma.task.findUniqueOrThrow({
      where: { id: data.id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    await this.support.createTaskEvent(data.id, data.userId, TaskEventType.UNASSIGNED, {
      reason: 'Technician declined the assignment',
      previousWorkerId: previousWorker?.id,
      previousWorkerName: previousWorker ? `${previousWorker.firstName} ${previousWorker.lastName}` : null,
    });

    // Notify dispatcher/client that task was declined
    this.notificationClient.emit('task_declined', {
      task: updatedTask,
      declinedBy: previousWorker,
    });

    this.support.invalidateStatusCountsCache(updatedTask.organizationId);

    return success(updatedTask, 'Task declined and returned for reassignment');
  }

  /**
   * Add an assignee to a task
   */
  /** For the role pool: the picker's own refusals (access profile, credentials). */
  async assertCanReceiveTasks(ids: string[], workflowId: string | null | undefined, organizationId: string) {
    return this.assertAssigneesCanReceiveTasks(ids, workflowId, organizationId);
  }

  /** For the role pool: a crew change goes through the office's own path (primary, status, push). */
  async onAssigneesChanged(taskId: string, newlyAssigned: string[], actorId: string) {
    await this.afterAssigneesChanged(taskId, newlyAssigned, actorId);
    const t = await this.prisma.task.findUnique({ where: { id: taskId }, select: { organizationId: true } });
    if (t) this.support.invalidateStatusCountsCache(t.organizationId);
  }

  /** For the role pool: may this caller assign work on this task? (the same rule as the picker) */
  async assertMayAssignTask(taskId: string, data: { userRole: string; canAssignTasks?: boolean; assignSpaceIds?: string[] }) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { spaceId: true } });
    if (!task) throw new NotFoundException('Task not found');
    assertMayAssign(task, data);
  }

  async addAssignee(data: {
    taskId: string;
    userId: string;
    role?: string;
    requestUserId: string;
    userRole: string;
    canViewAllTasks?: boolean;
    /** The ORG-wide resolution of canAssignTasks. */
    canAssignTasks?: boolean;
    /** Spaces where the caller holds canAssignTasks through a SPACE role. */
    assignSpaceIds?: string[];
    organizationId: string;
  }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.organizationId !== data.organizationId) {
      throw new ForbiddenException('You can only manage assignees for tasks in your organization');
    }
    assertMayAssign(task, data);
    await assertTargetIsInSpace(this.prisma, task, data.userId, data);

    // Verify the target user exists in the organization
    const user = await this.prisma.user.findFirst({
      where: { id: data.userId, organizationId: data.organizationId, isActive: true },
      // role + enabledModules so canReceiveTasks can be answered without a second read.
      select: { id: true, firstName: true, lastName: true, avatarUrl: true, role: true, enabledModules: true },
    });
    if (!user) throw new NotFoundException('User not found or not in your organization');
    if (!canReceiveTasks(user)) {
      throw new BadRequestException(
        `${user.firstName} ${user.lastName} cannot be assigned tasks — their access profile does not include the Tasks feature.`,
      );
    }

    // A second person added to a task is doing the same work as the first, so
    // the same certificate applies.
    const assigneeTask = await this.prisma.task.findFirst({
      where: { id: data.taskId, organizationId: data.organizationId },
      select: { workflowId: true, organizationId: true },
    });
    await this.assertAssigneesAreQualified(
      [user.id],
      [user],
      assigneeTask?.workflowId,
      assigneeTask?.organizationId,
    );

    const role = (data.role as any) || 'MEMBER';

    // If adding as LEAD, demote existing LEAD to MEMBER
    if (role === 'LEAD') {
      await this.prisma.taskAssignee.updateMany({
        where: { taskId: data.taskId, role: 'LEAD' },
        data: { role: 'MEMBER' },
      });
    }

    // Read before the write: after the upsert there is no telling whether this
    // person is new to the task or was already on it in another role.
    const wasAlreadyOn = !!(await this.prisma.taskAssignee.findUnique({
      where: { taskId_userId: { taskId: data.taskId, userId: data.userId } },
      select: { id: true },
    }));

    const assignee = await this.prisma.taskAssignee.upsert({
      where: { taskId_userId: { taskId: data.taskId, userId: data.userId } },
      create: { taskId: data.taskId, userId: data.userId, role },
      update: { role },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
      },
    });

    // Primary, status and the notification — all of it, in one place.
    // `wasAlreadyOn` decides whether this is news: re-adding somebody to change
    // their role must not push them a second time about work they already have.
    await this.afterAssigneesChanged(data.taskId, wasAlreadyOn ? [] : [data.userId], data.requestUserId);

    await this.support.createTaskEvent(data.taskId, data.requestUserId, TaskEventType.ASSIGNEE_ADDED, {
      assigneeId: data.userId,
      assigneeName: `${user.firstName} ${user.lastName}`,
      role,
    });

    this.notificationClient.emit('task_updated', { task: { ...task, id: data.taskId } });

    return success(assignee);
  }

  /**
   * Remove an assignee from a task
   */
  async removeAssignee(data: {
    taskId: string;
    userId: string;
    requestUserId: string;
    userRole: string;
    canViewAllTasks?: boolean;
    canAssignTasks?: boolean;
    assignSpaceIds?: string[];
    organizationId: string;
  }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.organizationId !== data.organizationId) {
      throw new ForbiddenException('You can only manage assignees for tasks in your organization');
    }
    // Taking somebody OFF a job is the same authority as putting them on it.
    assertMayAssign(task, data);

    const existing = await this.prisma.taskAssignee.findUnique({
      where: { taskId_userId: { taskId: data.taskId, userId: data.userId } },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    });
    if (!existing) throw new NotFoundException('Assignee not found on this task');

    await this.prisma.taskAssignee.delete({
      where: { taskId_userId: { taskId: data.taskId, userId: data.userId } },
    });

    // Sync the primary assignedToId field
    // Same writer as every other change to who is on this task. Nobody is newly
    // assigned by a removal, so nobody is told they have new work.
    await this.afterAssigneesChanged(data.taskId, [], data.requestUserId);

    await this.support.createTaskEvent(data.taskId, data.requestUserId, TaskEventType.ASSIGNEE_REMOVED, {
      assigneeId: data.userId,
      assigneeName: existing.user ? `${existing.user.firstName} ${existing.user.lastName}` : '',
    });

    this.notificationClient.emit('task_updated', { task: { ...task, id: data.taskId } });

    return success(null, 'Assignee removed');
  }

  /**
   * Everything that follows from a change to who is on a task.
   *
   * ONE writer, because four had four opinions. `create`, `assign`,
   * `addAssignee` and `removeAssignee` each decided for themselves what an
   * assignment implies, and three of them were wrong in a different way: the
   * primary was cleared, the status never moved, and the person was never told.
   * Each of those was found separately, as a separate bug, from one report.
   *
   * The row mutation stays with the caller — they mean different things by it
   * ("make this one the lead" is not "add a colleague"). What is IDENTICAL
   * afterwards, and therefore lives here:
   *
   *   1. who is primarily responsible
   *   2. that a task with somebody on it is no longer merely NEW
   *   3. that a person given work is TOLD
   *
   * `newlyAssigned` is the caller's answer to "who did not have this before" —
   * only they know, since only they know what the rows looked like going in.
   */
  /**
   * Take somebody who is leaving off every job that is still OPEN.
   *
   * Through the same writer as the office's picker (`afterAssigneesChanged`),
   * so the lead, the role places, the today's-lead hand-over and the open
   * checklist items all follow — the one path that knows every consequence of
   * a crew changing. Finished, closed and canceled jobs keep the person: that
   * is the record of who did the work, and a leaver does not unmake history.
   *
   * Called by `member_offboard` only (members/member-offboard.service.ts).
   */
  async releaseMemberFromOpenWork(organizationId: string, userId: string, actorId: string): Promise<number> {
    const candidates = await this.prisma.task.findMany({
      where: {
        organizationId,
        status: { notIn: TERMINAL_STATUSES },
        OR: [{ assignedToId: userId }, { assignees: { some: { userId } } }],
      },
      select: { id: true, status: true, workflowId: true },
    });
    /*
      ⚠️ "Finished" is the WORKFLOW's word, not ours. The built-in flows end on
      Delivered, Done, Outcome, Submitted — names TERMINAL_STATUSES has never
      heard of. A job in one of those is history, and the person stays on it.
    */
    const flowIds = [...new Set(candidates.map((t) => t.workflowId).filter((x): x is string => !!x))];
    const finished = new Set(
      flowIds.length
        ? (await this.prisma.workflowStatus.findMany({
            where: { workflowId: { in: flowIds }, OR: [{ isFinal: true }, { isCanceled: true }] },
            select: { workflowId: true, key: true },
          })).map((s) => `${s.workflowId}:${s.key}`)
        : [],
    );
    const tasks = candidates.filter((t) => !(t.workflowId && finished.has(`${t.workflowId}:${t.status}`)));
    for (const { id } of tasks) {
      await this.prisma.taskAssignee.deleteMany({ where: { taskId: id, userId } });
      // The primary column too: a job assigned the old way has no crew row to remove.
      await this.prisma.task.updateMany({ where: { id, assignedToId: userId }, data: { assignedToId: null } });
      await this.afterAssigneesChanged(id, [], actorId);
      await this.support.createTaskEvent(id, actorId, TaskEventType.ASSIGNEE_REMOVED, { assigneeId: userId, reason: 'MEMBER_LEFT' });
    }
    return tasks.length;
  }

  private async afterAssigneesChanged(
    taskId: string,
    newlyAssigned: string[],
    /** Who made the change. Carried on the event so nobody is emailed about their own action. */
    actorId: string,
  ): Promise<void> {
    await this.syncPrimaryAssignee(taskId);
    // A role task's places follow its crew, however the crew changed (the picker too).
    await this.rolePool.syncSpots(taskId);
    // A lead handed over for today ends when that person is no longer on the crew (shared crew.ts).
    const lead = await this.prisma.task.findUnique({ where: { id: taskId }, select: { leadOverrideId: true, assignedToId: true } });
    if (lead?.leadOverrideId && lead.leadOverrideId !== lead.assignedToId) {
      const still = await this.prisma.taskAssignee.findUnique({ where: { taskId_userId: { taskId, userId: lead.leadOverrideId } }, select: { id: true } });
      if (!still) await this.prisma.task.update({ where: { id: taskId }, data: { leadOverrideId: null, leadOverrideUntil: null } });
    }
    /*
      An OPEN checklist item owned by somebody taken off the crew goes back to
      nobody (shared tasks/checklist.ts): left owned, they could not give it back
      (no longer on the crew) and nobody could take it (not free). A DONE item
      keeps its owner — that is the record of whose part it was.
    */
    const crew = await this.prisma.taskAssignee.findMany({ where: { taskId }, select: { userId: true } });
    const keep = [...new Set([...crew.map((c) => c.userId), ...(lead?.assignedToId ? [lead.assignedToId] : [])])];
    await this.prisma.checklistItem.updateMany({
      where: { taskId, isCompleted: false, assigneeId: { not: null, notIn: keep } },
      data: { assigneeId: null },
    });

    /*
      A task with somebody on it is ASSIGNED.

      ⚠️ Only the canonical NEW moves. A space with its own workflow starts its
      tasks at that workflow's first status — "Backlog", "Triage" — and this
      cannot know which of ITS steps means "has an owner": WorkflowStatus carries
      isFinal and isCanceled and nothing that says so. Advancing a custom flow by
      guessing would move somebody's board card under them. Until a status can
      declare it, a custom workflow is left exactly alone, and that is a known
      gap rather than an oversight.
    */
    await this.prisma.task.updateMany({
      where: { id: taskId, status: TaskStatus.NEW },
      data: { status: TaskStatus.ASSIGNED },
    });

    if (newlyAssigned.length === 0) return;

    /*
      And tell them.

      `addAssignee` emitted `task_updated` — which announces that a task changed,
      to whoever was already watching it — and never `task_assigned`, which is
      what reaches the person the work was just given to. So being added through
      the picker was silent: no push, no bell, and they found out by opening the
      app. The other three paths have always announced it.
    */
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      // What the assignment email shows — it reads "N/A" for a field left out here.
      select: { id: true, title: true, organizationId: true, status: true, dueDate: true, priority: true, description: true, locationAddress: true },
    });
    if (!task) return;

    for (const workerId of newlyAssigned) {
      this.notificationClient.emit('task_assigned', {
        task,
        workerId,
        actorId,
        watcherIds: await this.support.taskWatcherIds(workerId, task.organizationId),
      });
    }
  }

  /**
   * Keep `assignedToId` in step with the assignee rows.
   *
   * ⚠️ This used to look for a LEAD and nothing else — and `MEMBER` is the
   * DEFAULT role, both in the column and in `addAssignee`. So assigning one
   * person through the assignee picker found no LEAD and actively wrote
   * `assignedToId = null`: the task had somebody on it and read as assigned to
   * nobody. Every surface that shows "assigned to …" from the legacy column
   * showed it as unassigned, which is what made a task assigned on the web look
   * unassigned on the phone.
   *
   * The rule now says what the column has always meant — who is primarily
   * responsible: the LEAD when one is named, otherwise the person who was put on
   * it first. Only a task with NO assignees at all is assigned to nobody.
   *
   * (Reads were never the problem: the list already matches on
   * `assignedToId OR assignees.some`, so the work still appeared. What broke was
   * every display of WHO, and the status that follows from it.)
   */
  private async syncPrimaryAssignee(taskId: string) {
    const lead = await this.prisma.taskAssignee.findFirst({
      where: { taskId, role: 'LEAD' },
      select: { userId: true },
    });
    const primary =
      lead ??
      (await this.prisma.taskAssignee.findFirst({
        where: { taskId },
        // The first person put on it — stable, and it does not change under
        // somebody just because a colleague was added later.
        orderBy: { createdAt: 'asc' },
        select: { userId: true },
      }));

    await this.prisma.task.update({
      where: { id: taskId },
      data: { assignedToId: primary?.userId ?? null },
    });
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
