import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EmailService } from '../modules/email/email.service';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { NotificationStore } from '../common/notification-store.service';

// Human-friendly labels for attendance approval flags (keep in sync with the web
// attendance helpers).
const FLAG_LABELS: Record<string, string> = {
  OVERTIME: 'overtime',
  MISSED_CLOCK_OUT: 'missed clock-out',
  OUTSIDE_GEOFENCE_IN: 'out of geofence',
  OUTSIDE_GEOFENCE_OUT: 'out of geofence',
  LATE_ARRIVAL: 'late arrival',
  EARLY_DEPARTURE: 'early departure',
  UNSCHEDULED_DAY: 'unscheduled day',
};

@Controller()
export class AttendanceNotificationHandler {
  private readonly logger = new Logger('AttendanceNotificationHandler');

  constructor(
    private readonly emailService: EmailService,
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

  @EventPattern('attendance_auto_clock_out')
  async handleAutoClockOut(@Payload() data: {
    userId: string;
    userEmail: string;
    userName: string;
    locationName: string;
    clockInTime: string;
    clockOutTime: string;
    totalHours: number;
    reason: 'exceeded_duration' | 'end_of_day';
    organizationId: string;
  }) {
    this.logger.log(`Auto clock-out: user=${data.userName}, reason=${data.reason}`);

    try {
      await this.emailService.sendAutoClockOutEmail({
        userEmail: data.userEmail,
        userName: data.userName,
        locationName: data.locationName,
        clockInTime: data.clockInTime,
        clockOutTime: data.clockOutTime,
        totalHours: data.totalHours,
        reason: data.reason,
      });
    } catch (error) {
      this.logger.error(`Failed to send auto clock-out email: ${error}`);
    }

    try {
      await this.pushService.sendAutoClockOutPush({
        userId: data.userId,
        locationName: data.locationName,
        totalHours: data.totalHours,
        reason: data.reason,
      });
    } catch (error) {
      this.logger.error(`Failed to send auto clock-out push: ${error}`);
    }

    this.websocketGateway.emitToOrganization(data.organizationId, 'attendance_auto_clock_out', {
      userId: data.userId,
      userName: data.userName,
      locationName: data.locationName,
      totalHours: data.totalHours,
      reason: data.reason,
      timestamp: new Date().toISOString(),
    });
  }

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
      this.websocketGateway.emitToRole('ADMIN', 'attendance_shift_escalation', payload);
    }

    // Persist to the in-app inbox for the resolved leaders.
    await this.store.record({
      recipientIds: leaderIds,
      organizationId: data.organizationId,
      eventType: 'attendance_shift_escalation',
      title: data.unscheduled ? 'Long open session needs review' : 'Open shift needs review',
      body: data.unscheduled
        ? `${data.userName} has been clocked in at ${data.locationName} for ~${data.hoursOpen ?? "?"}h with no scheduled shift and hasn't responded — review and approve/adjust their hours`
        : `${data.userName} is still clocked in at ${data.locationName} after their shift and hasn't responded`,
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
    if (leaderIds.length) {
      for (const id of leaderIds) {
        this.websocketGateway.emitToUser(id, 'attendance_overtime_request', payload);
      }
    } else {
      this.websocketGateway.emitToRole('ADMIN', 'attendance_overtime_request', payload);
    }

    await this.store.record({
      recipientIds: leaderIds,
      organizationId: data.organizationId,
      eventType: 'attendance_overtime_request',
      title: 'Extra-time request',
      body: `${data.userName} wants to keep working past their shift at ${data.locationName}`,
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

    this.websocketGateway.emitToUser(data.userId, 'attendance_overtime_decision', {
      entryId: data.entryId,
      decision: data.decision,
      minutes: data.minutes,
      newExpectedClockOutAt: data.newExpectedClockOutAt,
      timestamp: new Date().toISOString(),
    });
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

    for (const email of data.dispatcherEmails) {
      try {
        await this.emailService.sendGeofenceAlertEmail({
          userEmail: email,
          userName: data.userName,
          locationName: data.locationName,
          distance: data.distance,
          allowedRadius: data.allowedRadius,
          action: data.action,
        });
      } catch (error) {
        this.logger.error(`Failed to send geofence alert email to ${email}: ${error}`);
      }
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
      title: 'Geofence alert',
      body: `${data.userName} ${data.action === 'clock_in' ? 'clocked in' : 'clocked out'} ${data.distance}m from ${data.locationName}`,
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
        flagSummary,
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
      this.websocketGateway.emitToRole('ADMIN', 'attendance_pending_approval', payload);
    }

    // Persist to the in-app inbox for the approvers.
    await this.store.record({
      recipientIds: approverIds,
      organizationId: data.organizationId,
      eventType: 'attendance_pending_approval',
      title: 'Approval needed',
      body: `${data.userName}'s time entry needs review (${flagSummary})`,
      link: '/attendance?tab=approvals',
    });
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
