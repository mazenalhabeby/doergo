import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TaskEventType } from '@hbcfield/shared';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
  ) {}

  async create(taskId: string, userId: string, content: string) {
    const comment = await this.prisma.comment.create({
      data: {
        taskId,
        userId,
        content,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Create task event
    await this.prisma.taskEvent.create({
      data: {
        taskId,
        userId,
        eventType: TaskEventType.COMMENT_ADDED,
        metadata: { commentId: comment.id },
      },
    });

    // Fetch task details for notification targeting
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true, createdById: true, assignedToId: true },
    });

    // Notify
    this.notificationClient.emit('comment_added', { taskId, comment, task });

    return { success: true, data: comment };
  }

  async findByTask(taskId: string) {
    const comments = await this.prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return { success: true, data: comments };
  }
}
