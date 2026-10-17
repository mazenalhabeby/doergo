import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { createOnce } from '../../common/create-once.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TaskEventType, success } from '@hbcfield/shared';
import { TaskSupportService } from './task-support.service';
import { commentAddedEvent, emitEvent } from '@hbcfield/shared/microservices';

/**
 * What happened on a task: its timeline of events and its comments.
 */
@Injectable()
export class TaskActivityService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly support: TaskSupportService,
  ) {}

  /**
   * Get task timeline/activity
   */
  async getTimeline(data: {
    id: string;
    userId: string;
    userRole: string;
    canViewAllTasks?: boolean;
    organizationId: string;
  }) {
    // First verify access
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.support.taskAccess.assert(task, data, { roleHolderMayRead: true });

    const events = await this.prisma.taskEvent.findMany({
      where: { taskId: data.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    return success(events);
  }

  /**
   * Add a comment to a task
   */
  async addComment(data: {
    /** Id made on the phone — see createOnce. */
    id?: string;
    taskId: string;
    content: string;
    userId: string;
    userRole: string;
    canViewAllTasks?: boolean;
    organizationId: string;
  }) {
    // First verify the task exists and user has access
    const task = await this.prisma.task.findUnique({
      where: { id: data.taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Authorization check
    await this.support.taskAccess.assert(task, data);

    const include = { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } as const;
    const { row: comment, created } = await createOnce({
      id: data.id,
      find: (id) => this.prisma.comment.findUnique({ where: { id }, include }),
      isSame: (c) => c.taskId === data.taskId && c.userId === data.userId,
      create: () =>
        this.prisma.comment.create({
          data: {
            ...(data.id ? { id: data.id } : {}),
            content: data.content,
            taskId: data.taskId,
            userId: data.userId,
          },
          include,
        }),
    });
    // A resend of a comment already saved: same answer, no second event or notification.
    if (!created) return success(comment);

    // Create task event with comment preview
    await this.support.createTaskEvent(data.taskId, data.userId, TaskEventType.COMMENT_ADDED, {
      commentId: comment.id,
      content: data.content.length > 100 ? data.content.slice(0, 100) + '...' : data.content,
    });

    /*
      Notify. The handler listens for `comment_added` and reads the task's creator
      and assignee to push them; this used to be emitted as `task_comment_added`,
      which nothing handled — so a comment never pushed and never reached open
      screens live.
    */
    emitEvent(this.notificationClient, commentAddedEvent, {
      taskId: data.taskId,
      task: {
        id: task.id,
        title: task.title,
        organizationId: task.organizationId,
        createdById: task.createdById,
        assignedToId: task.assignedToId,
      },
      comment,
    });

    return success(comment);
  }

  /**
   * Get comments for a task
   */
  async getComments(data: {
    taskId: string;
    userId: string;
    userRole: string;
    canViewAllTasks?: boolean;
    organizationId: string;
  }) {
    // First verify the task exists and user has access
    const task = await this.prisma.task.findUnique({
      where: { id: data.taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Authorization check. NOT open to a holder of the open role who has not
    // taken the job: the conversation on a job is the crew's, not the pool's.
    await this.support.taskAccess.assert(task, data);

    const comments = await this.prisma.comment.findMany({
      where: { taskId: data.taskId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    return success(comments);
  }
}
