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

  /** Something on a job changed — every open screen on it re-reads (websocket.gateway announceTaskChanged). */
  @EventPattern('task_updated')
  handleTaskUpdated(@Payload() data: { task?: { id?: string } }) {
    const id = data?.task?.id;
    if (typeof id === 'string' && id) this.websocketGateway.announceTaskChanged(id);
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

    // Somebody who TOOK the job themselves (a role task, or assigning oneself)
    // is not buzzed about their own tap — the screen already says so.
    const selfAssigned = !!data.actorId && data.actorId === data.workerId;
    if (!selfAssigned) {
      try {
        await this.pushService.sendTaskAssignedPush(data.workerId, {
          id: data.task.id,
          title: data.task.title,
        });
      } catch (error) {
        this.logger.error(`Failed to send task assigned push: ${error}`);
      }
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

  /*
    A task OPEN TO A ROLE (packages/shared/src/tasks/role-pool.ts).

    Offered: a push to each person the wave reaches, in their own language, and
    a line in their inbox — the push is gone once swiped, the inbox is where
    "what was I offered?" is answered. Taken / unclaimed go to whoever opened it.
    Pushes are typed `task_role_*`, so a member who switched job pushes off is
    not buzzed (pushCategory → tasks).
  */
  @EventPattern('role_task_offered')
  async handleRoleTaskOffered(@Payload() data: { task: { id: string; title: string; organizationId: string }; roleName: string; userIds: string[]; wave: number }) {
    const ids = [...new Set(data.userIds ?? [])];
    if (ids.length === 0) return;
    this.logger.log(`Role task offered: ${data.task.id} wave ${data.wave} to ${ids.length}`);
    const text: LocalizedText = {
      title: msg('task.roleOffer.title', { role: data.roleName }),
      body: msg('task.roleOffer.body', { task: data.task.title }),
    };
    try {
      await this.pushService.sendToUsers(ids, text, { taskId: data.task.id, type: 'task_role_offer' });
    } catch (error) {
      this.logger.error(`Failed to send role offer push: ${error}`);
    }
    for (const id of ids) this.websocketGateway.emitToUser(id, 'role_task_open', { taskId: data.task.id });
    await this.store.record({
      recipientIds: ids,
      organizationId: data.task.organizationId,
      eventType: 'task.roleOffer',
      text,
      link: `/tasks/${data.task.id}`,
      data: { taskId: data.task.id },
    });
  }

  @EventPattern('role_task_taken')
  async handleRoleTaskTaken(@Payload() data: { task: { id: string; title: string; organizationId: string }; takerName: string; notifyIds: string[] }) {
    const ids = [...new Set(data.notifyIds ?? [])];
    if (ids.length === 0) return;
    const text: LocalizedText = {
      title: msg('task.roleTaken.title'),
      body: msg('task.roleTaken.body', { name: data.takerName, task: data.task.title }),
    };
    try {
      await this.pushService.sendToUsers(ids, text, { taskId: data.task.id, type: 'task_role_taken' });
    } catch (error) {
      this.logger.error(`Failed to send role taken push: ${error}`);
    }
    await this.store.record({
      recipientIds: ids,
      organizationId: data.task.organizationId,
      eventType: 'task.roleTaken',
      text,
      link: `/tasks/${data.task.id}`,
      data: { taskId: data.task.id },
    });
  }

  @EventPattern('role_task_unclaimed')
  async handleRoleTaskUnclaimed(@Payload() data: { task: { id: string; title: string; organizationId: string }; roleName: string; minutes: number; names: string[]; notifyIds: string[] }) {
    const ids = [...new Set(data.notifyIds ?? [])];
    if (ids.length === 0) return;
    const names = (data.names ?? []).slice(0, 3).join(', ');
    const params = { task: data.task.title, role: data.roleName, minutes: data.minutes, names };
    const text: LocalizedText = {
      title: msg('task.roleUnclaimed.title'),
      body: msg(names ? 'task.roleUnclaimed.body' : 'task.roleUnclaimed.bodyNone', params),
    };
    try {
      await this.pushService.sendToUsers(ids, text, { taskId: data.task.id, type: 'task_role_unclaimed' });
    } catch (error) {
      this.logger.error(`Failed to send role unclaimed push: ${error}`);
    }
    await this.store.record({
      recipientIds: ids,
      organizationId: data.task.organizationId,
      eventType: 'task.roleUnclaimed',
      text,
      link: `/tasks/${data.task.id}`,
      data: { taskId: data.task.id },
    });
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

  /**
   * A worker wrote what they did on a job and what is left — the people who have
   * the job now hear it, including a note written after it was given to them.
   */
  @EventPattern('task_handover_added')
  async handleHandoverAdded(@Payload() data: { taskId: string; taskTitle: string; authorName: string; recipientIds: string[]; organizationId: string }) {
    this.websocketGateway.emitToOrganization(data.organizationId, 'task.handoverAdded', { taskId: data.taskId });
    if (!data.recipientIds?.length) return;
    try {
      await this.pushService.sendToUsers(
        data.recipientIds,
        { title: msg('task.handover.title', { name: data.authorName }), body: msg('task.handover.body', { name: data.authorName, task: data.taskTitle }) },
        { type: 'task_handover', taskId: data.taskId },
      );
    } catch (error) {
      this.logger.error(`Failed to send handover push: ${error}`);
    }
  }

  /** The office started somebody's job for them — they hear who, and why. */
  @EventPattern('task_started_for_you')
  async handleStartedForYou(@Payload() data: { taskId: string; taskTitle: string; userId: string; byName: string; reason: string; organizationId: string }) {
    try {
      await this.pushService.sendToUser(
        data.userId,
        { title: msg('task.startedForYou.title', { name: data.byName }), body: msg('task.startedForYou.body', { task: data.taskTitle, reason: data.reason }) },
        { type: 'task_started_for_you', taskId: data.taskId },
      );
    } catch (error) {
      this.logger.error(`Failed to send started-for-you push: ${error}`);
    }
  }

  /**
   * A crew job started (or picked up again): the crew members on the clock who
   * have not joined are asked "are you with them?" — one tap joins them from
   * the start (shared crew.ts joinMoment). The category carries the button.
   */
  @EventPattern('task_crew_started')
  async handleCrewStarted(@Payload() d: { taskId: string; taskTitle: string; starterName: string; startedAt: string; memberIds: string[] }) {
    if (!d.memberIds?.length) return;
    try {
      await this.pushService.sendToUsers(
        d.memberIds,
        { title: msg('task.crewStarted.title', { name: d.starterName, task: d.taskTitle }), body: msg('task.crewStarted.body', { name: d.starterName }) },
        { type: 'task_crew_started', taskId: d.taskId, startedAt: d.startedAt, category: 'crew_join' },
      );
    } catch (error) {
      this.logger.error(`Failed to send crew-started push: ${error}`);
    }
  }

  /** The lead of one job was handed to somebody — they are told, and for how long. */
  @EventPattern('task_lead_changed')
  async handleLeadChanged(@Payload() d: { taskId: string; taskTitle: string; toUserId: string; byName: string; scope: 'TODAY' | 'PERMANENT' }) {
    try {
      await this.pushService.sendToUser(
        d.toUserId,
        { title: msg('task.leadChanged.title', { task: d.taskTitle }), body: msg(d.scope === 'TODAY' ? 'task.leadChanged.bodyToday' : 'task.leadChanged.bodyPermanent', { name: d.byName }) },
        { type: 'task_lead_changed', taskId: d.taskId },
      );
    } catch (error) {
      this.logger.error(`Failed to send lead-changed push: ${error}`);
    }
  }

  /** The morning notice: a job's leader has approved time off today. */
  @EventPattern('task_lead_needed')
  async handleLeadNeeded(@Payload() d: { taskId: string; taskTitle: string; recipientIds: string[]; leaderName: string; actingName?: string | null }) {
    if (!d.recipientIds?.length) return;
    try {
      await this.pushService.sendToUsers(
        d.recipientIds,
        {
          title: msg('task.leadNeeded.title', { name: d.leaderName }),
          body: d.actingName ? msg('task.leadNeeded.bodyActing', { task: d.taskTitle, acting: d.actingName }) : msg('task.leadNeeded.bodyNone', { task: d.taskTitle }),
        },
        { type: 'task_lead_needed', taskId: d.taskId },
      );
    } catch (error) {
      this.logger.error(`Failed to send lead-needed push: ${error}`);
    }
  }

  /** A crew member stopped on their own ("My issue") — the leader is told why. */
  @EventPattern('task_crew_issue')
  async handleCrewIssue(@Payload() d: { taskId: string; taskTitle: string; leaderId: string; name: string; reason: string }) {
    try {
      await this.pushService.sendToUser(
        d.leaderId,
        { title: msg('task.crewIssue.title', { name: d.name, task: d.taskTitle }), body: msg('task.crewIssue.body', { reason: d.reason }) },
        { type: 'task_crew_issue', taskId: d.taskId },
      );
    } catch (error) {
      this.logger.error(`Failed to send crew-issue push: ${error}`);
    }
  }

  /** Jobs paused at a clock-out — the office's boards refresh and show them paused. */
  @EventPattern('tasks_paused')
  async handleTasksPaused(@Payload() data: { taskIds: string[]; userId: string; organizationId: string }) {
    this.websocketGateway.emitToOrganization(data.organizationId, 'tasks.paused', { taskIds: data.taskIds, userId: data.userId });
  }

  @EventPattern('worker_location_updated')
  async handleWorkerLocationUpdated(@Payload() data: any) {
    this.websocketGateway.emitWorkerLocationUpdated(data.organizationId, data.workerId, data.location);
  }
}
