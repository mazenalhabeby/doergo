import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@doergo/shared';
import Expo, { ExpoPushMessage, ExpoPushTicket, ExpoPushReceipt } from 'expo-server-sdk';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly expo: Expo;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.expo = new Expo();
  }

  /**
   * Register a push token for a user
   */
  async registerPushToken(data: {
    userId: string;
    token: string;
    platform: string;
    deviceId?: string;
  }) {
    const { userId, token, platform, deviceId } = data;

    // Validate the token format
    if (!Expo.isExpoPushToken(token)) {
      this.logger.warn(`Invalid Expo push token: ${token}`);
      return { success: false, error: 'Invalid push token format' };
    }

    // Upsert the token (create or update if exists)
    const pushToken = await this.prisma.userPushToken.upsert({
      where: { token },
      update: {
        userId,
        platform,
        deviceId,
        updatedAt: new Date(),
      },
      create: {
        userId,
        token,
        platform,
        deviceId,
      },
    });

    this.logger.log(`Registered push token for user ${userId}: ${token.substring(0, 20)}...`);
    return { success: true, data: pushToken };
  }

  /**
   * Remove a push token
   */
  async removePushToken(token: string) {
    try {
      await this.prisma.userPushToken.delete({
        where: { token },
      });
      return { success: true };
    } catch {
      return { success: false, error: 'Token not found' };
    }
  }

  /**
   * Get all push tokens for a user
   */
  async getUserTokens(userId: string): Promise<string[]> {
    const tokens = await this.prisma.userPushToken.findMany({
      where: { userId },
      select: { token: true },
    });
    return tokens.map((t) => t.token);
  }

  /**
   * Send push notification to specific tokens
   */
  async sendPushNotification(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, any>,
  ) {
    if (tokens.length === 0) {
      this.logger.debug('No tokens provided for push notification');
      return { success: true, sent: 0 };
    }

    // Filter valid tokens
    const validTokens = tokens.filter((token) => Expo.isExpoPushToken(token));
    if (validTokens.length === 0) {
      this.logger.warn('No valid Expo push tokens found');
      return { success: false, error: 'No valid push tokens' };
    }

    // Build messages
    const messages: ExpoPushMessage[] = validTokens.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data,
    }));

    // Chunk and send
    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        this.logger.error('Error sending push notifications:', error);
      }
    }

    // Log any errors
    const errors = tickets.filter(
      (ticket) => ticket.status === 'error',
    );
    if (errors.length > 0) {
      this.logger.warn(`${errors.length} push notifications failed`);
    }

    return {
      success: true,
      sent: tickets.filter((t) => t.status === 'ok').length,
      failed: errors.length,
    };
  }

  /**
   * Send push notification to a user (by user ID)
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ) {
    const tokens = await this.getUserTokens(userId);
    return this.sendPushNotification(tokens, title, body, data);
  }

  // =========================================================================
  // TASK NOTIFICATIONS
  // =========================================================================

  async sendTaskAssignedPush(technicianId: string, task: { id: string; title: string }) {
    return this.sendToUser(
      technicianId,
      'New Task Assigned',
      `You have been assigned: ${task.title}`,
      { taskId: task.id, type: 'task_assigned' },
    );
  }

  async sendStatusChangePush(
    userId: string,
    task: { id: string; title: string },
    newStatus: string,
  ) {
    return this.sendToUser(
      userId,
      'Task Status Updated',
      `Task "${task.title}" is now ${newStatus}`,
      { taskId: task.id, type: 'status_change', status: newStatus },
    );
  }

  async sendTaskCommentPush(
    userId: string,
    task: { id: string; title: string },
    commenterName: string,
  ) {
    return this.sendToUser(
      userId,
      'New Comment',
      `${commenterName} commented on "${task.title}"`,
      { taskId: task.id, type: 'comment_added' },
    );
  }

  // =========================================================================
  // ATTENDANCE NOTIFICATIONS
  // =========================================================================

  async sendAutoClockOutPush(data: {
    userId: string;
    locationName: string;
    totalHours: number;
    reason: 'exceeded_duration' | 'end_of_day';
  }) {
    const body =
      data.reason === 'exceeded_duration'
        ? `Auto clock-out from ${data.locationName}: exceeded max duration (${data.totalHours.toFixed(1)}h)`
        : `Auto clock-out from ${data.locationName}: end of day (${data.totalHours.toFixed(1)}h)`;

    return this.sendToUser(data.userId, 'Auto Clock-Out', body, {
      type: 'auto_clock_out',
      reason: data.reason,
      locationName: data.locationName,
      totalHours: data.totalHours,
    });
  }

  async sendGeofenceAlertPush(data: {
    dispatcherIds: string[];
    userName: string;
    locationName: string;
    distance: number;
    action: 'clock_in' | 'clock_out';
  }) {
    const body = `${data.userName} ${data.action === 'clock_in' ? 'clocked in' : 'clocked out'} ${Math.round(data.distance)}m from ${data.locationName}`;

    // Collect all tokens for all dispatchers
    const allTokens: string[] = [];
    for (const dispatcherId of data.dispatcherIds) {
      const tokens = await this.getUserTokens(dispatcherId);
      allTokens.push(...tokens);
    }

    return this.sendPushNotification(allTokens, 'Geofence Alert', body, {
      type: 'geofence_alert',
      userName: data.userName,
      locationName: data.locationName,
      distance: data.distance,
      action: data.action,
    });
  }

  async sendOvertimeAlertPush(data: {
    dispatcherIds: string[];
    userName: string;
    currentHours: number;
    overtimeThreshold: number;
  }) {
    const body = `${data.userName} has worked ${data.currentHours.toFixed(1)} hours today (overtime threshold: ${data.overtimeThreshold}h)`;

    const allTokens: string[] = [];
    for (const dispatcherId of data.dispatcherIds) {
      const tokens = await this.getUserTokens(dispatcherId);
      allTokens.push(...tokens);
    }

    return this.sendPushNotification(allTokens, 'Overtime Alert', body, {
      type: 'overtime_alert',
      userName: data.userName,
      currentHours: data.currentHours,
    });
  }

  async sendTimeOffRequestPush(data: {
    dispatcherIds: string[];
    technicianName: string;
    startDate: string;
    endDate: string;
  }) {
    const body = `${data.technicianName} requested time off: ${data.startDate} to ${data.endDate}`;

    const allTokens: string[] = [];
    for (const dispatcherId of data.dispatcherIds) {
      const tokens = await this.getUserTokens(dispatcherId);
      allTokens.push(...tokens);
    }

    return this.sendPushNotification(allTokens, 'Time Off Request', body, {
      type: 'time_off_request',
      technicianName: data.technicianName,
      startDate: data.startDate,
      endDate: data.endDate,
    });
  }

  async sendTimeOffApprovedPush(data: {
    technicianId: string;
    startDate: string;
    endDate: string;
    approved: boolean;
  }) {
    const title = data.approved ? 'Time Off Approved' : 'Time Off Rejected';
    const body = data.approved
      ? `Your time off request (${data.startDate} to ${data.endDate}) has been approved`
      : `Your time off request (${data.startDate} to ${data.endDate}) has been rejected`;

    return this.sendToUser(data.technicianId, title, body, {
      type: 'time_off_response',
      approved: data.approved,
      startDate: data.startDate,
      endDate: data.endDate,
    });
  }
}
