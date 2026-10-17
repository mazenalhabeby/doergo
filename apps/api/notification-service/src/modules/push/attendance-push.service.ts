import { Inject, Injectable } from '@nestjs/common';
import { msg, type LocalizedText } from '../../i18n/translate';
import {
  shiftEscalationText,
  noShowEscalationText,
  geofenceAlertText,
  pendingApprovalText,
  restName,
  duration,
} from './push-helpers';
import { PushService } from './push.service';

/**
 * Pushes about the clock: shift reminders, rests, left early, escalations,
 * no-shows, geofence, pending hours.
 */
@Injectable()
export class AttendancePushService {
  @Inject(PushService) private readonly push!: PushService;

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
    return this.push.sendToUser(
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
    return this.push.sendToUser(
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
    return this.push.sendToUser(
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
    return this.push.sendToUsers(
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
    return this.push.sendToUsers(data.leaderIds, shiftEscalationText(data), {
      type: 'shift_escalation',
      userName: data.userName,
      entryId: data.entryId,
    });
  }

  // No-show engine: nudge the worker whose shift has started but who hasn't
  // clocked in. Tapping should open the clock-in screen.
  async sendNoShowReminderPush(data: { userId: string; instanceId: string; reminderCount: number }) {
    return this.push.sendToUser(
      data.userId,
      { title: msg('attendance.noShow.title'), body: msg('attendance.noShow.body') },
      { type: 'noshow_reminder', instanceId: data.instanceId, reminderCount: data.reminderCount },
    );
  }

  // No-show escalation: the worker never clocked in → ask a space leader to
  // follow up (call the worker / mark absent / reconcile).
  async sendNoShowEscalationPush(data: { leaderIds: string[]; userName: string; instanceId: string }) {
    return this.push.sendToUsers(data.leaderIds, noShowEscalationText(data.userName), {
      type: 'noshow_escalation',
      userName: data.userName,
      instanceId: data.instanceId,
    });
  }

  /** An attendance alert answered by what the member actually did, arriving late. */
  async sendAttendanceResolvedPush(data: { recipientIds: string[]; text: LocalizedText; type: string; entryId: string }) {
    return this.push.sendToUsers(data.recipientIds, data.text, { type: data.type, entryId: data.entryId });
  }

  /** The escalation was answered by a clock-in that arrived late — tell the same leaders. */
  async sendNoShowResolvedPush(data: { leaderIds: string[]; text: LocalizedText; instanceId: string }) {
    return this.push.sendToUsers(data.leaderIds, data.text, {
      type: 'noshow_resolved',
      instanceId: data.instanceId,
    });
  }

  async sendGeofenceAlertPush(data: {
    dispatcherIds: string[];
    userName: string;
    locationName: string;
    distance: number;
    action: 'clock_in' | 'clock_out';
  }) {
    return this.push.sendToUsers(data.dispatcherIds, geofenceAlertText(data), {
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
    return this.push.sendToUsers(data.managerIds, pendingApprovalText(data.userName, data.flagReasons), {
      type: 'pending_approval',
      userName: data.userName,
      entryId: data.entryId,
    });
  }
}
