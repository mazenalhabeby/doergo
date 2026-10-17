import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { MemberEmailsService } from '../modules/email/member-emails.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { NotificationStore } from '../common/notification-store.service';
import { shiftEscalationText } from '../modules/push/push.service';
import { msg, type LocalizedText } from '../i18n/translate';
import { weekdayIn, noShowResolvedTime } from './attendance-notification-helpers';
import { AttendancePushService } from './../modules/push/attendance-push.service';

export { noShowResolvedTime } from './attendance-notification-helpers';

@Controller()
export class AttendanceNotificationHandler {
  private readonly logger = new Logger('AttendanceNotificationHandler');

  constructor(
    private readonly memberEmails: MemberEmailsService,
    private readonly attendancePush: AttendancePushService,
    private readonly websocketGateway: WebsocketGateway,
    private readonly store: NotificationStore,
  ) {}

  /*
    There is no `attendance_auto_clock_out` handler any more, on purpose.

    One stood here — an email, a push and a socket event for a shift "clocked
    out automatically" after 16 hours or at the end of the day. Nothing has
    emitted that event since forced clock-outs were retired: the product never
    ends a shift for anybody. What does exist is the open-shift sweep, which
    closes a shift LEFT open with a temporary time and asks the member for the
    real one — `attendance_shift_closed_provisionally`, below, and that is where
    the email now goes. A handler for an event nobody sends reads like a
    delivery guarantee and is not one.
  */

