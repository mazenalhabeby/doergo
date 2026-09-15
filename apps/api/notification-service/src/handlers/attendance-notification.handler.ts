import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EmailService } from '../modules/email/email.service';
import { MemberEmailsService } from '../modules/email/member-emails.service';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { NotificationStore } from '../common/notification-store.service';
import {
  geofenceAlertText,
  noShowEscalationText,
  overtimeRequestText,
  pendingApprovalText,
  shiftEscalationText,
} from '../modules/push/push.service';
import { msg, type LocalizedText } from '../i18n/translate';
import type { SupportedLocale } from '@hbcfield/shared';

// Labels for attendance approval flags in the SOCKET payload's `flagSummary`,
// which the web renders as a hint. The push and the bell entry do not use these:
// they are written per recipient from the catalogue (`pendingApprovalText`).
const FLAG_LABELS: Record<string, string> = {
  OVERTIME: 'overtime',
  MISSED_CLOCK_OUT: 'missed clock-out',
  OUTSIDE_GEOFENCE_IN: 'out of geofence',
  OUTSIDE_GEOFENCE_OUT: 'out of geofence',
  LATE_ARRIVAL: 'late arrival',
  EARLY_DEPARTURE: 'early departure',
  UNSCHEDULED_DAY: 'unscheduled day',
};

// Payload for every geofence_excursion_* event emitted by task-service.
interface GeofenceExcursionEvent {
  excursionId: string;
  status: string;
  userId: string;
  userName: string;
  userEmail?: string;
  spaceId: string;
  spaceName: string;
  reason?: string | null;
  requestedMinutes?: number | null;
  grantedMinutes?: number | null;
  expiresAt?: string | null;
  distanceM?: number | null;
  watcherIds?: string[];
  watcherEmails?: string[];
  organizationId: string;
}

@Controller()
export class AttendanceNotificationHandler {
  private readonly logger = new Logger('AttendanceNotificationHandler');

  constructor(
    private readonly emailService: EmailService,
    private readonly memberEmails: MemberEmailsService,
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
    private readonly store: NotificationStore,
  ) {}

