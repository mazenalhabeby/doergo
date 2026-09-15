import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_LOCALE, PrismaService, type SupportedLocale } from '@hbcfield/shared';
import Expo, { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { pushRouting } from '@hbcfield/shared';
import { RecipientLocales } from '../../i18n/recipient-locales.service';
import { msg, render, renderText, type LocalizedText, type Msg } from '../../i18n/translate';

/**
 * Every push this product sends.
 *
 * ⚠️ THERE IS NO WAY TO SEND A STRING. The only entry points take a
 * `LocalizedText` — catalogue keys and the facts to fill them with — because a
 * push is written for people whose language the caller does not know. The
 * recipients are grouped by the language they read and each group is rendered
 * and sent once, so a push to thirty approvers is at most five batches, and
 * their languages cost one query (`RecipientLocales`).
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly expo: Expo;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly locales: RecipientLocales,
  ) {
    this.expo = new Expo();
  }

  /**
   * Register a push token for a user — and, when the app says so, the language
   * it is set to. This is the one call every phone makes on every launch, so it
   * is where an app that has changed language (or was installed before the
   * server asked) is sure to be heard. An app that sends no locale changes
   * nothing: an old build must not reset somebody back to English.
   */
  async registerPushToken(data: {
    userId: string;
    token: string;
    platform: string;
    deviceId?: string;
    locale?: string;
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

    if (data.locale !== undefined) await this.locales.set(userId, data.locale);

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
   * One text to many people, each in their own language.
   *
   * Tokens and languages are each ONE query for the whole list. Duplicate and
   * empty ids are dropped here, so a caller merging watchers with leaders does
   * not buzz somebody twice.
   */
  async sendToUsers(
    userIds: Array<string | null | undefined>,
    text: LocalizedText,
    data?: Record<string, any>,
  ) {
    const ids = [...new Set(userIds.filter((id): id is string => !!id))];
    if (ids.length === 0) return { success: true, sent: 0, reason: 'no_recipients' };

    const rows: Array<{ userId: string; token: string }> = await this.prisma.userPushToken.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, token: true },
    });
    if (rows.length === 0) {
      this.logger.warn(`No push tokens registered for ${ids.length} recipient(s) of ${data?.type ?? 'a push'}`);
      return { success: true, sent: 0, reason: 'no_tokens_registered' };
    }

    const localeOf = await this.locales.localesFor([...new Set(rows.map((r) => r.userId))]);
    const byLocale = new Map<SupportedLocale, string[]>();
    for (const row of rows) {
      const locale = localeOf.get(row.userId) ?? DEFAULT_LOCALE;
      const list = byLocale.get(locale) ?? [];
      list.push(row.token);
      byLocale.set(locale, list);
    }

    let sent = 0;
    let failed = 0;
    for (const [locale, tokens] of byLocale) {
      const { title, body } = renderText(locale, text);
      const result = await this.deliver(tokens, title, body, data);
      sent += result.sent;
      failed += result.failed;
    }
    return { success: true, sent, failed };
  }

  async sendToUser(userId: string, text: LocalizedText, data?: Record<string, any>) {
    return this.sendToUsers([userId], text, data);
  }

  /** Already rendered, already grouped: hand it to Expo. */
  private async deliver(tokens: string[], title: string, body: string, data?: Record<string, any>) {
    const validTokens = tokens.filter((token) => Expo.isExpoPushToken(token));
    if (validTokens.length === 0) {
      this.logger.warn('No valid Expo push tokens found');
      return { sent: 0, failed: 0 };
    }

    /*
      Where it lands and how loudly — decided by one shared table, because the
      server names the Android channel and the APP is what creates it. Two
      opinions on that string is a push delivered to a channel nobody registered.

      `interruptionLevel` is the iPhone half: without it a Work Focus or Do Not
      Disturb silences a shift ending and a rest falling due, which are exactly
      the two things worth interrupting for.
    */
    const routing = pushRouting(data?.type);
    const messages: ExpoPushMessage[] = validTokens.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data,
      priority: 'high',
      channelId: routing.channelId,
      interruptionLevel: routing.interruptionLevel,
    }));

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

    const errors = tickets.filter((ticket) => ticket.status === 'error');
    if (errors.length > 0) {
      this.logger.warn(`${errors.length} push notifications failed`);
    }

    return { sent: tickets.filter((t) => t.status === 'ok').length, failed: errors.length };
  }

  // =========================================================================
  // TASK NOTIFICATIONS
  // =========================================================================

  async sendTaskAssignedPush(technicianId: string, task: { id: string; title: string }) {
    return this.sendToUser(
      technicianId,
      { title: msg('task.assigned.title'), body: msg('task.assigned.body', { task: task.title }) },
      { taskId: task.id, type: 'task_assigned' },
    );
  }

  /**
   * "Leave now" — the nudge that makes an appointment time worth setting.
   *
   * Says the arrival time as well as the departure, because a member reading
   * this on a lock screen needs to know what they are being hurried towards,
   * and says when the drive is only an estimate.
   */
  async sendDepartureDuePush(
    userId: string,
    task: { id: string; title: string },
    detail: { dueTime: string; travelMinutes: number; estimated: boolean },
  ) {
    const params = { task: task.title, time: detail.dueTime, minutes: detail.travelMinutes };
    return this.sendToUser(
      userId,
      {
        title: msg('task.departure.title'),
        body: msg(detail.estimated ? 'task.departure.bodyEstimated' : 'task.departure.body', params),
      },
      { taskId: task.id, type: 'task_departure_due' },
    );
  }

  async sendStatusChangePush(userId: string, task: { id: string; title: string }, newStatus: string) {
    return this.sendToUser(
      userId,
      {
        title: msg('task.statusChanged.title'),
        body: msg('task.statusChanged.body', { task: task.title, status: taskStatus(newStatus) }),
      },
      { taskId: task.id, type: 'status_change', status: newStatus },
    );
  }

  async sendTaskCommentPush(userId: string, task: { id: string; title: string }, commenterName: string | Msg) {
    return this.sendToUser(
      userId,
      { title: msg('task.comment.title'), body: msg('task.comment.body', { name: commenterName, task: task.title }) },
      { taskId: task.id, type: 'comment_added' },
    );
  }

  // =========================================================================
  // ATTENDANCE NOTIFICATIONS
  // =========================================================================

  // (No "clocked out automatically" push: nothing ends a shift for anybody. A
  // shift LEFT open is closed with a temporary time and announced as
  // `attendance.clock_out_unconfirmed` — see the attendance handler.)

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
    return this.sendToUser(
      data.userId,
      {
        title: msg('attendance.shiftReminder.title'),
        body: data.unscheduled
          ? msg('attendance.shiftReminder.bodyUnscheduled', { location: data.locationName, hours: data.hoursOpen ?? '?' })
          : msg('attendance.shiftReminder.body', { location: data.locationName }),
      },
      {
        type: 'shift_reminder',
        entryId: data.entryId,
        reminderCount: data.reminderCount,
      },
    );
  }

  /**
   * A rest has fallen due.
   *
   * The body says whether it counts as working time, because that is the fact
   * that decides whether somebody stops now or keeps going: a rest that does not
   * count is time off the clock, and a member who does not know that will take
   * it late and be surprised.
   */
  async sendBreakDuePush(data: {
    userId: string;
    entryId: string;
    ruleId: string;
    name: string;
    durationMinutes: number;
    isPaid: boolean;
    expiresAt: string | null;
    snoozeCount: number;
  }) {
    const params = {
      minutes: data.durationMinutes,
      cost: msg(data.isPaid ? 'attendance.breakDue.counted' : 'attendance.breakDue.notCounted'),
    };
    return this.sendToUser(
      data.userId,
      {
        title: msg('attendance.breakDue.title', { rest: restName(data.name) }),
        body: msg(data.snoozeCount > 0 ? 'attendance.breakDue.bodyStillDue' : 'attendance.breakDue.body', params),
      },
      {
        type: 'break_due',
        entryId: data.entryId,
        ruleId: data.ruleId,
        durationMinutes: data.durationMinutes,
        expiresAt: data.expiresAt,
      },
    );
  }

  /** The rest has run its length — one nudge, then silence. */
  async sendBreakOverPush(data: {
    userId: string;
    entryId: string;
    breakId: string;
    name: string;
    durationMinutes: number;
  }) {
    return this.sendToUser(
      data.userId,
      { title: msg('attendance.breakOver.title', { rest: restName(data.name) }), body: msg('attendance.breakOver.body') },
      { type: 'break_over', entryId: data.entryId, breakId: data.breakId },
    );
  }

  /** A shift ended short. Told to whoever reconciles attendance for that space. */
  async sendLeftEarlyPush(data: {
    leaderIds: string[];
    userName: string;
    locationName: string;
    shortfallMinutes: number;
    reason: string | null;
    entryId: string;
  }) {
    if (!data.leaderIds?.length) return { success: true, skipped: 'no leaders' };
    const params = {
      name: data.userName,
      short: duration(data.shortfallMinutes),
      location: data.locationName,
      reason: data.reason,
    };
    return this.sendToUsers(
      data.leaderIds,
      {
        title: msg('attendance.leftEarly.title'),
        body: msg(data.reason ? 'attendance.leftEarly.body' : 'attendance.leftEarly.bodyNoReason', params),
      },
      { type: 'attendance_left_early', entryId: data.entryId },
    );
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
    return this.sendToUsers(data.leaderIds, shiftEscalationText(data), {
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
      { title: msg('attendance.noShow.title'), body: msg('attendance.noShow.body') },
      { type: 'noshow_reminder', instanceId: data.instanceId, reminderCount: data.reminderCount },
    );
  }

  // No-show escalation: the worker never clocked in → ask a space leader to
  // follow up (call the worker / mark absent / reconcile).
  async sendNoShowEscalationPush(data: { leaderIds: string[]; userName: string; instanceId: string }) {
    return this.sendToUsers(data.leaderIds, noShowEscalationText(data.userName), {
      type: 'noshow_escalation',
      userName: data.userName,
      instanceId: data.instanceId,
    });
  }

  /** An attendance alert answered by what the member actually did, arriving late. */
  async sendAttendanceResolvedPush(data: { recipientIds: string[]; text: LocalizedText; type: string; entryId: string }) {
    return this.sendToUsers(data.recipientIds, data.text, { type: data.type, entryId: data.entryId });
  }

  /** The escalation was answered by a clock-in that arrived late — tell the same leaders. */
  async sendNoShowResolvedPush(data: { leaderIds: string[]; text: LocalizedText; instanceId: string }) {
    return this.sendToUsers(data.leaderIds, data.text, {
      type: 'noshow_resolved',
      instanceId: data.instanceId,
    });
  }

  // A worker asked to keep working past their shift — notify the space's
  // overtime approvers so they can grant/deny extra minutes.
  async sendOvertimeRequestPush(data: {
    leaderIds: string[];
    userName: string;
    locationName: string;
    entryId: string;
  }) {
    return this.sendToUsers(data.leaderIds, overtimeRequestText(data.userName, data.locationName), {
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
    const approved = data.decision === 'approved';
    return this.sendToUser(
      data.userId,
      {
        title: msg(approved ? 'attendance.overtimeDecision.titleApproved' : 'attendance.overtimeDecision.titleDeclined'),
        body: !approved
          ? msg('attendance.overtimeDecision.bodyDeclined')
          : data.minutes
            ? msg('attendance.overtimeDecision.bodyApprovedMinutes', { minutes: data.minutes })
            : msg('attendance.overtimeDecision.bodyApproved'),
      },
      {
        type: 'overtime_decision',
        entryId: data.entryId,
        decision: data.decision,
        minutes: data.minutes,
      },
    );
  }

  async sendGeofenceAlertPush(data: {
    dispatcherIds: string[];
    userName: string;
    locationName: string;
    distance: number;
    action: 'clock_in' | 'clock_out';
  }) {
    return this.sendToUsers(data.dispatcherIds, geofenceAlertText(data), {
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
    flagReasons: string[];
    entryId: string;
  }) {
    return this.sendToUsers(data.managerIds, pendingApprovalText(data.userName, data.flagReasons), {
      type: 'pending_approval',
      userName: data.userName,
      entryId: data.entryId,
    });
  }

  /**
   * A member asked for days off → the people routed to hear about them.
   *
   * `recipientIds`, not `dispatcherIds`: who is told is resolved from the
   * member's own routing (their Access watchers, then their spaces' notify
   * config), which has nothing to do with holding any particular role.
   */
  async sendTimeOffRequestPush(data: { recipientIds: string[]; text: LocalizedText; technicianName: string; startDate: string; endDate: string }) {
    return this.sendToUsers(data.recipientIds, data.text, {
      type: 'time_off_request',
      technicianName: data.technicianName,
      startDate: data.startDate,
      endDate: data.endDate,
    });
  }

  async sendTimeOffApprovedPush(data: {
    technicianId: string;
    text: LocalizedText;
    startDate: string;
    endDate: string;
    approved: boolean;
  }) {
    return this.sendToUser(data.technicianId, data.text, {
      type: 'time_off_response',
      approved: data.approved,
      startDate: data.startDate,
      endDate: data.endDate,
    });
  }
}

// ── Texts shared by a push and the bell entry written beside it ──────────────
// One definition each, so the two cannot drift into saying different things.

export function shiftEscalationText(data: { userName: string; locationName: string; unscheduled?: boolean; hoursOpen?: number }): LocalizedText {
  return data.unscheduled
    ? {
        title: msg('attendance.escalation.titleUnscheduled'),
        body: msg('attendance.escalation.bodyUnscheduled', { name: data.userName, location: data.locationName, hours: data.hoursOpen ?? '?' }),
      }
    : {
        title: msg('attendance.escalation.title'),
        body: msg('attendance.escalation.body', { name: data.userName, location: data.locationName }),
      };
}

export function noShowEscalationText(userName: string): LocalizedText {
  return { title: msg('attendance.noShowEscalation.title'), body: msg('attendance.noShowEscalation.body', { name: userName }) };
}

export function overtimeRequestText(userName: string, locationName: string): LocalizedText {
  return {
    title: msg('attendance.overtimeRequest.title'),
    body: msg('attendance.overtimeRequest.body', { name: userName, location: locationName }),
  };
}

export function geofenceAlertText(data: { userName: string; locationName: string; distance: number; action: 'clock_in' | 'clock_out' }): LocalizedText {
  return {
    title: msg('attendance.geofence.title'),
    body: msg(data.action === 'clock_in' ? 'attendance.geofence.bodyIn' : 'attendance.geofence.bodyOut', {
      name: data.userName,
      distance: Math.round(data.distance),
      location: data.locationName,
    }),
  };
}

const KNOWN_FLAGS = new Set([
  'OVERTIME',
  'MISSED_CLOCK_OUT',
  'OUTSIDE_GEOFENCE_IN',
  'OUTSIDE_GEOFENCE_OUT',
  'LATE_ARRIVAL',
  'EARLY_DEPARTURE',
  'UNSCHEDULED_DAY',
]);

export function pendingApprovalText(userName: string, flagReasons: string[]): LocalizedText {
  const reasons = flagReasons ?? [];
  // A flag this catalogue does not know yet still says SOMETHING: its own name,
  // readable, rather than a missing-key error on a manager's lock screen.
  const flags = reasons.length
    ? (locale: SupportedLocale) =>
        [...new Set(reasons.map((r) => (KNOWN_FLAGS.has(r) ? render(locale, msg(`attendance.flag.${r}` as 'attendance.flag.OVERTIME')) : r.replace(/_/g, ' ').toLowerCase())))].join(', ')
    : msg('attendance.flag.needsReview');
  return { title: msg('attendance.approval.title'), body: msg('attendance.approval.body', { name: userName, flags }) };
}

const KNOWN_STATUSES = new Set([
  'DRAFT', 'NEW', 'ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELED', 'CLOSED',
]);

/**
 * A status name. The built-in statuses are translated; a workflow's own status
 * was named by the organization, in its own language, and is shown as named.
 */
export function taskStatus(status: string): Msg | string {
  return KNOWN_STATUSES.has(status) ? msg(`taskStatus.${status}` as 'taskStatus.NEW') : String(status ?? '').replace(/_/g, ' ');
}

/**
 * A rest's own name inside a sentence. English, Spanish, French and Italian
 * lower-case a common noun mid-sentence ("time for your lunch break"); German
 * capitalises every noun, so "Mittagspause" stays as the organization wrote it.
 */
export function restName(name: string) {
  return (locale: SupportedLocale) => (locale === 'de' ? name : name.toLowerCase());
}

/** "1 h 5 min" / "40 min". */
export function duration(totalMinutes: number): Msg {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? msg('common.durationHm', { h, m }) : msg('common.durationM', { m });
}
