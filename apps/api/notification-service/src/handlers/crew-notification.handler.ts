import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { msg } from '../i18n/translate';

/**
 * A crew on one job: hand-over notes, started for you, the crew started, the lead
 * changed or needed, own issues, paused jobs.
 */
@Controller()
export class CrewNotificationHandler {
  private readonly logger = new Logger('CrewNotificationHandler');

  constructor(
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  /**
   * A worker wrote what they did on a job and what is left — the people who have
   * the job now hear it, including a note written after it was given to them.
   */
  @EventPattern('task_handover_added')
  async handleHandoverAdded(
    @Payload()
    data: {
      taskId: string;
      taskTitle: string;
      authorName: string;
      recipientIds: string[];
      organizationId: string;
    },
  ) {
    this.websocketGateway.emitToOrganization(data.organizationId, 'task.handoverAdded', { taskId: data.taskId });
    if (!data.recipientIds?.length) return;
    try {
      await this.pushService.sendToUsers(
        data.recipientIds,
        {
          title: msg('task.handover.title', { name: data.authorName }),
          body: msg('task.handover.body', { name: data.authorName, task: data.taskTitle }),
        },
        { type: 'task_handover', taskId: data.taskId },
      );
    } catch (error) {
      this.logger.error(`Failed to send handover push: ${error}`);
    }
  }

  /** The office started somebody's job for them — they hear who, and why. */
  @EventPattern('task_started_for_you')
  async handleStartedForYou(
    @Payload()
    data: {
      taskId: string;
      taskTitle: string;
      userId: string;
      byName: string;
      reason: string;
      organizationId: string;
    },
  ) {
    try {
      await this.pushService.sendToUser(
        data.userId,
        {
          title: msg('task.startedForYou.title', { name: data.byName }),
          body: msg('task.startedForYou.body', { task: data.taskTitle, reason: data.reason }),
        },
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
  async handleCrewStarted(
    @Payload() d: { taskId: string; taskTitle: string; starterName: string; startedAt: string; memberIds: string[] },
  ) {
    if (!d.memberIds?.length) return;
    try {
      await this.pushService.sendToUsers(
        d.memberIds,
        {
          title: msg('task.crewStarted.title', { name: d.starterName, task: d.taskTitle }),
          body: msg('task.crewStarted.body', { name: d.starterName }),
        },
        { type: 'task_crew_started', taskId: d.taskId, startedAt: d.startedAt, category: 'crew_join' },
      );
    } catch (error) {
      this.logger.error(`Failed to send crew-started push: ${error}`);
    }
  }

  /** The lead of one job was handed to somebody — they are told, and for how long. */
  @EventPattern('task_lead_changed')
  async handleLeadChanged(
    @Payload() d: { taskId: string; taskTitle: string; toUserId: string; byName: string; scope: 'TODAY' | 'PERMANENT' },
  ) {
    try {
      await this.pushService.sendToUser(
        d.toUserId,
        {
          title: msg('task.leadChanged.title', { task: d.taskTitle }),
          body: msg(d.scope === 'TODAY' ? 'task.leadChanged.bodyToday' : 'task.leadChanged.bodyPermanent', {
            name: d.byName,
          }),
        },
        { type: 'task_lead_changed', taskId: d.taskId },
      );
    } catch (error) {
      this.logger.error(`Failed to send lead-changed push: ${error}`);
    }
  }

  /** The morning notice: a job's leader has approved time off today. */
  @EventPattern('task_lead_needed')
  async handleLeadNeeded(
    @Payload()
    d: {
      taskId: string;
      taskTitle: string;
      recipientIds: string[];
      leaderName: string;
      actingName?: string | null;
    },
  ) {
    if (!d.recipientIds?.length) return;
    try {
      await this.pushService.sendToUsers(
        d.recipientIds,
        {
          title: msg('task.leadNeeded.title', { name: d.leaderName }),
          body: d.actingName
            ? msg('task.leadNeeded.bodyActing', { task: d.taskTitle, acting: d.actingName })
            : msg('task.leadNeeded.bodyNone', { task: d.taskTitle }),
        },
        { type: 'task_lead_needed', taskId: d.taskId },
      );
    } catch (error) {
      this.logger.error(`Failed to send lead-needed push: ${error}`);
    }
  }

  /** A crew member stopped on their own ("My issue") — the leader is told why. */
  @EventPattern('task_crew_issue')
  async handleCrewIssue(
    @Payload() d: { taskId: string; taskTitle: string; leaderId: string; name: string; reason: string },
  ) {
    try {
      await this.pushService.sendToUser(
        d.leaderId,
        {
          title: msg('task.crewIssue.title', { name: d.name, task: d.taskTitle }),
          body: msg('task.crewIssue.body', { reason: d.reason }),
        },
        { type: 'task_crew_issue', taskId: d.taskId },
      );
    } catch (error) {
      this.logger.error(`Failed to send crew-issue push: ${error}`);
    }
  }

  /** Jobs paused at a clock-out — the office's boards refresh and show them paused. */
  @EventPattern('tasks_paused')
  async handleTasksPaused(@Payload() data: { taskIds: string[]; userId: string; organizationId: string }) {
    this.websocketGateway.emitToOrganization(data.organizationId, 'tasks.paused', {
      taskIds: data.taskIds,
      userId: data.userId,
    });
  }
}
