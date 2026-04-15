import { Controller, Get, Logger } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
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

  // =========================================================================
  // HTTP ENDPOINTS
  // =========================================================================

  @Get('socket/stats')
  getSocketStats() {
    return this.websocketGateway.getStats();
  }

  @Get('socket/clients')
  getConnectedClients() {
    return this.websocketGateway.getConnectedClients();
  }

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

  // =========================================================================
  // PUSH TOKEN MANAGEMENT
  // =========================================================================

  @MessagePattern({ cmd: 'register_push_token' })
  async registerPushToken(@Payload() data: {
    userId: string;
    token: string;
    platform: string;
    deviceId?: string;
  }) {
    this.logger.log(`Registering push token for user ${data.userId}`);
    return this.pushService.registerPushToken(data);
  }

  @MessagePattern({ cmd: 'remove_push_token' })
  async removePushToken(@Payload() data: { token: string; userId?: string }) {
    this.logger.log(`Removing push token: ${data.token.substring(0, 20)}...`);
    return this.pushService.removePushToken(data.token);
  }

  // =========================================================================
  // TASK EVENTS
  // =========================================================================

@EventPattern('task_created')
  async handleTaskCreated(@Payload() data: any) {
    this.logger.log(`Task created: ${data.id}`);
    this.websocketGateway.emitTaskCreated(data);
  }

  @EventPattern('task_assigned')
  async handleTaskAssigned(@Payload() data: any) {
    this.logger.log(`Task assigned: task=${data.task?.id}, worker=${data.workerId}`);
    this.websocketGateway.emitTaskAssigned(data.task, data.workerId);

    try {
      const result = await this.pushService.sendTaskAssignedPush(data.workerId, {
        id: data.task.id,
        title: data.task.title,
      });
      this.logger.log(`Push result for worker ${data.workerId}: sent=${result?.sent ?? 0}, reason=${result?.reason ?? 'ok'}`);
    } catch (error) {
      this.logger.error(`Failed to send task assigned push: ${error}`);
    }
  }

  @EventPattern('task_updated')
  async handleTaskUpdated(@Payload() data: any) {
    this.logger.log(`Task updated: ${data.task?.id}`);
    this.websocketGateway.emitTaskUpdated(data.task);
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
  }

  @EventPattern('task_declined')
  async handleTaskDeclined(@Payload() data: any) {
    this.logger.log(`Task declined: ${data.task.id}`);
    this.websocketGateway.emitTaskDeclined(data.task, data.declinedBy);
  }

  @EventPattern('comment_added')
  async handleCommentAdded(@Payload() data: any) {
    this.logger.log(`Comment added to task: ${data.taskId}`);
    this.websocketGateway.emitCommentAdded(data.taskId, data.comment);

    const commenterName = data.comment?.user?.firstName
      ? `${data.comment.user.firstName} ${data.comment.user.lastName || ''}`.trim()
      : 'Someone';
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
        `${count} Blocked Task${count > 1 ? 's' : ''} Need Attention`,
        `You have ${count} blocked task${count > 1 ? 's' : ''}: ${taskNames}`,
        { type: 'blocked_tasks_reminder', taskId: data.blockedTasks[0]?.id },
      );
    } catch (error) {
      this.logger.error(`Failed to send blocked tasks reminder push: ${error}`);
    }
  }

  @EventPattern('worker_location_updated')
  async handleWorkerLocationUpdated(@Payload() data: any) {
    this.websocketGateway.emitWorkerLocationUpdated(data.workerId, data.location);
  }

  // =========================================================================
  // ATTENDANCE & BREAK EVENTS
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
    this.logger.log(`Clock-in: user=${data.userName}, location=${data.locationName}`);
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
    this.logger.log(`Clock-out: user=${data.userName}, hours=${data.totalHours}`);
    this.websocketGateway.emitToOrganization(data.organizationId, 'attendance_clock_out', {
      userId: data.userId,
      userName: data.userName,
      locationName: data.locationName,
      clockOutTime: data.clockOutTime,
      totalHours: data.totalHours,
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

  // =========================================================================
  // JOIN REQUEST EVENTS
  // =========================================================================

@EventPattern('join_request_submitted')
  async handleSubmitted(@Payload() data: {
    userId: string;
    userName: string;
    organizationId: string;
    organizationName: string;
    message?: string;
  }) {
    this.logger.log(`Join request submitted: user=${data.userName}, org=${data.organizationName}`);
    this.websocketGateway.emitToOrganization(data.organizationId, 'join_request_submitted', {
      userId: data.userId,
      userName: data.userName,
      organizationName: data.organizationName,
      message: data.message,
      timestamp: new Date().toISOString(),
    });
  }

  @EventPattern('join_request_approved')
  async handleApproved(@Payload() data: {
    userId: string;
    userName: string;
    organizationId: string;
    organizationName: string;
    role: string;
    approvedByName: string;
  }) {
    this.logger.log(`Join request approved: user=${data.userName}`);

    try {
      await this.pushService.sendToUser(
        data.userId,
        'Join Request Approved',
        `Your request to join ${data.organizationName} has been approved. Welcome aboard!`,
        { type: 'join_request_approved', organizationId: data.organizationId, role: data.role },
      );
    } catch (error) {
      this.logger.error(`Failed to send join approved push: ${error}`);
    }

    this.websocketGateway.emitToUser(data.userId, 'join_request_approved', {
      organizationId: data.organizationId,
      organizationName: data.organizationName,
      role: data.role,
      approvedByName: data.approvedByName,
      timestamp: new Date().toISOString(),
    });
  }

  @EventPattern('join_request_rejected')
  async handleRejected(@Payload() data: {
    userId: string;
    userName: string;
    organizationId: string;
    organizationName: string;
    reason?: string;
    rejectedByName: string;
  }) {
    this.logger.log(`Join request rejected: user=${data.userName}`);

    try {
      const body = data.reason
        ? `Your request to join ${data.organizationName} was not approved. Reason: ${data.reason}`
        : `Your request to join ${data.organizationName} was not approved.`;

      await this.pushService.sendToUser(
        data.userId,
        'Join Request Not Approved',
        body,
        { type: 'join_request_rejected', organizationId: data.organizationId, reason: data.reason },
      );
    } catch (error) {
      this.logger.error(`Failed to send join rejected push: ${error}`);
    }

    this.websocketGateway.emitToUser(data.userId, 'join_request_rejected', {
      organizationId: data.organizationId,
      organizationName: data.organizationName,
      reason: data.reason,
      rejectedByName: data.rejectedByName,
      timestamp: new Date().toISOString(),
    });
  }
}
