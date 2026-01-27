import { Controller, Get, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EmailService } from './modules/email/email.service';
import { PushService } from './modules/push/push.service';
import { WebsocketGateway } from './modules/websocket/websocket.gateway';

@Controller()
export class NotificationController {
  private readonly logger = new Logger('NotificationController');

  constructor(
    private readonly emailService: EmailService,
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  /**
   * HTTP endpoint to get Socket.IO connection statistics
   * GET /socket/stats
   */
  @Get('socket/stats')
  getSocketStats() {
    return this.websocketGateway.getStats();
  }

  /**
   * HTTP endpoint to get list of connected clients
   * GET /socket/clients
   */
  @Get('socket/clients')
  getConnectedClients() {
    return this.websocketGateway.getConnectedClients();
  }

  /**
   * HTTP health check endpoint
   * GET /health
   */
  @Get('health')
  healthCheck() {
    const stats = this.websocketGateway.getStats();
    return {
      status: 'ok',
      service: 'notification-service',
      timestamp: new Date().toISOString(),
      socket: {
        connections: stats.totalConnections,
        authenticated: stats.authenticatedClients,
      },
    };
  }

  @EventPattern('task_created')
  async handleTaskCreated(@Payload() data: any) {
    this.logger.log(`Task created event received: ${data.id}`);
    // Emit to websocket clients
    this.websocketGateway.emitTaskCreated(data);
    // Send email notification (async via queue)
    // this.emailService.queueTaskCreatedEmail(data);
  }

  @EventPattern('task_assigned')
  async handleTaskAssigned(@Payload() data: any) {
    this.logger.log(`Task assigned event received: ${data.task.id}`);
    this.websocketGateway.emitTaskAssigned(data.task, data.workerId);
    // Send email to assigned worker
    // this.emailService.queueTaskAssignedEmail(data);
  }

  @EventPattern('task_status_changed')
  async handleTaskStatusChanged(@Payload() data: any) {
    this.logger.log(`Task status changed: ${data.task.id} ${data.oldStatus} -> ${data.newStatus}`);
    this.websocketGateway.emitTaskStatusChanged(data.task, data.oldStatus, data.newStatus);
  }

  @EventPattern('task_declined')
  async handleTaskDeclined(@Payload() data: any) {
    this.logger.log(`Task declined: ${data.task.id} by ${data.declinedBy?.firstName} ${data.declinedBy?.lastName}`);
    this.websocketGateway.emitTaskDeclined(data.task, data.declinedBy);
  }

  @EventPattern('comment_added')
  async handleCommentAdded(@Payload() data: any) {
    this.logger.log(`Comment added to task: ${data.taskId}`);
    this.websocketGateway.emitCommentAdded(data.taskId, data.comment);
  }

  @EventPattern('attachment_added')
  async handleAttachmentAdded(@Payload() data: any) {
    this.logger.log(`Attachment added to task: ${data.taskId}`);
    this.websocketGateway.emitAttachmentAdded(data.taskId, data.attachment);
  }

  @EventPattern('worker_location_updated')
  async handleWorkerLocationUpdated(@Payload() data: any) {
    this.websocketGateway.emitWorkerLocationUpdated(data.workerId, data.location);
  }

  // =========================================================================
  // ATTENDANCE EVENTS
  // =========================================================================

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
    deviceToken?: string;
    organizationId: string;
  }) {
    this.logger.log(`Auto clock-out event: user=${data.userName}, location=${data.locationName}, reason=${data.reason}`);

    // Send email notification
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
      this.logger.log(`Auto clock-out email sent to ${data.userEmail}`);
    } catch (error) {
      this.logger.error(`Failed to send auto clock-out email: ${error}`);
    }

    // Send push notification if device token available
    if (data.deviceToken) {
      try {
        await this.pushService.sendAutoClockOutPush({
          deviceToken: data.deviceToken,
          locationName: data.locationName,
          totalHours: data.totalHours,
          reason: data.reason,
        });
        this.logger.log(`Auto clock-out push sent to user ${data.userId}`);
      } catch (error) {
        this.logger.error(`Failed to send auto clock-out push: ${error}`);
      }
    }

    // Emit to websocket for real-time dashboard update
    this.websocketGateway.emitToOrganization(data.organizationId, 'attendance_auto_clock_out', {
      userId: data.userId,
      userName: data.userName,
      locationName: data.locationName,
      totalHours: data.totalHours,
      reason: data.reason,
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
    dispatcherDeviceTokens: string[];
    organizationId: string;
  }) {
    this.logger.log(`Geofence alert: user=${data.userName}, distance=${data.distance}m, location=${data.locationName}`);

    // Send email to dispatchers
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

    // Send push to dispatchers
    for (const token of data.dispatcherDeviceTokens) {
      try {
        await this.pushService.sendGeofenceAlertPush({
          deviceToken: token,
          userName: data.userName,
          locationName: data.locationName,
          distance: data.distance,
          action: data.action,
        });
      } catch (error) {
        this.logger.error(`Failed to send geofence alert push: ${error}`);
      }
    }

    // Emit to websocket
    this.websocketGateway.emitToOrganization(data.organizationId, 'attendance_geofence_alert', {
      userId: data.userId,
      userName: data.userName,
      locationName: data.locationName,
      distance: data.distance,
      action: data.action,
      timestamp: new Date().toISOString(),
    });
  }

  @EventPattern('attendance_clock_in')
  async handleClockIn(@Payload() data: {
    userId: string;
    userName: string;
    locationName: string;
    clockInTime: string;
    withinGeofence: boolean;
    organizationId: string;
  }) {
    this.logger.log(`Clock-in event: user=${data.userName}, location=${data.locationName}`);

    // Emit to websocket for real-time dashboard
    this.websocketGateway.emitToOrganization(data.organizationId, 'attendance_clock_in', {
      userId: data.userId,
      userName: data.userName,
      locationName: data.locationName,
      clockInTime: data.clockInTime,
      withinGeofence: data.withinGeofence,
    });
  }

  @EventPattern('attendance_clock_out')
  async handleClockOut(@Payload() data: {
    userId: string;
    userName: string;
    locationName: string;
    clockOutTime: string;
    totalHours: number;
    organizationId: string;
  }) {
    this.logger.log(`Clock-out event: user=${data.userName}, location=${data.locationName}, hours=${data.totalHours}`);

    // Emit to websocket for real-time dashboard
    this.websocketGateway.emitToOrganization(data.organizationId, 'attendance_clock_out', {
      userId: data.userId,
      userName: data.userName,
      locationName: data.locationName,
      clockOutTime: data.clockOutTime,
      totalHours: data.totalHours,
    });
  }

  // =========================================================================
  // BREAK EVENTS
  // =========================================================================

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

    // Emit to websocket for real-time dashboard
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
    this.logger.log(`Break ended: user=${data.userName}, type=${data.breakType}, duration=${data.durationMinutes}min`);

    // Emit to websocket for real-time dashboard
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
