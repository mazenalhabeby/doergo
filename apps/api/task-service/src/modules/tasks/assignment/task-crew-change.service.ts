import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService, TaskStatus } from '@hbcfield/shared';
import { TaskSupportService } from '../core/task-support.service';
import { syncTaskChatCrew } from '../../chat/chat-tasks.service';
import { emitEvent, taskAssignedEvent } from '@hbcfield/shared/microservices';
import { RoleOpeningService } from './role-opening.service';

/**
 * The ONE thing every crew change runs afterwards — rooms, chat crew, open places, the primary
 * assignee, the status and the push — whichever path changed the crew (assign, the picker, a
 * role taken or handed back, a leaver released).
 */
@Injectable()
export class TaskCrewChangeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly support: TaskSupportService,
    /** Places on a task open to a role follow the crew (syncSpots). */
    private readonly roleOpening: RoleOpeningService,
  ) {}

  /** For the role pool: a crew change goes through the office's own path (primary, status, push). */
  async onAssigneesChanged(taskId: string, newlyAssigned: string[], actorId: string) {
    await this.afterAssigneesChanged(taskId, newlyAssigned, actorId);
    const t = await this.prisma.task.findUnique({ where: { id: taskId }, select: { organizationId: true } });
    if (t) this.support.invalidateStatusCountsCache(t.organizationId);
  }

  async afterAssigneesChanged(
    taskId: string,
    newlyAssigned: string[],
    /** Who made the change. Carried on the event so nobody is emailed about their own action. */
    actorId: string,
  ): Promise<void> {
    await this.syncPrimaryAssignee(taskId);
    // A role task's places follow its crew, however the crew changed (the picker too).
    await this.roleOpening.syncSpots(taskId);
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
    // Somebody on it: the primary written just above (a crew left empty stays NEW).
    await this.prisma.task.updateMany({
      where: { id: taskId, status: TaskStatus.NEW, assignedToId: { not: null } },
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
      emitEvent(this.notificationClient, taskAssignedEvent, {
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
      select: { id: true, userId: true },
    });
    const primary =
      lead ??
      (await this.prisma.taskAssignee.findFirst({
        where: { taskId },
        // The first person put on it — stable, and it does not change under
        // somebody just because a colleague was added later.
        orderBy: { createdAt: 'asc' },
        select: { id: true, userId: true },
      }));
    /*
      ⚠️ No LEAD row and people still on it (the lead handed back, was taken off,
      declined or left): the earliest of them IS the lead now, written as the row.
      Left as MEMBERs only, the next person to take a place found "no lead" and
      jumped ahead of everybody already on the job.
    */
    if (!lead && primary) {
      await this.prisma.taskAssignee.updateMany({ where: { id: primary.id, role: 'MEMBER' }, data: { role: 'LEAD' } });
    }

    await this.prisma.task.update({
      where: { id: taskId },
      data: { assignedToId: primary?.userId ?? null },
    });
  }
}
