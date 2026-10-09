import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { CrewService } from './handover/crew.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { type TaskAccessFacts } from '../../common/task-access/task-access.service';
import {
  TaskEventType,
  success,
  checklistCompletion,
  mayChangeChecklistOwner,
  mayEditChecklistItem,
  CHECKLIST_CODES,
  type ChecklistAuthority,
  type ChecklistVerdict,
  type ResolvedAccess,
} from '@hbcfield/shared';
import { TaskSupportService } from './task-support.service';

/** Who owns a checklist item and who ticked it — names only, for the screens (shared tasks/checklist.ts). */
export const CHECKLIST_PEOPLE = {
  assignee: { select: { id: true, firstName: true, lastName: true } },
  completedBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

/** The grants an owner change is judged on — the gateway forwards them, never the client. */
export type ChecklistActor = { canAssignTasks?: boolean; access?: ResolvedAccess | null };

/**
 * A task's checklist: items, their owners on the crew, and who ticked them
 * (shared tasks/checklist.ts).
 */
@Injectable()
export class TaskChecklistService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    // A crew on one job: presence, own stops, the lead (shared tasks/crew.ts).
    private readonly crew: CrewService,
    private readonly support: TaskSupportService,
  ) {}

  /**
   * Add a checklist item to a task
   */
  async addChecklistItem(data: TaskAccessFacts & ChecklistActor & {
    taskId: string;
    text: string;
    position?: number;
    /** Whose part it is — somebody on the crew, judged like any owner change. */
    assigneeId?: string | null;
  }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.support.taskAccess.assert(task, data);
    const assigneeId = data.assigneeId ?? null;
    if (assigneeId) this.refuseChecklist(mayChangeChecklistOwner(await this.checklistAuthorityOnce(data)(), null, assigneeId));

    // Determine position: use provided or append at end
    let position = data.position;
    if (position === undefined || position === null) {
      const lastItem = await this.prisma.checklistItem.findFirst({
        where: { taskId: data.taskId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      position = (lastItem?.position ?? -1) + 1;
    }

    const item = await this.prisma.checklistItem.create({
      data: { taskId: data.taskId, text: data.text, position, assigneeId },
      include: CHECKLIST_PEOPLE,
    });

    await this.support.createTaskEvent(data.taskId, data.userId, TaskEventType.CHECKLIST_ITEM_ADDED, {
      itemId: item.id,
      text: data.text,
      ...(assigneeId ? { assigneeId } : {}),
    });

    this.notificationClient.emit('task_updated', { task: { ...task, id: data.taskId } });

    return success(item);
  }

  /**
   * Update a checklist item (toggle completion or update text)
   */
  async updateChecklistItem(data: TaskAccessFacts & ChecklistActor & {
    taskId: string;
    itemId: string;
    text?: string;
    isCompleted?: boolean;
    /** A new owner (somebody on the crew), or null for nobody. Absent = unchanged. */
    assigneeId?: string | null;
  }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.support.taskAccess.assert(task, data);

    const existing = await this.prisma.checklistItem.findFirst({
      where: { id: data.itemId, taskId: data.taskId },
      select: { id: true, text: true, assigneeId: true, isCompleted: true },
    });
    if (!existing) throw new NotFoundException('Checklist item not found');

    const ownerChange = data.assigneeId !== undefined && (data.assigneeId ?? null) !== existing.assigneeId;
    const textChange = data.text !== undefined && data.text !== existing.text;
    const toggled = data.isCompleted !== undefined && data.isCompleted !== existing.isCompleted;
    // Who leads and who is on the crew — read once, and only when a rule needs it.
    const authority = this.checklistAuthorityOnce(data);
    if (ownerChange) this.refuseChecklist(mayChangeChecklistOwner(await authority(), existing.assigneeId, data.assigneeId ?? null));
    if (textChange) this.refuseChecklist(mayEditChecklistItem(await authority(), existing.assigneeId));
    if (!ownerChange && !textChange && !toggled) {
      return success(await this.prisma.checklistItem.findUniqueOrThrow({ where: { id: existing.id }, include: CHECKLIST_PEOPLE }));
    }

    /*
      ⚠️ WRITTEN ONLY IF NOBODY GOT THERE FIRST. Two people pressing "Take it"
      together both read the item as free; an unconditional write let the second
      silently erase the first. The write is conditional on what was read, and
      the loser is told (409) rather than shown an ownership that is gone.
    */
    const written = await this.prisma.checklistItem.updateMany({
      where: { id: existing.id, taskId: data.taskId, assigneeId: existing.assigneeId, isCompleted: existing.isCompleted },
      data: {
        ...(textChange ? { text: data.text } : {}),
        // A tick records who and when (shared checklistCompletion), from the token.
        ...(toggled ? checklistCompletion(data.isCompleted!, data.userId, new Date()) : {}),
        ...(ownerChange ? { assigneeId: data.assigneeId ?? null } : {}),
      },
    });
    if (written.count === 0) {
      throw new ConflictException({ message: 'Somebody changed this item just now. Look again.', code: CHECKLIST_CODES.CHANGED });
    }
    const item = await this.prisma.checklistItem.findUniqueOrThrow({ where: { id: existing.id }, include: CHECKLIST_PEOPLE });

    if (toggled) {
      await this.support.createTaskEvent(data.taskId, data.userId, TaskEventType.CHECKLIST_ITEM_TOGGLED, {
        itemId: item.id,
        text: item.text,
        isCompleted: item.isCompleted,
        ...(item.assigneeId && item.assigneeId !== data.userId ? { assigneeId: item.assigneeId } : {}),
      });
    }
    if (ownerChange) {
      await this.support.createTaskEvent(data.taskId, data.userId, TaskEventType.CHECKLIST_ITEM_ASSIGNED, {
        itemId: item.id,
        text: item.text,
        fromUserId: existing.assigneeId,
        toUserId: item.assigneeId,
        toName: item.assignee ? `${item.assignee.firstName} ${item.assignee.lastName}`.trim() : null,
      });
    }

    this.notificationClient.emit('task_updated', { task: { ...task, id: data.taskId } });

    return success(item);
  }

  /** The crew's authority over this job's checklist, read at most once per request (CrewService). */
  private checklistAuthorityOnce(data: TaskAccessFacts & ChecklistActor & { taskId: string }) {
    let once: Promise<ChecklistAuthority> | null = null;
    return () => (once ??= this.crew.checklistAuthority(data.taskId, {
      userId: data.userId, userRole: data.userRole, organizationId: data.organizationId,
      canAssignTasks: data.canAssignTasks, access: data.access,
    }));
  }

  /**
   * Turn a "no" from the shared rules into the refusal the screens translate.
   * Something the caller may not do with somebody else's item is 403; a target
   * off the crew is 400. The task gate has run, so nothing here leaks a job.
   */
  private refuseChecklist(verdict: ChecklistVerdict): void {
    if (verdict.ok) return;
    if (verdict.code === CHECKLIST_CODES.OWNER_NOT_ON_CREW) {
      throw new BadRequestException({ message: 'Choose somebody on this job.', code: verdict.code });
    }
    throw new ForbiddenException({
      message: verdict.code === CHECKLIST_CODES.ITEM_NOT_YOURS
        ? 'Only the person it belongs to, the leader of this job, or the office changes this item.'
        : 'Only the leader of this job, or the office, gives an item to somebody.',
      code: verdict.code,
    });
  }

  /**
   * Delete a checklist item
   */
  async deleteChecklistItem(data: TaskAccessFacts & ChecklistActor & {
    taskId: string;
    itemId: string;
  }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.support.taskAccess.assert(task, data);

    const existing = await this.prisma.checklistItem.findFirst({
      where: { id: data.itemId, taskId: data.taskId },
    });
    if (!existing) throw new NotFoundException('Checklist item not found');
    // Somebody else's item is removed only by them, the leader or the office (shared mayEditChecklistItem).
    if (existing.assigneeId && existing.assigneeId !== data.userId) {
      this.refuseChecklist(mayEditChecklistItem(await this.checklistAuthorityOnce(data)(), existing.assigneeId));
    }

    await this.prisma.checklistItem.delete({ where: { id: data.itemId } });

    await this.support.createTaskEvent(data.taskId, data.userId, TaskEventType.CHECKLIST_ITEM_REMOVED, {
      itemId: data.itemId,
      text: existing.text,
    });

    this.notificationClient.emit('task_updated', { task: { ...task, id: data.taskId } });

    return success(null, 'Checklist item deleted');
  }

  /**
   * Reorder checklist items
   */
  async reorderChecklist(data: {
    taskId: string;
    itemIds: string[];
    userId: string;
    userRole: string;
    canViewAllTasks?: boolean;
    organizationId: string;
  }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.support.taskAccess.assert(task, data);

    // Update positions in a transaction
    await this.prisma.$transaction(
      data.itemIds.map((itemId, index) =>
        this.prisma.checklistItem.updateMany({
          where: { id: itemId, taskId: data.taskId },
          data: { position: index },
        }),
      ),
    );

    // Fetch the reordered items
    const items = await this.prisma.checklistItem.findMany({
      where: { taskId: data.taskId },
      orderBy: { position: 'asc' },
      include: CHECKLIST_PEOPLE,
    });

    return success(items);
  }

  /**
   * Get task checklist items (READ - for direct microservice calls)
   */
  async getChecklist(data: {
    taskId: string;
    userId: string;
    userRole: string;
    canViewAllTasks?: boolean;
    organizationId: string;
  }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.support.taskAccess.assert(task, data, { roleHolderMayRead: true });

    const items = await this.prisma.checklistItem.findMany({
      where: { taskId: data.taskId },
      orderBy: { position: 'asc' },
      include: CHECKLIST_PEOPLE,
    });

    return success(items);
  }
}
