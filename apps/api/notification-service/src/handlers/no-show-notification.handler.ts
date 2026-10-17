import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { NotificationStore } from '../common/notification-store.service';
import { noShowEscalationText } from '../modules/push/push.service';
import { msg, type LocalizedText } from '../i18n/translate';
import { noShowResolvedTime } from './attendance-notification-helpers';
import { AttendancePushService } from './../modules/push/attendance-push.service';

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
  @EventPattern('attendance_noshow_reminder')
  async handleNoShowReminder(@Payload() data: {
    instanceId: string;
    userId: string;
    userName: string;
    spaceId: string;
    expectedClockInAt: string | null;
    reminderCount: number;
    organizationId: string;
  }) {
    this.logger.log(`No-show reminder: user=${data.userName}, instance=${data.instanceId}, count=${data.reminderCount}`);
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
  @EventPattern('attendance_noshow_escalation')
  async handleNoShowEscalation(@Payload() data: {
    instanceId: string;
    userId: string;
    userName: string;
    spaceId: string;
    expectedClockInAt: string | null;
    leaderIds: string[];
    organizationId: string;
  }) {
    const leaderIds = data.leaderIds || [];
    this.logger.log(`No-show escalation: user=${data.userName}, instance=${data.instanceId}, leaders=${leaderIds.length}`);
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
  @EventPattern('attendance_noshow_resolved')
  async handleNoShowResolved(@Payload() data: {
    instanceId: string;
    userId: string;
    userName: string;
    spaceId: string;
    clockInAt: string;
    timezone?: string | null;
    recordedOffline: boolean;
    leaderIds: string[];
    organizationId: string;
  }) {
    const leaderIds = data.leaderIds || [];
    const facts = { name: data.userName, time: noShowResolvedTime(data.clockInAt, data.timezone) };
    const text: LocalizedText = {
      title: msg('attendance.arrivedAfterAll.title'),
      body: msg(data.recordedOffline ? 'attendance.arrivedAfterAll.bodyOffline' : 'attendance.arrivedAfterAll.body', facts),
    };
    this.logger.log(`No-show resolved: user=${data.userName}, instance=${data.instanceId}, offline=${data.recordedOffline}, leaders=${leaderIds.length}`);
    try {
      await this.attendancePush.sendNoShowResolvedPush({ leaderIds, text, instanceId: data.instanceId });
    } catch (error) {
      this.logger.error(`Failed to send no-show resolved push: ${error}`);
    }
    const payload = { instanceId: data.instanceId, userId: data.userId, userName: data.userName, clockInAt: data.clockInAt, timestamp: new Date().toISOString() };
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
