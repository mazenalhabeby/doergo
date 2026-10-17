import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  eventPattern,
  type EventPayload,
  attendanceBreakDueEvent,
  attendanceBreakOverEvent,
  autoClockOfferedEvent,
} from '@hbcfield/shared/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { NotificationStore } from '../common/notification-store.service';
import { msg, type LocalizedText } from '../i18n/translate';
import { AttendancePushService } from './../modules/push/attendance-push.service';

/** Rests and the automatic clock: "time for your rest", "your rest is over", the auto-clock offer. */
@Controller()
export class BreakNotificationHandler {
  private readonly logger = new Logger('BreakNotificationHandler');

  constructor(
    private readonly pushService: PushService,
    private readonly attendancePush: AttendancePushService,
    private readonly websocketGateway: WebsocketGateway,
    private readonly store: NotificationStore,
  ) {}

  // Reminders exhausted → notify the space leaders to reconcile the open shift.
  /**
   * A planned rest has fallen due.
   *
   * Time-sensitive by nature — a rest suggested an hour late is not a rest — so
   * it rides the attendance channel, which now carries the importance and the
   * iOS interruption level that let it appear over whatever the member is doing.
   */
  @EventPattern(eventPattern(attendanceBreakDueEvent))
  async handleBreakDue(@Payload() data: EventPayload<typeof attendanceBreakDueEvent>) {
    this.logger.log(`Rest due: user=${data.userId} rest=${data.name} asked=${data.snoozeCount}`);
    try {
      await this.attendancePush.sendBreakDuePush({
        userId: data.userId,
        entryId: data.entryId,
        ruleId: data.ruleId,
        name: data.name,
        durationMinutes: data.durationMinutes,
        isPaid: data.isPaid,
        expiresAt: data.expiresAt ?? null,
        snoozeCount: data.snoozeCount,
      });
    } catch (error) {
      this.logger.error(`Failed to send rest-due push: ${error}`);
    }

    // …and to the open app, which must not need a push to show the prompt: a
    // notification that was blocked, muted or missed cannot be the only channel.
    this.websocketGateway.emitToUser(data.userId, 'attendance_break_due', {
      entryId: data.entryId,
      ruleId: data.ruleId,
      name: data.name,
      durationMinutes: data.durationMinutes,
      isPaid: data.isPaid,
      expiresAt: data.expiresAt ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  /** The rest has run its length. One nudge, with a button to come back. */
  @EventPattern(eventPattern(attendanceBreakOverEvent))
  async handleBreakOver(@Payload() data: EventPayload<typeof attendanceBreakOverEvent>) {
    this.logger.log(`Rest over: user=${data.userId} rest=${data.name}`);
    try {
      await this.attendancePush.sendBreakOverPush({
        userId: data.userId,
        entryId: data.entryId,
        breakId: data.breakId,
        name: data.name,
        durationMinutes: data.durationMinutes,
      });
    } catch (error) {
      this.logger.error(`Failed to send rest-over push: ${error}`);
    }

    this.websocketGateway.emitToUser(data.userId, 'attendance_break_over', {
      entryId: data.entryId,
      breakId: data.breakId,
      name: data.name,
      timestamp: new Date().toISOString(),
    });
  }

  /*
    The office chose these members for the automatic clock in one workspace
    (or switched the workspace on with them already chosen), and they have not
    agreed yet. Their phone now shows the switch; this tells them it is there
    and that it is about THIS workspace only. Tapping opens the Time screen.
  */
  @EventPattern(eventPattern(autoClockOfferedEvent))
  async handleAutoClockOffered(@Payload() data: EventPayload<typeof autoClockOfferedEvent>) {
    if (!data.userIds?.length) return;
    const text: LocalizedText = {
      title: msg('attendance.autoClockOffered.title', { workspace: data.spaceName }),
      body: msg('attendance.autoClockOffered.body'),
    };
    try {
      await this.pushService.sendToUsers(data.userIds, text, {
        type: 'attendance.auto_clock_offered',
        spaceId: data.spaceId,
      });
    } catch (error) {
      this.logger.error(`Failed to send automatic clock offer push: ${error}`);
    }
    for (const userId of data.userIds)
      this.websocketGateway.emitToUser(userId, 'auto_clock_offered', { spaceId: data.spaceId });
    await this.store.record({
      recipientIds: data.userIds,
      organizationId: data.organizationId,
      eventType: 'auto_clock_offered',
      text,
      link: '/attendance',
    });
  }
}
