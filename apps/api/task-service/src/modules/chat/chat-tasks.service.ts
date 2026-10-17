import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import { CHAT_CODES, SERVICE_NAMES, taskChatClosed } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TaskAccessService, type TaskAccessFacts } from '../../common/task-access/task-access.service';
import { WorkflowConfigCache } from '../../common/cache/workflow-config-cache.service';
import { CHAT_TASK_SELECT, CHAT_USER_SELECT, shapeConversation } from './chat-shape';
import { announceMembersChanged } from './chat-system';
import type { ChatMembership } from './chat-membership';

/** What the job gate and the "is it over" rule need of a task. */
const TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  organizationId: true,
  spaceId: true,
  assignedToId: true,
  workflowId: true,
  space: { select: { workflowId: true } },
} as const;

/**
 * Who is on a job's crew: its assignee rows and the primary assignee — active
 * people of the job's own organization, never a portal customer.
 */
async function crewOf(
  prisma: PrismaService,
  task: { id: string; organizationId: string; assignedToId: string | null },
): Promise<string[]> {
  const rows = await prisma.taskAssignee.findMany({ where: { taskId: task.id }, select: { userId: true } });
  const ids = [...new Set([...rows.map((r) => r.userId), ...(task.assignedToId ? [task.assignedToId] : [])])];
  if (ids.length === 0) return [];
  const people = await prisma.user.findMany({
    where: { id: { in: ids }, organizationId: task.organizationId, isActive: true, role: { not: 'CUSTOMER' } },
    select: { id: true },
  });
  return people.map((p) => p.id);
}

/**
 * A job's chat follows its crew — called after EVERY crew change
 * (TaskAssignmentService.afterAssigneesChanged). Adds the crew, removes CREW
 * rows of people taken off it, and never touches anybody else: the office
 * (OFFICE rows) is decided by the job gate, not by the crew.
 *
 * ⚠️ Never adds somebody who is not on the crew. A job with no chat yet costs
 * one indexed read and nothing else.
 */
export async function syncTaskChatCrew(
  prisma: PrismaService,
  notificationClient: ClientProxy,
  taskId: string,
): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { taskId },
    select: { id: true, members: { select: { id: true, userId: true, joinedVia: true } } },
  });
  if (!conversation) return;
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, organizationId: true, assignedToId: true },
  });
  if (!task) return;
  const crew = new Set(await crewOf(prisma, task));
  const byUser = new Map(conversation.members.map((m) => [m.userId, m]));

  const add = [...crew].filter((id) => !byUser.has(id));
  // Somebody the office had in it and now on the crew: from now on the crew decides.
  const promote = conversation.members.filter((m) => crew.has(m.userId) && m.joinedVia !== 'CREW').map((m) => m.id);
  const remove = conversation.members.filter((m) => m.joinedVia === 'CREW' && !crew.has(m.userId));
  if (add.length === 0 && promote.length === 0 && remove.length === 0) return;

  await prisma.$transaction([
    prisma.conversationMember.createMany({
      data: add.map((userId) => ({ conversationId: conversation.id, userId, joinedVia: 'CREW' as const })),
      skipDuplicates: true,
    }),
    prisma.conversationMember.updateMany({ where: { id: { in: promote } }, data: { joinedVia: 'CREW' } }),
    prisma.conversationMember.deleteMany({ where: { id: { in: remove.map((m) => m.id) } } }),
  ]);
  const removedIds = remove.map((m) => m.userId);
  const stayed = conversation.members.map((m) => m.userId).filter((id) => !removedIds.includes(id));
  if (add.length || removedIds.length)
    announceMembersChanged(notificationClient, conversation.id, [...stayed, ...add], removedIds);
}

/**
 * A job's chat (docs/plans/chat-team.md phase 3, D4).
 *
 *  - Created on FIRST OPEN, by anybody the normal job gate lets in — not for
 *    every job.
 *  - Its members are the crew (CREW, kept by `syncTaskChatCrew`) and the
 *    office people who opened it (OFFICE). An OFFICE member is asked the job
 *    gate again on every read and write; failing it takes them out.
 *  - When the job is over (finished or cancelled) it stays readable and takes
 *    no new messages — `taskChatClosed`, asked of the live status.
 *  - Same organization only: a guest of a shared workspace reads the job, not
 *    its crew's conversation.
 */
