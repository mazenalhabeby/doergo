import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  eventPattern,
  type EventPayload,
  attendanceNoshowEscalationEvent,
  attendanceNoshowReminderEvent,
  attendanceNoshowResolvedEvent,
} from '@hbcfield/shared/microservices';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { NotificationStore } from '../../inbox/notification-store.service';
import { noShowEscalationText } from '../../push/push.service';
import { msg, type LocalizedText } from '../../../i18n/translate';
import { noShowResolvedTime } from './attendance-notification-helpers';
import { AttendancePushService } from '../../push/attendance-push.service';

/** No-shows: the reminder, the escalation, and the close. */
@Controller()
export class NoShowNotificationHandler {
  private readonly logger = new Logger('NoShowNotificationHandler');

  constructor(
    private readonly attendancePush: AttendancePushService,
    private readonly websocketGateway: WebsocketGateway,
    private readonly store: NotificationStore,
  ) {}

  // No-show engine: a worker's shift started but they never clocked in. Nudge the
  // worker (push) + live-update the org dashboard.
  @EventPattern(eventPattern(attendanceNoshowReminderEvent))
  async handleNoShowReminder(
    @Payload()
    data: EventPayload<typeof attendanceNoshowReminderEvent>,
  ) {
    this.logger.log(
      `No-show reminder: user=${data.userName}, instance=${data.instanceId}, count=${data.reminderCount}`,
    );
    try {
      await this.attendancePush.sendNoShowReminderPush({
        userId: data.userId,
        instanceId: data.instanceId,
        reminderCount: data.reminderCount,
      });
    } catch (error) {
      this.logger.error(`Failed to send no-show reminder push: ${error}`);
    }
    this.websocketGateway.emitToOrganization(data.organizationId, 'attendance_noshow_reminder', {
      instanceId: data.instanceId,
      userId: data.userId,
      userName: data.userName,
      reminderCount: data.reminderCount,
      timestamp: new Date().toISOString(),
    });
  }

  // Reminders exhausted → notify the space leaders that the worker is a no-show.
  @EventPattern(eventPattern(attendanceNoshowEscalationEvent))
  async handleNoShowEscalation(
    @Payload()
    data: EventPayload<typeof attendanceNoshowEscalationEvent>,
  ) {
    const leaderIds = data.leaderIds || [];
    this.logger.log(
      `No-show escalation: user=${data.userName}, instance=${data.instanceId}, leaders=${leaderIds.length}`,
    );
    try {
      await this.attendancePush.sendNoShowEscalationPush({
        leaderIds,
        userName: data.userName,
        instanceId: data.instanceId,
      });
    } catch (error) {
      this.logger.error(`Failed to send no-show escalation push: ${error}`);
    }
    const payload = {
      instanceId: data.instanceId,
      userId: data.userId,
      userName: data.userName,
      timestamp: new Date().toISOString(),
    };
    if (leaderIds.length) {
      for (const id of leaderIds) this.websocketGateway.emitToUser(id, 'attendance_noshow_escalation', payload);
    } else {
      this.websocketGateway.emitToRole(data.organizationId, 'ADMIN', 'attendance_noshow_escalation', payload);
    }
    await this.store.record({
      recipientIds: leaderIds,
      organizationId: data.organizationId,
      eventType: 'attendance_noshow_escalation',
      text: noShowEscalationText(data.userName),
      link: '/attendance',
    });
  }

  /*
    A no-show that turned out not to be one: the clock-in arrived after the
    escalation, usually from a phone that had no signal at the site. Told to the
    same people the escalation alerted, so nobody keeps chasing somebody who was
    at work the whole time.
  */
  @EventPattern(eventPattern(attendanceNoshowResolvedEvent))
  async handleNoShowResolved(
    @Payload()
    data: EventPayload<typeof attendanceNoshowResolvedEvent>,
  ) {
    const leaderIds = data.leaderIds || [];
    const facts = { name: data.userName, time: noShowResolvedTime(data.clockInAt, data.timezone) };
    const text: LocalizedText = {
      title: msg('attendance.arrivedAfterAll.title'),
      body: msg(
        data.recordedOffline ? 'attendance.arrivedAfterAll.bodyOffline' : 'attendance.arrivedAfterAll.body',
        facts,
      ),
    };
    this.logger.log(
      `No-show resolved: user=${data.userName}, instance=${data.instanceId}, offline=${data.recordedOffline}, leaders=${leaderIds.length}`,
    );
    try {
      await this.attendancePush.sendNoShowResolvedPush({ leaderIds, text, instanceId: data.instanceId });
    } catch (error) {
      this.logger.error(`Failed to send no-show resolved push: ${error}`);
    }
    const payload = {
      instanceId: data.instanceId,
      userId: data.userId,
      userName: data.userName,
      clockInAt: data.clockInAt,
      timestamp: new Date().toISOString(),
    };
    if (leaderIds.length) {
      for (const id of leaderIds) this.websocketGateway.emitToUser(id, 'attendance_noshow_resolved', payload);
    } else {
      this.websocketGateway.emitToRole(data.organizationId, 'ADMIN', 'attendance_noshow_resolved', payload);
    }
    await this.store.record({
      recipientIds: leaderIds,
      organizationId: data.organizationId,
      eventType: 'attendance_noshow_resolved',
      text,
      link: '/attendance',
    });
  }
}
