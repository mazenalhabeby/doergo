import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@hbcfield/shared';
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
    return tokens.map((t: { token: string }) => t.token);
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
      this.logger.warn(`No push tokens registered for notification: "${title}"`);
      return { success: true, sent: 0, reason: 'no_tokens_registered' };
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
      priority: 'high',
      channelId: data?.type?.includes('attendance') ? 'attendance' : 'tasks',
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

  // Shift reminder engine: nudge the worker whose shift has ended but is still
  // clocked in. The `type`/`entryId` let the mobile app render the "I forgot" /
  // "working extra" actions (wired in the mobile phase).
  async sendShiftReminderPush(data: {
    userId: string;
    entryId: string;
    locationName: string;
    reminderCount: number;
    unscheduled?: boolean;
    hoursOpen?: number;
  }) {
    const body = data.unscheduled
      ? `You've been clocked in at ${data.locationName} for ~${data.hoursOpen ?? '?'}h — did you forget to clock out?`
      : `Your shift at ${data.locationName} has ended — did you forget to clock out, or are you working extra time?`;
    return this.sendToUser(data.userId, 'Still clocked in?', body, {
      type: 'shift_reminder',
      entryId: data.entryId,
      reminderCount: data.reminderCount,
    });
  }

  // Escalation: nobody responded to the reminders → ask a space leader to
  // reconcile the still-open shift. Nothing is auto-closed.
  async sendShiftEscalationPush(data: {
    leaderIds: string[];
    userName: string;
    locationName: string;
    entryId: string;
    unscheduled?: boolean;
    hoursOpen?: number;
  }) {
    const body = data.unscheduled
      ? `${data.userName} has been clocked in at ${data.locationName} for ~${data.hoursOpen ?? '?'}h with no scheduled shift. Review and approve/adjust their hours.`
      : `${data.userName} is still clocked in at ${data.locationName} after their shift ended and hasn't responded. Please review.`;

    const allTokens: string[] = [];
    for (const leaderId of data.leaderIds) {
      const tokens = await this.getUserTokens(leaderId);
      allTokens.push(...tokens);
    }

    return this.sendPushNotification(allTokens, data.unscheduled ? 'Long open session' : 'Open shift needs review', body, {
      type: 'shift_escalation',
      userName: data.userName,
      entryId: data.entryId,
    });
  }

  // No-show engine: nudge the worker whose shift has started but who hasn't
  // clocked in. Tapping should open the clock-in screen.
  async sendNoShowReminderPush(data: { userId: string; instanceId: string; reminderCount: number }) {
    return this.sendToUser(
      data.userId,
      'Shift started — clock in',
      `Your shift has started and you're not clocked in yet. Tap to clock in.`,
      { type: 'noshow_reminder', instanceId: data.instanceId, reminderCount: data.reminderCount },
    );
  }

  // No-show escalation: the worker never clocked in → ask a space leader to
  // follow up (call the worker / mark absent / reconcile).
  async sendNoShowEscalationPush(data: { leaderIds: string[]; userName: string; instanceId: string }) {
    const allTokens: string[] = [];
    for (const leaderId of data.leaderIds) {
      const tokens = await this.getUserTokens(leaderId);
      allTokens.push(...tokens);
    }
    return this.sendPushNotification(
      allTokens,
      'No-show',
      `${data.userName} hasn't clocked in for their shift and isn't responding. Please follow up.`,
      { type: 'noshow_escalation', userName: data.userName, instanceId: data.instanceId },
    );
  }

  // A worker asked to keep working past their shift — notify the space's
  // overtime approvers so they can grant/deny extra minutes.
  async sendOvertimeRequestPush(data: {
    leaderIds: string[];
    userName: string;
    locationName: string;
    entryId: string;
  }) {
    const body = `${data.userName} wants to keep working past their shift at ${data.locationName}. Approve extra time?`;

    const allTokens: string[] = [];
    for (const leaderId of data.leaderIds) {
      const tokens = await this.getUserTokens(leaderId);
      allTokens.push(...tokens);
    }

    return this.sendPushNotification(allTokens, 'Extra-time request', body, {
      type: 'overtime_request',
      userName: data.userName,
      entryId: data.entryId,
    });
  }

  // Tell the worker whether their extra time was approved (and for how long) or
  // rejected (they should clock out now).
  async sendOvertimeDecisionPush(data: {
    userId: string;
    entryId: string;
    decision: 'approved' | 'rejected';
    minutes?: number;
  }) {
    const body =
      data.decision === 'approved'
        ? `Your extra time was approved${data.minutes ? ` for ${data.minutes} more minutes` : ''}.`
        : 'Your extra-time request was declined — please clock out.';

    return this.sendToUser(data.userId, data.decision === 'approved' ? 'Overtime approved' : 'Overtime declined', body, {
      type: 'overtime_decision',
      entryId: data.entryId,
      decision: data.decision,
      minutes: data.minutes,
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

  async sendPendingApprovalPush(data: {
    managerIds: string[];
    userName: string;
    flagSummary: string;
    entryId: string;
  }) {
    const body = `${data.userName}'s time entry needs approval (${data.flagSummary})`;

    const allTokens: string[] = [];
    for (const managerId of data.managerIds) {
      const tokens = await this.getUserTokens(managerId);
      allTokens.push(...tokens);
    }

    return this.sendPushNotification(allTokens, 'Approval Needed', body, {
      type: 'pending_approval',
      userName: data.userName,
      entryId: data.entryId,
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
