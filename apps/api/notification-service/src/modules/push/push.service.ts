import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PushService {
  constructor(private configService: ConfigService) {}

  // TODO: Implement FCM/Expo push notifications
  async sendPushNotification(
    deviceTokens: string[],
    title: string,
    body: string,
    data?: Record<string, any>,
  ) {
    console.log('Push notification:', { deviceTokens, title, body, data });
    // Implementation would use Expo Push API or FCM
    return { success: true, sent: deviceTokens.length };
  }

  async sendTaskAssignedPush(deviceToken: string, task: any) {
    return this.sendPushNotification(
      [deviceToken],
      'New Task Assigned',
      `You have been assigned: ${task.title}`,
      { taskId: task.id, type: 'task_assigned' },
    );
  }

  async sendStatusChangePush(deviceToken: string, task: any, newStatus: string) {
    return this.sendPushNotification(
      [deviceToken],
      'Task Status Updated',
      `Task "${task.title}" is now ${newStatus}`,
      { taskId: task.id, type: 'status_change', status: newStatus },
    );
  }

  // =========================================================================
  // ATTENDANCE NOTIFICATIONS
  // =========================================================================

  async sendAutoClockOutPush(data: {
    deviceToken: string;
    locationName: string;
    totalHours: number;
    reason: 'exceeded_duration' | 'end_of_day';
  }) {
    const body = data.reason === 'exceeded_duration'
      ? `Auto clock-out from ${data.locationName}: exceeded max duration (${data.totalHours.toFixed(1)}h)`
      : `Auto clock-out from ${data.locationName}: end of day (${data.totalHours.toFixed(1)}h)`;

    return this.sendPushNotification(
      [data.deviceToken],
      'Auto Clock-Out',
      body,
      {
        type: 'auto_clock_out',
        reason: data.reason,
        locationName: data.locationName,
        totalHours: data.totalHours,
      },
    );
  }

  async sendGeofenceAlertPush(data: {
    deviceToken: string;
    userName: string;
    locationName: string;
    distance: number;
    action: 'clock_in' | 'clock_out';
  }) {
    return this.sendPushNotification(
      [data.deviceToken],
      'Geofence Alert',
      `${data.userName} ${data.action === 'clock_in' ? 'clocked in' : 'clocked out'} ${Math.round(data.distance)}m from ${data.locationName}`,
      {
        type: 'geofence_alert',
        userName: data.userName,
        locationName: data.locationName,
        distance: data.distance,
        action: data.action,
      },
    );
  }

  async sendOvertimeAlertPush(data: {
    deviceToken: string;
    userName: string;
    currentHours: number;
    overtimeThreshold: number;
  }) {
    return this.sendPushNotification(
      [data.deviceToken],
      'Overtime Alert',
      `${data.userName} has worked ${data.currentHours.toFixed(1)} hours today (overtime threshold: ${data.overtimeThreshold}h)`,
      {
        type: 'overtime_alert',
        userName: data.userName,
        currentHours: data.currentHours,
      },
    );
  }
}
