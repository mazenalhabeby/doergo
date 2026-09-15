import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { MemberEmailsService } from '../modules/email/member-emails.service';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { NotificationStore } from '../common/notification-store.service';
import { taskStatus } from '../modules/push/push.service';
import { msg, plural, type LocalizedText } from '../i18n/translate';

@Controller()
export class TaskNotificationHandler {
  private readonly logger = new Logger('TaskNotificationHandler');

  constructor(
    private readonly memberEmails: MemberEmailsService,
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
    private readonly store: NotificationStore,
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
    push: { text: LocalizedText; data?: any },
    exclude?: string,
  ) {
    const ids = [...new Set((watcherIds || []).filter((id) => id && id !== exclude))];
    for (const id of ids) this.websocketGateway.emitToUser(id, event, payload);
    try {
      await this.pushService.sendToUsers(ids, push.text, push.data);
    } catch (error) {
      this.logger.error(`Failed to send task watcher push: ${error}`);
    }
  }

  @EventPattern('task_created')
  async handleTaskCreated(@Payload() data: any) {
    this.logger.log(`Task created: ${data.id}`);
    this.websocketGateway.emitTaskCreated(data);
  }

  /**
   * The sweep decided somebody should be setting off.
   *
   * The decision — who, and whether it is time — is made in task-service where
   * the positions and due dates are. This only delivers it, so the rule lives
   * in one place and cannot drift.
   */
  @EventPattern('task_departure_due')
  async handleDepartureDue(@Payload() data: any) {
    this.logger.log(`Departure due: task ${data.taskId} for ${data.userId}`);
    try {
      const due = new Date(data.dueDate);
      await this.pushService.sendDepartureDuePush(
        data.userId,
        { id: data.taskId, title: data.title },
        {
          dueTime: due.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
          travelMinutes: data.travelMinutes,
          estimated: !!data.estimated,
        },
      );
    } catch (error) {
      this.logger.error(`Failed to send departure push: ${error}`);
    }
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

    // Alert the assignee's "Notifications about" watchers (their managers).
    const assignedText: LocalizedText = {
      title: msg('task.watch.assigned.title'),
      body: msg('task.watch.assigned.body', { task: data.task.title }),
    };
    await this.notifyTaskWatchers(
      data.watcherIds,
      'task.assigned',
      data.task,
      { text: assignedText, data: { taskId: data.task.id } },
      data.workerId,
    );

    // Persist to the in-app inbox for the assignee + their watchers.
    await this.store.record({
      recipientIds: [data.workerId, ...(data.watcherIds || [])],
      organizationId: data.task.organizationId,
      eventType: 'task.assigned',
      text: assignedText,
      link: `/tasks/${data.task.id}`,
      data: { taskId: data.task.id },
    });

    // Email to the person given the work, last: an SMTP round trip must not
    // delay the push or the bell. Address, preferences, the actor and the burst
    // are all MemberEmailsService's, decided from the ids alone.
    try {
      await this.memberEmails.taskAssigned({ task: data.task, recipientId: data.workerId, actorId: data.actorId });
    } catch (error) {
      this.logger.error(`Failed to send task assigned email: ${error}`);
    }
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

    // Alert the assignee's "Notifications about" watchers (their managers).
    const statusText: LocalizedText = {
      title: msg('task.watch.status.title'),
      body: msg('task.watch.status.body', { task: data.task.title, status: taskStatus(data.newStatus) }),
    };
    await this.notifyTaskWatchers(
      data.watcherIds,
      'task.statusChanged',
      { task: data.task, oldStatus: data.oldStatus, newStatus: data.newStatus },
      { text: statusText, data: { taskId: data.task.id } },
      data.task.assignedToId,
    );

    // Persist to the in-app inbox for the creator + watchers.
    await this.store.record({
      recipientIds: [data.task.createdById, ...(data.watcherIds || [])],
      organizationId: data.task.organizationId,
      eventType: 'task.statusChanged',
      text: statusText,
      link: `/tasks/${data.task.id}`,
      data: { taskId: data.task.id },
    });

    // Email to the creator when the work is done — never to a creator who
    // completed it themselves (see MemberEmailsService). Last, as above.
    if (data.newStatus === 'COMPLETED' && data.task.createdById) {
      try {
        await this.memberEmails.taskCompleted({
          task: data.task,
          recipientId: data.task.createdById,
          actorId: data.actorId,
        });
      } catch (error) {
        this.logger.error(`Failed to send task completed email: ${error}`);
      }
    }
  }

  @EventPattern('task_declined')
  async handleTaskDeclined(@Payload() data: any) {
    this.logger.log(`Task declined: ${data.task.id}`);
    this.websocketGateway.emitTaskDeclined(data.task, data.declinedBy);
  }

  @EventPattern('task_deleted')
  async handleTaskDeleted(@Payload() data: { taskId: string; organizationId: string; spaceId?: string | null }) {
    this.logger.log(`Task deleted: ${data.taskId}`);
    this.websocketGateway.emitTaskDeleted(data.taskId, data.organizationId, data.spaceId ?? undefined);
  }

  @EventPattern('comment_added')
  async handleCommentAdded(@Payload() data: any) {
    this.logger.log(`Comment added to task: ${data.taskId}`);
    this.websocketGateway.emitCommentAdded(data.taskId, data.comment);

    const commenterName = data.comment?.user?.firstName
      ? `${data.comment.user.firstName} ${data.comment.user.lastName || ''}`.trim()
      : msg('common.someone');
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
        {
          title: plural('task.blocked.title', count),
          body: plural('task.blocked.body', count, { tasks: taskNames }),
        },
        { type: 'blocked_tasks_reminder', taskId: data.blockedTasks[0]?.id },
      );
    } catch (error) {
      this.logger.error(`Failed to send blocked tasks reminder push: ${error}`);
    }
  }

  @EventPattern('worker_location_updated')
  async handleWorkerLocationUpdated(@Payload() data: any) {
    this.websocketGateway.emitWorkerLocationUpdated(data.organizationId, data.workerId, data.location);
  }
}