  // Shift reminder engine: a worker's shift ended but they're still clocked in.
  // Push the worker + live-update their org dashboard. Never force-closes.
  @EventPattern('attendance_shift_reminder')
  async handleShiftReminder(@Payload() data: {
    entryId: string;
    userId: string;
    userName: string;
    locationId: string;
    locationName: string;
    expectedClockOutAt: string | null;
    reminderCount: number;
    unscheduled?: boolean;
    hoursOpen?: number;
    organizationId: string;
  }) {
    this.logger.log(`Shift reminder: user=${data.userName}, entry=${data.entryId}, count=${data.reminderCount}`);

    try {
      await this.attendancePush.sendShiftReminderPush({
        userId: data.userId,
        entryId: data.entryId,
        locationName: data.locationName,
        reminderCount: data.reminderCount,
        unscheduled: data.unscheduled,
        hoursOpen: data.hoursOpen,
      });
    } catch (error) {
      this.logger.error(`Failed to send shift-reminder push: ${error}`);
    }

    this.websocketGateway.emitToOrganization(data.organizationId, 'attendance_shift_reminder', {
      entryId: data.entryId,
      userId: data.userId,
      userName: data.userName,
      locationName: data.locationName,
      reminderCount: data.reminderCount,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Somebody clocked out well before their shift ended.
   *
   * The entry was already flagged for this and already landed in an approval
   * queue — which nobody watches in the moment. A site being a person short is
   * operational news, and finding out at the end of the month is finding out
   * too late.
   */
  @EventPattern('attendance_left_early')
  async handleLeftEarly(@Payload() data: {
    entryId: string;
    userId: string;
    userName: string;
    locationId: string;
    locationName: string;
    shortfallMinutes: number;
    reason?: string | null;
    leaderIds: string[];
    organizationId: string;
  }) {
    this.logger.log(
      `Left early: ${data.userName} at ${data.locationName}, short by ${data.shortfallMinutes}m`,
    );
    try {
      await this.attendancePush.sendLeftEarlyPush({
        leaderIds: data.leaderIds ?? [],
        userName: data.userName,
        locationName: data.locationName,
        shortfallMinutes: data.shortfallMinutes,
        reason: data.reason ?? null,
        entryId: data.entryId,
      });
    } catch (error) {
      this.logger.error(`Failed to send left-early push: ${error}`);
    }

    this.websocketGateway.emitToOrganization(data.organizationId, 'attendance_left_early', {
      entryId: data.entryId,
      userId: data.userId,
      userName: data.userName,
      locationName: data.locationName,
      shortfallMinutes: data.shortfallMinutes,
      reason: data.reason ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  @EventPattern('attendance_shift_escalation')
  async handleShiftEscalation(@Payload() data: {
    entryId: string;
    userId: string;
    userName: string;
    locationId: string;
    locationName: string;
    expectedClockOutAt: string | null;
    unscheduled?: boolean;
    hoursOpen?: number;
    leaderIds: string[];
    organizationId: string;
  }) {
    const leaderIds = data.leaderIds || [];
    this.logger.log(`Shift escalation: user=${data.userName}, entry=${data.entryId}, leaders=${leaderIds.length}`);

    try {
      await this.attendancePush.sendShiftEscalationPush({
        leaderIds,
        userName: data.userName,
        locationName: data.locationName,
        entryId: data.entryId,
        unscheduled: data.unscheduled,
        hoursOpen: data.hoursOpen,
      });
    } catch (error) {
      this.logger.error(`Failed to send shift-escalation push: ${error}`);
    }

    const payload = {
      entryId: data.entryId,
      userId: data.userId,
      userName: data.userName,
      locationName: data.locationName,
      timestamp: new Date().toISOString(),
    };
    if (leaderIds.length) {
      for (const id of leaderIds) {
        this.websocketGateway.emitToUser(id, 'attendance_shift_escalation', payload);
      }
    } else {
      this.websocketGateway.emitToRole(data.organizationId, 'ADMIN', 'attendance_shift_escalation', payload);
    }

    // Persist to the in-app inbox for the resolved leaders.
    await this.store.record({
      recipientIds: leaderIds,
      organizationId: data.organizationId,
      eventType: 'attendance_shift_escalation',
      text: shiftEscalationText(data),
      link: '/attendance',
    });
  }

  /*
    A shift left open, closed with a temporary time. The MEMBER is asked when
    they actually left — their answer, or the real clock-out their phone may
    still be holding, replaces it. Not pushed to supervisors: the entry is
    already waiting in approvals, and a push per forgotten clock-out is noise.
    This is the only automatic close the product has.
  */
  @EventPattern('attendance_shift_closed_provisionally')
  async handleShiftClosedProvisionally(@Payload() data: {
    entryId: string;
    userId: string;
    clockInAt: string;
    clockOutAt: string;
    basis: string;
    timezone?: string | null;
    locationName?: string | null;
    organizationId: string;
  }) {
    const text: LocalizedText = {
      title: msg('attendance.provisional.title'),
      body: msg('attendance.provisional.body', {
        day: weekdayIn(data.clockInAt, data.timezone),
        time: noShowResolvedTime(data.clockOutAt, data.timezone),
      }),
    };
    try {
      await this.attendancePush.sendAttendanceResolvedPush({
        recipientIds: [data.userId],
        text,
        type: 'attendance.clock_out_unconfirmed',
        entryId: data.entryId,
      });
    } catch (error) {
      this.logger.error(`Failed to send provisional clock-out push: ${error}`);
    }
    // …and by email, with the temporary time and a link to answer. A phone
    // switched off for the weekend never saw the push, and the answer is what
    // the member's hours are counted from. Preferences decide whether it goes.
    // After the push: an SMTP round trip must not delay the phone.
    try {
      await this.memberEmails.shiftClosed(data);
    } catch (error) {
      this.logger.error(`Failed to send provisional clock-out email: ${error}`);
    }
    this.websocketGateway.emitToUser(data.userId, 'attendance_shift_closed_provisionally', { entryId: data.entryId, clockOutAt: data.clockOutAt });
    // Boards refresh: the same org-wide signal a clock-out sends.
    this.websocketGateway.emitToOrganization(data.organizationId, 'attendance.changed', { userId: data.userId, entryId: data.entryId, reason: 'provisional_clock_out' });
    await this.store.record({
      recipientIds: [data.userId],
      organizationId: data.organizationId,
      eventType: 'attendance_shift_closed_provisionally',
      text,
      link: '/attendance',
    });
  }

  /*
    "Still clocked in past the end of the shift" answered by the clock-out
    itself, arriving late from a phone without signal. Same people as the
    escalation, so nobody phones round about a shift that ended hours ago.
  */
  @EventPattern('attendance_shift_escalation_resolved')
  async handleShiftEscalationResolved(@Payload() data: {
    entryId: string;
    userId: string;
    userName: string;
    clockOutAt: string;
    timezone?: string | null;
    recordedOffline: boolean;
    leaderIds: string[];
    organizationId: string;
  }) {
    const leaderIds = data.leaderIds || [];
    const facts = { name: data.userName, time: noShowResolvedTime(data.clockOutAt, data.timezone) };
    const text: LocalizedText = {
      title: msg('attendance.clockedOutAfterAll.title'),
      body: msg(data.recordedOffline ? 'attendance.clockedOutAfterAll.bodyOffline' : 'attendance.clockedOutAfterAll.body', facts),
    };
    try {
      await this.attendancePush.sendAttendanceResolvedPush({
        recipientIds: leaderIds,
        text,
        type: 'shift_escalation_resolved',
        entryId: data.entryId,
      });
    } catch (error) {
      this.logger.error(`Failed to send shift-escalation resolved push: ${error}`);
    }
    const payload = { entryId: data.entryId, userId: data.userId, userName: data.userName, clockOutAt: data.clockOutAt, timestamp: new Date().toISOString() };
    if (leaderIds.length) {
      for (const id of leaderIds) this.websocketGateway.emitToUser(id, 'attendance_shift_escalation_resolved', payload);
    } else {
      this.websocketGateway.emitToRole(data.organizationId, 'ADMIN', 'attendance_shift_escalation_resolved', payload);
    }
    await this.store.record({
      recipientIds: leaderIds,
      organizationId: data.organizationId,
      eventType: 'attendance_shift_escalation_resolved',
      text,
      link: '/attendance',
    });
  }
}
