import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TaskEventType } from '@doergo/shared';

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

    // Notify
    this.notificationClient.emit('comment_added', { taskId, comment });

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
