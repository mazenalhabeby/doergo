import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  eventPattern,
  type EventPayload,
  attendanceGeofenceAlertEvent,
  attendanceOvertimeDecisionEvent,
  attendanceOvertimeRequestEvent,
  attendancePendingApprovalEvent,
} from '@hbcfield/shared/microservices';
import { EmailService } from '../../email/email.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { NotificationStore } from '../../inbox/notification-store.service';
import { geofenceAlertText, overtimeRequestText, pendingApprovalText } from '../../push/push.service';
import { FLAG_LABELS } from './attendance-notification-helpers';
import { AttendancePushService } from '../../push/attendance-push.service';
import { ApprovalPushService } from '../../push/approval-push.service';

/**
 * Decisions waiting on somebody: extra time asked and decided, geofence alerts,
 * hours pending approval.
 */
@Controller()
export class AttendanceAlertsHandler {
  private readonly logger = new Logger('AttendanceAlertsHandler');

  constructor(
    private readonly emailService: EmailService,
    private readonly approvalPush: ApprovalPushService,
    private readonly attendancePush: AttendancePushService,
    private readonly websocketGateway: WebsocketGateway,
    private readonly store: NotificationStore,
  ) {}

  // Worker asked to keep working past their shift → notify overtime approvers.
  @EventPattern(eventPattern(attendanceOvertimeRequestEvent))
  async handleOvertimeRequest(@Payload() data: EventPayload<typeof attendanceOvertimeRequestEvent>) {
    const leaderIds = data.leaderIds || [];
    this.logger.log(`Overtime request: user=${data.userName}, entry=${data.entryId}, leaders=${leaderIds.length}`);

    try {
      await this.approvalPush.sendOvertimeRequestPush({
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
  @EventPattern(eventPattern(attendanceOvertimeDecisionEvent))
  async handleOvertimeDecision(@Payload() data: EventPayload<typeof attendanceOvertimeDecisionEvent>) {
    this.logger.log(`Overtime decision: entry=${data.entryId}, decision=${data.decision}`);

    try {
      await this.approvalPush.sendOvertimeDecisionPush({
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

  @EventPattern(eventPattern(attendanceGeofenceAlertEvent))
  async handleGeofenceAlert(@Payload() data: EventPayload<typeof attendanceGeofenceAlertEvent>) {
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
      await this.attendancePush.sendGeofenceAlertPush({
        dispatcherIds: data.dispatcherIds,
        userName: data.userName,
        locationName: data.locationName,
        distance: data.distance,
        action: data.action,
      });
    } catch (error) {
      this.logger.error(`Failed to send geofence alert push: ${error}`);
    }

    this.websocketGateway.emitAttendance(data.organizationId, data.locationId, null, 'attendance_geofence_alert', {
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

  @EventPattern(eventPattern(attendancePendingApprovalEvent))
  async handlePendingApproval(@Payload() data: EventPayload<typeof attendancePendingApprovalEvent>) {
    const flagSummary =
      (data.flagReasons || []).map((r) => FLAG_LABELS[r] || r.replace(/_/g, ' ').toLowerCase()).join(', ') ||
      'needs review';

    this.logger.log(`Pending approval: user=${data.userName}, flags=[${flagSummary}]`);

    try {
      await this.attendancePush.sendPendingApprovalPush({
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
}
