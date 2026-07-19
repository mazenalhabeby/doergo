import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EmailService } from '../modules/email/email.service';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';

@Controller()
export class TaskNotificationHandler {
  private readonly logger = new Logger('TaskNotificationHandler');

  constructor(
    private readonly emailService: EmailService,
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  /**
   * Deliver a task event to the assignee's configured "Notifications about"
   * watchers — a targeted bell (so non-taskviewer watchers still get it) + push.
   * Excludes the assignee (already notified) and never throws.
   */
  private async notifyTaskWatchers(
    watcherIds: string[] | undefined,
    event: string,
    payload: any,
    push: { title: string; body: string; data?: any },
    exclude?: string,
  ) {
    const ids = (watcherIds || []).filter((id) => id && id !== exclude);
    for (const id of ids) {
      this.websocketGateway.emitToUser(id, event, payload);
      try {
        await this.pushService.sendToUser(id, push.title, push.body, push.data);
      } catch (error) {
        this.logger.error(`Failed to send task watcher push to ${id}: ${error}`);
      }
    }
  }

  @EventPattern('task_created')
  async handleTaskCreated(@Payload() data: any) {
    this.logger.log(`Task created: ${data.id}`);
    this.websocketGateway.emitTaskCreated(data);
  }

  @EventPattern('task_assigned')
  async handleTaskAssigned(@Payload() data: any) {
    this.logger.log(`Task assigned: ${data.task.id}`);
    this.websocketGateway.emitTaskAssigned(data.task, data.workerId);

    try {
      await this.pushService.sendTaskAssignedPush(data.workerId, {
        id: data.task.id,
        title: data.task.title,
      });
    } catch (error) {
      this.logger.error(`Failed to send task assigned push: ${error}`);
    }

    // Email notification to assigned worker
    if (data.workerEmail) {
      try {
        await this.emailService.sendTaskAssignedEmail(data.task, data.workerEmail);
      } catch (error) {
        this.logger.error(`Failed to send task assigned email: ${error}`);
      }
    }

    // Alert the assignee's "Notifications about" watchers (their managers).
    await this.notifyTaskWatchers(
      data.watcherIds,
      'task.assigned',
      data.task,
      { title: 'Task assigned', body: `"${data.task.title}" was assigned`, data: { taskId: data.task.id } },
      data.workerId,
    );
  }

  @EventPattern('task_status_changed')
  async handleTaskStatusChanged(@Payload() data: any) {
    this.logger.log(`Task status changed: ${data.task.id} ${data.oldStatus} -> ${data.newStatus}`);
    this.websocketGateway.emitTaskStatusChanged(data.task, data.oldStatus, data.newStatus);

    if (data.task.createdById) {
      try {
        await this.pushService.sendStatusChangePush(
          data.task.createdById,
          { id: data.task.id, title: data.task.title },
          data.newStatus,
        );
      } catch (error) {
        this.logger.error(`Failed to send status change push: ${error}`);
      }
    }

    // Email notification for task completion
    if (data.newStatus === 'COMPLETED' && data.creatorEmail) {
      try {
        await this.emailService.sendTaskCompletedEmail(data.task, data.creatorEmail);
      } catch (error) {
        this.logger.error(`Failed to send task completed email: ${error}`);
      }
    }

    // Alert the assignee's "Notifications about" watchers (their managers).
    await this.notifyTaskWatchers(
      data.watcherIds,
      'task.statusChanged',
      { task: data.task, oldStatus: data.oldStatus, newStatus: data.newStatus },
      { title: 'Task status changed', body: `"${data.task.title}" → ${data.newStatus}`, data: { taskId: data.task.id } },
      data.task.assignedToId,
    );
  }

  @EventPattern('task_declined')
  async handleTaskDeclined(@Payload() data: any) {
    this.logger.log(`Task declined: ${data.task.id}`);
    this.websocketGateway.emitTaskDeclined(data.task, data.declinedBy);
  }

  @EventPattern('task_deleted')
  async handleTaskDeleted(@Payload() data: { taskId: string; organizationId: string }) {
    this.logger.log(`Task deleted: ${data.taskId}`);
    this.websocketGateway.emitTaskDeleted(data.taskId, data.organizationId);
  }

  @EventPattern('comment_added')
  async handleCommentAdded(@Payload() data: any) {
    this.logger.log(`Comment added to task: ${data.taskId}`);
    this.websocketGateway.emitCommentAdded(data.taskId, data.comment);

    const commenterName = data.comment?.user?.firstName
      ? `${data.comment.user.firstName} ${data.comment.user.lastName || ''}`.trim()
      : 'Someone';
    const commenterId = data.comment?.userId;

    if (data.task?.createdById && data.task.createdById !== commenterId) {
      try {
        await this.pushService.sendTaskCommentPush(
          data.task.createdById,
          { id: data.taskId, title: data.task.title },
          commenterName,
        );
      } catch (error) {
        this.logger.error(`Failed to send comment push to creator: ${error}`);
      }
    }

    if (data.task?.assignedToId && data.task.assignedToId !== commenterId) {
      try {
        await this.pushService.sendTaskCommentPush(
          data.task.assignedToId,
          { id: data.taskId, title: data.task.title },
          commenterName,
        );
      } catch (error) {
        this.logger.error(`Failed to send comment push to assignee: ${error}`);
      }
    }
  }

  @EventPattern('attachment_added')
  async handleAttachmentAdded(@Payload() data: any) {
    this.logger.log(`Attachment added to task: ${data.taskId}`);
    this.websocketGateway.emitAttachmentAdded(data.taskId, data.attachment);
  }

  @EventPattern('blocked_tasks_reminder')
  async handleBlockedTasksReminder(@Payload() data: {
    userId: string;
    blockedTasks: { id: string; title: string }[];
    newTaskId: string;
    newTaskTitle: string;
  }) {
    const count = data.blockedTasks.length;
    const taskNames = data.blockedTasks.map(t => t.title).join(', ');

    try {
      await this.pushService.sendToUser(
        data.userId,
        `${count} Blocked Task${count > 1 ? 's' : ''} Need Attention`,
        `You have ${count} blocked task${count > 1 ? 's' : ''}: ${taskNames}`,
        { type: 'blocked_tasks_reminder', taskId: data.blockedTasks[0]?.id },
      );
    } catch (error) {
      this.logger.error(`Failed to send blocked tasks reminder push: ${error}`);
    }
  }

  @EventPattern('worker_location_updated')
  async handleWorkerLocationUpdated(@Payload() data: any) {
    this.websocketGateway.emitWorkerLocationUpdated(data.workerId, data.location);
  }
}