  // Availability status (Available/Busy/Away) changed — broadcast so teammates'
  // dashboards / contact lists update in real time.
  @EventPattern('presence_changed')
  handlePresenceChanged(@Payload() data: { userId: string; presence: string | null; organizationId: string }) {
    this.websocketGateway.emitPresenceChanged(data.userId, data.presence, data.organizationId);
  }

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
      await this.pushService.sendShiftReminderPush({
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

  // Reminders exhausted → notify the space leaders to reconcile the open shift.
  /**
   * A planned rest has fallen due.
   *
   * Time-sensitive by nature — a rest suggested an hour late is not a rest — so
   * it rides the attendance channel, which now carries the importance and the
   * iOS interruption level that let it appear over whatever the member is doing.
   */
  @EventPattern('attendance_break_due')
  async handleBreakDue(@Payload() data: {
    entryId: string;
    userId: string;
    ruleId: string;
    name: string;
    durationMinutes: number;
    isPaid: boolean;
    expiresAt?: string | null;
    snoozeCount: number;
    locationName: string;
    organizationId: string;
  }) {
    this.logger.log(`Rest due: user=${data.userId} rest=${data.name} asked=${data.snoozeCount}`);
    try {
      await this.pushService.sendBreakDuePush({
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
  @EventPattern('attendance_break_over')
  async handleBreakOver(@Payload() data: {
    entryId: string;
    userId: string;
    breakId: string;
    name: string;
    durationMinutes: number;
    organizationId: string;
  }) {
    this.logger.log(`Rest over: user=${data.userId} rest=${data.name}`);
    try {
      await this.pushService.sendBreakOverPush({
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
      await this.pushService.sendLeftEarlyPush({
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
      await this.pushService.sendShiftEscalationPush({
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
      await this.pushService.sendNoShowReminderPush({
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
      await this.pushService.sendNoShowEscalationPush({
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
      await this.pushService.sendAttendanceResolvedPush({ recipientIds: [data.userId], text, type: 'attendance.clock_out_unconfirmed', entryId: data.entryId });
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
      await this.pushService.sendAttendanceResolvedPush({ recipientIds: leaderIds, text, type: 'shift_escalation_resolved', entryId: data.entryId });
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
      await this.pushService.sendNoShowResolvedPush({ leaderIds, text, instanceId: data.instanceId });
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

  // Worker asked to keep working past their shift → notify overtime approvers.
  @EventPattern('attendance_overtime_request')
  async handleOvertimeRequest(@Payload() data: {
    entryId: string;
    userId: string;
    userName: string;
    locationId: string;
    locationName: string;
    leaderIds: string[];
    organizationId: string;
  }) {
    const leaderIds = data.leaderIds || [];
    this.logger.log(`Overtime request: user=${data.userName}, entry=${data.entryId}, leaders=${leaderIds.length}`);

    try {
      await this.pushService.sendOvertimeRequestPush({
        leaderIds,
        userName: data.userName,
        locationName: data.locationName,
        entryId: data.entryId,
      });
    } catch (error) {
      this.logger.error(`Failed to send overtime-request push: ${error}`);
    }

    const payload = {
      entryId: data.entryId,
      userId: data.userId,
      userName: data.userName,
      locationName: data.locationName,
      timestamp: new Date().toISOString(),
    };
    // NOT emitted over the socket, for the same reason as the decision above
    // (audit AT-D1): approving extra time is a mobile-only surface reached by the
    // push, and no web page subscribes to this event. `payload` is still built and
    // stored below, so the notification is recorded and the inbox shows it.
    void payload;

    await this.store.record({
      recipientIds: leaderIds,
      organizationId: data.organizationId,
      eventType: 'attendance_overtime_request',
      text: overtimeRequestText(data.userName, data.locationName),
      link: '/attendance',
    });
  }

  // Leader approved/rejected the extra time → tell the worker.
  @EventPattern('attendance_overtime_decision')
  async handleOvertimeDecision(@Payload() data: {
    entryId: string;
    userId: string;
    decision: 'approved' | 'rejected';
    minutes?: number;
    newExpectedClockOutAt?: string;
    organizationId: string;
  }) {
    this.logger.log(`Overtime decision: entry=${data.entryId}, decision=${data.decision}`);

    try {
      await this.pushService.sendOvertimeDecisionPush({
        userId: data.userId,
        entryId: data.entryId,
        decision: data.decision,
        minutes: data.minutes,
      });
    } catch (error) {
      this.logger.error(`Failed to send overtime-decision push: ${error}`);
    }

    // NOT emitted over the socket. The extra-time approval surface is mobile-only
    // and mobile is reached by the push above; no web page reads this event and no
    // query key exists for it, so a socket emit here would be dead code that reads
    // like a delivery guarantee (audit AT-D1). If a web surface is ever built, emit
    // here AND add the invalidation — one without the other is the silent failure
    // this audit kept finding.
  }

  @EventPattern('attendance_geofence_alert')
  async handleGeofenceAlert(@Payload() data: {
    userId: string;
    userName: string;
    userEmail: string;
    locationName: string;
    distance: number;
    allowedRadius: number;
    action: 'clock_in' | 'clock_out';
    dispatcherEmails: string[];
    dispatcherIds: string[];
    organizationId: string;
  }) {
    this.logger.log(`Geofence alert: user=${data.userName}, distance=${data.distance}m`);

    // `dispatcherIds` and `dispatcherEmails` are the same people in the same
    // order (NotificationRoutingService builds both from one list), so they zip.
    // The ids are what carry each reader's language — one query for all of them.
    try {
      await this.emailService.sendGeofenceAlertEmail({
        recipients: (data.dispatcherEmails || []).map((email, i) => ({ id: data.dispatcherIds?.[i], email })),
        userName: data.userName,
        locationName: data.locationName,
        distance: data.distance,
        allowedRadius: data.allowedRadius,
        action: data.action,
      });
    } catch (error) {
      this.logger.error(`Failed to send geofence alert emails: ${error}`);
    }

    try {
      await this.pushService.sendGeofenceAlertPush({
        dispatcherIds: data.dispatcherIds,
        userName: data.userName,
        locationName: data.locationName,
        distance: data.distance,
        action: data.action,
      });
    } catch (error) {
      this.logger.error(`Failed to send geofence alert push: ${error}`);
    }

    this.websocketGateway.emitToOrganization(data.organizationId, 'attendance_geofence_alert', {
      userId: data.userId,
      userName: data.userName,
      locationName: data.locationName,
      distance: data.distance,
      action: data.action,
      timestamp: new Date().toISOString(),
    });

    // Persist to the in-app inbox for the resolved dispatchers/managers.
    await this.store.record({
      recipientIds: data.dispatcherIds,
      organizationId: data.organizationId,
      eventType: 'attendance_geofence_alert',
      text: geofenceAlertText(data),
      link: '/attendance',
    });
  }

  @EventPattern('attendance_pending_approval')
  async handlePendingApproval(@Payload() data: {
    entryId: string;
    userId: string;
    userName: string;
    locationName: string;
    flagReasons: string[];
    totalMinutes: number;
    managerIds: string[];
    organizationId: string;
  }) {
    const flagSummary = (data.flagReasons || [])
      .map((r) => FLAG_LABELS[r] || r.replace(/_/g, ' ').toLowerCase())
      .join(', ') || 'needs review';

    this.logger.log(`Pending approval: user=${data.userName}, flags=[${flagSummary}]`);

    try {
      await this.pushService.sendPendingApprovalPush({
        managerIds: data.managerIds || [],
        userName: data.userName,
        flagReasons: data.flagReasons || [],
        entryId: data.entryId,
      });
    } catch (error) {
      this.logger.error(`Failed to send pending-approval push: ${error}`);
    }

    // Bell: managers/admins only (not the worker whose entry it is).
    const payload = {
      entryId: data.entryId,
      userId: data.userId,
      userName: data.userName,
      locationName: data.locationName,
      flagReasons: data.flagReasons,
      flagSummary,
      timestamp: new Date().toISOString(),
    };
    // Target the exact approvers task-service resolved (admins + members granted
    // "view all tasks"); fall back to the ADMIN room if none were provided.
    const approverIds = data.managerIds || [];
    if (approverIds.length) {
      for (const id of approverIds) {
        this.websocketGateway.emitToUser(id, 'attendance_pending_approval', payload);
      }
    } else {
      this.websocketGateway.emitToRole(data.organizationId, 'ADMIN', 'attendance_pending_approval', payload);
    }

    // Persist to the in-app inbox for the approvers.
    await this.store.record({
      recipientIds: approverIds,
      organizationId: data.organizationId,
      eventType: 'attendance_pending_approval',
      text: pendingApprovalText(data.userName, data.flagReasons || []),
      link: '/attendance?tab=approvals',
    });
  }

  // ── Geofence excursion ("out of ring") ────────────────────────────────────
  // The heartbeat opened an excursion because the worker left their space's ring.
  // Warn the employee (push + their own socket). Also live-update the org so the
  // approver surface reflects the new out-of-ring worker.
  @EventPattern('geofence_excursion_out')
  async handleExcursionOut(@Payload() data: GeofenceExcursionEvent) {
    this.logger.log(`Excursion out: user=${data.userName}, space=${data.spaceName}, ${data.distanceM ?? '?'}m`);
    try {
      await this.pushService.sendToUser(
        data.userId,
        { title: msg('attendance.excursionOut.title'), body: msg('attendance.excursionOut.body', { space: data.spaceName }) },
        { type: 'attendance.geofence_excursion_out', excursionId: data.excursionId },
      );
    } catch (error) {
      this.logger.error(`Failed excursion-out push: ${error}`);
    }
    this.emitExcursionSockets('geofence_excursion_out', data, { includeEmployee: true });
  }

  // Employee submitted a reason + duration → notify the responsible person(s).
  @EventPattern('geofence_excursion_requested')
  async handleExcursionRequested(@Payload() data: GeofenceExcursionEvent) {
    const watcherIds = data.watcherIds || [];
    this.logger.log(`Excursion requested: user=${data.userName}, watchers=${watcherIds.length}`);
    const facts = { name: data.userName, space: data.spaceName, minutes: data.requestedMinutes ?? '?', reason: data.reason };
    const text: LocalizedText = {
      title: msg('attendance.excursionRequested.title'),
      body: msg(data.reason ? 'attendance.excursionRequested.body' : 'attendance.excursionRequested.bodyNoReason', facts),
    };
    try {
      await this.pushService.sendToUsers(watcherIds, text, {
        type: 'attendance.geofence_excursion_requested',
        excursionId: data.excursionId,
      });
    } catch (error) {
      this.logger.error(`Failed excursion-requested push: ${error}`);
    }
    this.emitExcursionSockets('geofence_excursion_requested', data, { toWatchers: true });
    await this.store.record({
      recipientIds: watcherIds,
      organizationId: data.organizationId,
      eventType: 'geofence_excursion_requested',
      text,
      link: '/attendance?tab=tracking',
    });
  }

  // Approver granted time → notify the employee (push + their socket) + org.
  @EventPattern('geofence_excursion_approved')
  async handleExcursionApproved(@Payload() data: GeofenceExcursionEvent) {
    this.logger.log(`Excursion approved: user=${data.userName}, ${data.grantedMinutes ?? '?'} min`);
    try {
      await this.pushService.sendToUser(
        data.userId,
        {
          title: msg('attendance.excursionApproved.title'),
          body: msg('attendance.excursionApproved.body', { minutes: data.grantedMinutes ?? '?' }),
        },
        { type: 'attendance.geofence_excursion_approved', excursionId: data.excursionId },
      );
    } catch (error) {
      this.logger.error(`Failed excursion-approved push: ${error}`);
    }
    this.emitExcursionSockets('geofence_excursion_approved', data, { includeEmployee: true });
  }

  // Approver rejected → the worker was clocked out. Notify the employee + org.
  @EventPattern('geofence_excursion_rejected')
  async handleExcursionRejected(@Payload() data: GeofenceExcursionEvent) {
    this.logger.log(`Excursion rejected: user=${data.userName}`);
    try {
      await this.pushService.sendToUser(
        data.userId,
        { title: msg('attendance.excursionRejected.title'), body: msg('attendance.excursionRejected.body') },
        { type: 'attendance.geofence_excursion_rejected', excursionId: data.excursionId },
      );
    } catch (error) {
      this.logger.error(`Failed excursion-rejected push: ${error}`);
    }
    this.emitExcursionSockets('geofence_excursion_rejected', data, { includeEmployee: true });
  }

  // Worker came back inside the ring → clear the responsible person's alert.
  @EventPattern('geofence_excursion_returned')
  async handleExcursionReturned(@Payload() data: GeofenceExcursionEvent) {
    this.logger.log(`Excursion returned: user=${data.userName}`);
    this.emitExcursionSockets('geofence_excursion_returned', data, { toWatchers: true, includeEmployee: true });
  }

  // APPROVED grace timer lapsed while still out → alert the responsible person(s).
  @EventPattern('geofence_excursion_expired')
  async handleExcursionExpired(@Payload() data: GeofenceExcursionEvent) {
    const watcherIds = data.watcherIds || [];
    this.logger.log(`Excursion expired: user=${data.userName}, watchers=${watcherIds.length}`);
    const text: LocalizedText = {
      title: msg('attendance.excursionExpired.title'),
      body: msg('attendance.excursionExpired.body', { name: data.userName, space: data.spaceName }),
    };
    try {
      await this.pushService.sendToUsers(watcherIds, text, {
        type: 'attendance.geofence_excursion_expired',
        excursionId: data.excursionId,
      });
    } catch (error) {
      this.logger.error(`Failed excursion-expired push: ${error}`);
    }
    this.emitExcursionSockets('geofence_excursion_expired', data, { toWatchers: true, includeEmployee: true });
    await this.store.record({
      recipientIds: watcherIds,
      organizationId: data.organizationId,
      eventType: 'geofence_excursion_expired',
      text,
      link: '/attendance?tab=tracking',
    });
  }

  /**
   * Emit an excursion socket event. Always emits to the org room (drives the web
   * dashboard + approver list via use-realtime-sync). Optionally targets the
   * employee (self-facing states) and/or the resolved watchers (fallback ADMIN room).
   */
  private emitExcursionSockets(
    event: string,
    data: GeofenceExcursionEvent,
    opts: { includeEmployee?: boolean; toWatchers?: boolean },
  ) {
    const payload = {
      excursionId: data.excursionId,
      status: data.status,
      userId: data.userId,
      userName: data.userName,
      spaceId: data.spaceId,
      spaceName: data.spaceName,
      reason: data.reason ?? null,
      requestedMinutes: data.requestedMinutes ?? null,
      grantedMinutes: data.grantedMinutes ?? null,
      expiresAt: data.expiresAt ?? null,
      distanceM: data.distanceM ?? null,
      timestamp: new Date().toISOString(),
    };
    this.websocketGateway.emitToOrganization(data.organizationId, event, payload);
    if (opts.includeEmployee) {
      this.websocketGateway.emitToUser(data.userId, event, payload);
    }
    if (opts.toWatchers) {
      const ids = data.watcherIds || [];
      if (ids.length) {
        for (const id of ids) this.websocketGateway.emitToUser(id, event, payload);
      } else {
        this.websocketGateway.emitToRole(data.organizationId, 'ADMIN', event, payload);
      }
    }
  }

  /**
   * Space and roster changes. These carry no notification of their own — they
   * exist so open dashboards and space lists re-read instead of showing stale
   * data until someone hits refresh, which was the last case in the app that
   * still required one.
   */
  @EventPattern('space_changed')
  async handleSpaceChanged(@Payload() data: { organizationId: string; spaceId?: string | null }) {
    this.websocketGateway.emitSpaceChanged(data.organizationId, data.spaceId ?? null);
  }

  @EventPattern('document_types_changed')
  async handleDocumentTypesChanged(@Payload() data: { organizationId: string; typeId?: string | null }) {
    this.websocketGateway.emitDocumentTypesChanged(data.organizationId, data.typeId ?? null);
  }

  @EventPattern('space_roster_changed')
  async handleSpaceRosterChanged(@Payload() data: { organizationId: string; spaceId?: string | null }) {
    this.websocketGateway.emitSpaceRosterChanged(data.organizationId, data.spaceId ?? null);
  }

  @EventPattern('attendance_clock_in')
  async handleClockIn(@Payload() data: {
    userId: string;
    organizationId: string;
    timeEntry: any;
  }) {
    this.logger.log(`Clock-in: user=${data.userId}`);
    this.websocketGateway.emitClockIn(data.userId, data.organizationId, data.timeEntry);
  }

  @EventPattern('attendance_clock_out')
  async handleClockOut(@Payload() data: {
    userId: string;
    organizationId: string;
    timeEntry: any;
  }) {
    this.logger.log(`Clock-out: user=${data.userId}`);
    this.websocketGateway.emitClockOut(data.userId, data.organizationId, data.timeEntry);
  }

  // Admin-side attendance mutation (edit/approve/reject/delete/manual-add) →
  // broadcast so every open attendance view refreshes live, no page reload.
  @EventPattern('attendance_changed')
  handleAttendanceChanged(@Payload() data: { organizationId: string; action: string; entryId?: string }) {
    this.websocketGateway.emitToOrganization(data.organizationId, 'attendance.changed', {
      action: data.action,
      entryId: data.entryId ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  @EventPattern('break_started')
  async handleBreakStarted(@Payload() data: {
    userId: string;
    userName: string;
    breakId: string;
    breakType: string;
    startedAt: string;
    organizationId: string;
  }) {
    this.logger.log(`Break started: user=${data.userName}, type=${data.breakType}`);
    this.websocketGateway.emitBreakStarted(data.userId, data.organizationId, {
      breakId: data.breakId,
      userId: data.userId,
      userName: data.userName,
      type: data.breakType,
      startedAt: data.startedAt,
    });
  }

  @EventPattern('break_ended')
  async handleBreakEnded(@Payload() data: {
    userId: string;
    userName: string;
    breakId: string;
    breakType: string;
    startedAt: string;
    endedAt: string;
    durationMinutes: number;
    organizationId: string;
  }) {
    this.logger.log(`Break ended: user=${data.userName}, duration=${data.durationMinutes}min`);
    this.websocketGateway.emitBreakEnded(data.userId, data.organizationId, {
      breakId: data.breakId,
      userId: data.userId,
      userName: data.userName,
      type: data.breakType,
      startedAt: data.startedAt,
      endedAt: data.endedAt,
      durationMinutes: data.durationMinutes,
    });
  }
}

/**
 * "Monday" / "Montag" / "lunes" — the weekday of a shift, in the entry's own
 * zone and the reader's language. A function of the locale, because the same
 * event reaches a German manager and a Spanish driver.
 */
export function weekdayIn(iso: string, timezone?: string | null) {
  return (locale: SupportedLocale): string => {
    const d = new Date(iso);
    try {
      return d.toLocaleDateString(locale, { weekday: 'long', timeZone: timezone || 'UTC' });
    } catch {
      return d.toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' });
    }
  };
}

/** "07:58" in the entry's own zone; the zone is what the member's day was lived in. */
export function noShowResolvedTime(iso: string, timezone?: string | null): string {
  const d = new Date(iso);
  try {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: timezone || 'UTC' });
  } catch {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  }
}
