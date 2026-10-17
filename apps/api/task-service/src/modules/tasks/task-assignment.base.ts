import { Injectable, Logger, BadRequestException, Inject, forwardRef } from '@nestjs/common';
// TYPE only: role-pool.service imports tasks.service, which imports the services that extend this base.
// A value import here would load that loop before this class exists ("Class extends value undefined").
import type { RolePoolService } from './role-pool.service';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { personName, TaskStatus, credentialStanding, credentialBlocks } from '@hbcfield/shared';
import { TaskSupportService } from './task-support.service';
import { syncTaskChatCrew } from '../chat/chat-tasks.service';

/**
 * What the assignment services share: whether the people are qualified, and the
 * ONE thing every crew change runs afterwards (rooms, chat crew, open places, the
 * primary assignee).
 */
@Injectable()
export abstract class TaskAssignmentBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') protected readonly notificationClient: ClientProxy,
    protected readonly support: TaskSupportService,
    // A task open to a WORK role (shared tasks/role-pool.ts) — beside the name flow.
    @Inject(forwardRef(() => require('./role-pool.service').RolePoolService))
    protected readonly rolePool: RolePoolService,
  ) {}

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
        problems.push(`${personName(user)} (${missing.map((t) => t.label).join(', ')})`);
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

  /** For the role pool: a crew change goes through the office's own path (primary, status, push). */
  async onAssigneesChanged(taskId: string, newlyAssigned: string[], actorId: string) {
    await this.afterAssigneesChanged(taskId, newlyAssigned, actorId);
    const t = await this.prisma.task.findUnique({ where: { id: taskId }, select: { organizationId: true } });
    if (t) this.support.invalidateStatusCountsCache(t.organizationId);
  }

  protected async afterAssigneesChanged(
    taskId: string,
    newlyAssigned: string[],
    /** Who made the change. Carried on the event so nobody is emailed about their own action. */
    actorId: string,
  ): Promise<void> {
    await this.syncPrimaryAssignee(taskId);
    // A role task's places follow its crew, however the crew changed (the picker too).
    await this.rolePool.syncSpots(taskId);
    // A lead handed over for today ends when that person is no longer on the crew (shared crew.ts).
    const lead = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { leadOverrideId: true, assignedToId: true },
    });
    if (lead?.leadOverrideId && lead.leadOverrideId !== lead.assignedToId) {
      const still = await this.prisma.taskAssignee.findUnique({
        where: { taskId_userId: { taskId, userId: lead.leadOverrideId } },
        select: { id: true },
      });
      if (!still)
        await this.prisma.task.update({
          where: { id: taskId },
          data: { leadOverrideId: null, leadOverrideUntil: null },
        });
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

    // The job's chat follows its crew (a job with no chat yet: one indexed read).
    await syncTaskChatCrew(this.prisma, this.notificationClient, taskId);

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
      select: {
        id: true,
        title: true,
        organizationId: true,
        status: true,
        dueDate: true,
        priority: true,
        description: true,
        locationAddress: true,
      },
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
  protected async syncPrimaryAssignee(taskId: string) {
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
}