@Injectable()
export class ChatTasksService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    private readonly taskAccess: TaskAccessService,
    private readonly workflows: WorkflowConfigCache,
  ) {}

  async open(data: TaskAccessFacts & { taskId: string }) {
    const task = await this.gate(data.taskId, data);
    const crew = await crewOf(this.prisma, task);

    let conversation = await this.prisma.conversation.findUnique({ where: { taskId: task.id }, select: { id: true } });
    if (!conversation) {
      const office = crew.includes(data.userId) ? [] : [data.userId];
      try {
        conversation = await this.prisma.conversation.create({
          data: {
            organizationId: task.organizationId,
            type: 'TASK',
            taskId: task.id,
            createdById: data.userId,
            members: {
              create: [
                ...crew.map((userId) => ({ userId, joinedVia: 'CREW' as const })),
                ...office.map((userId) => ({ userId, joinedVia: 'OFFICE' as const })),
              ],
            },
          },
          select: { id: true },
        });
        announceMembersChanged(this.notificationClient, conversation.id, [...crew, ...office]);
      } catch (e) {
        // Two people opened it at once: one created it, the other uses it.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        conversation = await this.prisma.conversation.findUniqueOrThrow({
          where: { taskId: task.id },
          select: { id: true },
        });
      }
    }
    // Caught up with the crew on every open — a change the hook missed heals here.
    await syncTaskChatCrew(this.prisma, this.notificationClient, task.id);
    if (!crew.includes(data.userId)) {
      const before = await this.prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId: conversation.id, userId: data.userId } },
        select: { id: true },
      });
      if (!before) {
        await this.prisma.conversationMember.create({
          data: { conversationId: conversation.id, userId: data.userId, joinedVia: 'OFFICE' },
        });
        const all = await this.prisma.conversationMember.findMany({
          where: { conversationId: conversation.id },
          select: { userId: true },
        });
        announceMembersChanged(
          this.notificationClient,
          conversation.id,
          all.map((m) => m.userId),
        );
      }
    }

    const row = await this.prisma.conversation.findUnique({
      where: { id: conversation.id },
      include: { members: { include: { user: CHAT_USER_SELECT } }, task: CHAT_TASK_SELECT },
    });
    // The conversation was found or created above, so the row exists.
    return { success: true, data: shapeConversation(row!, data.userId, await this.isOver(task)) };
  }

  /**
   * May this member READ a job's chat? The crew may; an OFFICE member only
   * while the job gate still lets them in — failing it takes them out (404).
   * Not a job's chat: nothing to ask.
   */
  async assertMayRead(membership: ChatMembership, facts?: TaskAccessFacts) {
    if (membership.conversation.type !== 'TASK' || membership.joinedVia !== 'OFFICE') return;
    const taskId = membership.conversation.taskId;
    const ok = !!taskId && !!facts && (await this.passesGate(taskId, { ...facts, userId: membership.userId }));
    if (!ok) {
      await this.prisma.conversationMember.deleteMany({ where: { id: membership.id } });
      announceMembersChanged(
        this.notificationClient,
        membership.conversationId,
        membership.conversation.members.map((m) => m.userId),
        [membership.userId],
      );
      throw new NotFoundException('Conversation not found');
    }
  }

  /** May this member WRITE (send, upload, edit) in a job's chat? Readable, and the job not over. */
  async assertMayWrite(membership: ChatMembership, facts?: TaskAccessFacts) {
    if (membership.conversation.type !== 'TASK') return;
    await this.assertMayRead(membership, facts);
    const task = membership.conversation.taskId
      ? await this.prisma.task.findUnique({ where: { id: membership.conversation.taskId }, select: TASK_SELECT })
      : null;
    if (!task || (await this.isOver(task))) {
      throw new ConflictException({ message: 'This job is over, so its chat is closed', code: CHAT_CODES.TASK_CLOSED });
    }
  }

  /** Of these conversations, the job chats whose job is over — for the list's "closed". */
  async closedIds(
    rows: Array<{ id: string; type: string; task?: { status: string } | null; taskId?: string | null }>,
  ): Promise<Set<string>> {
    const ids = rows.filter((r) => r.type === 'TASK' && r.taskId).map((r) => r.taskId as string);
    if (ids.length === 0) return new Set();
    const tasks = await this.prisma.task.findMany({ where: { id: { in: ids } }, select: TASK_SELECT });
    const over = new Set<string>();
    for (const t of tasks) if (await this.isOver(t)) over.add(t.id);
    return new Set(rows.filter((r) => r.taskId && over.has(r.taskId)).map((r) => r.id));
  }

  // ── helpers ──────────────────────────────────────────────────────────────────

  /** The job, if this caller may see it in their OWN organization. 404 otherwise — a refusal confirms nothing. */
  private async gate(taskId: string, facts: TaskAccessFacts) {
    if (typeof taskId !== 'string' || !taskId || facts.userRole === 'CUSTOMER')
      throw new NotFoundException('Task not found');
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: TASK_SELECT });
    const own = { ...facts, sharedSpaceIds: [] };
    if (!task || task.organizationId !== facts.organizationId || !(await this.taskAccess.allows(task, own))) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  private async passesGate(taskId: string, facts: TaskAccessFacts) {
    return this.gate(taskId, facts).then(
      () => true,
      () => false,
    );
  }

  /** Over = finished or cancelled, by the job's own flow (cached), else the canonical statuses. */
  private async isOver(task: {
    status: string;
    organizationId: string;
    workflowId: string | null;
    space?: { workflowId: string | null } | null;
  }) {
    const workflow = await this.workflows.getWorkflow(
      task.organizationId,
      task.workflowId ?? task.space?.workflowId ?? null,
    );
    return taskChatClosed(task.status, (workflow?.statuses ?? []));
  }
}
