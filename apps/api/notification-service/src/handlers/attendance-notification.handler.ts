import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EmailService } from '../modules/email/email.service';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';

@Controller()
export class AttendanceNotificationHandler {
  private readonly logger = new Logger('AttendanceNotificationHandler');

  constructor(
    private readonly emailService: EmailService,
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

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
