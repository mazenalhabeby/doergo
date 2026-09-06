/**
 * Where a push lands, and how loudly.
 *
 * Two platform rules make this a shared table rather than a line of code in the
 * server and another in the app:
 *
 *  1. ANDROID FREEZES A CHANNEL AT CREATION. Importance, sound and vibration
 *     belong to the user once the channel exists; calling
 *     `setNotificationChannelAsync` again with a higher importance is silently
 *     ignored. The only way to correct a channel that was registered too quietly
 *     is to publish a NEW id and delete the old one — hence the version suffix.
 *     This is why `attendance` is retired rather than edited: every phone that
 *     ever ran this app already has it, at IMPORTANCE_DEFAULT, forever.
 *
 *  2. THE SERVER NAMES THE CHANNEL, THE APP CREATES IT. A push carrying a
 *     `channelId` the device has never registered falls back to a default
 *     channel on some Android versions and is dropped on others. The two halves
 *     must agree exactly, so they read the same constant.
 */

/** Android channel ids the app registers and the server addresses. */
export const PUSH_CHANNELS = {
  DEFAULT: 'default',
  TASKS: 'tasks',
  /**
   * v2: the original `attendance` channel was registered at IMPORTANCE_DEFAULT,
   * which makes a sound and then sits silently in the shade — it never appears
   * over what the member is looking at. A shift ending and a rest falling due
   * are time-bound by nature: they are worth interrupting for, or they are not
   * worth sending.
   */
  ATTENDANCE: 'attendance_v2',
} as const;

export type PushChannel = (typeof PUSH_CHANNELS)[keyof typeof PUSH_CHANNELS];

/**
 * Channels replaced by a version bump. The app deletes these so the member does
 * not end up with two "Attendance" switches in their system settings, one of
 * which does nothing.
 */
export const RETIRED_PUSH_CHANNELS: readonly string[] = ['attendance'];

/**
 * iOS interruption levels we use.
 *
 * `time-sensitive` is what breaks through Do Not Disturb and a Work Focus, and
 * needs the Time Sensitive entitlement in the build. Deliberately NOT `critical`
 * — that overrides the ring/silent switch, requires a special entitlement from
 * Apple, and is meant for medical and safety alarms. Asking for it invites a
 * review problem this product does not need.
 */
export type PushInterruptionLevel = 'active' | 'time-sensitive';

export interface PushRouting {
  channelId: PushChannel;
  interruptionLevel: PushInterruptionLevel;
}

/**
 * Notification `data.type` values that are bound to a moment: acting late is the
 * same as not acting. These interrupt; everything else waits its turn.
 *
 * Matched by prefix, so `attendance_clock_in` and the rest of the family are
 * covered without listing every one — but the list is explicit rather than
 * "anything containing attendance", because a silent category should have to be
 * a decision rather than a spelling accident.
 */
const TIME_SENSITIVE_PREFIXES = [
  'attendance', // clock in/out, geofence
  'shift_', // shift_reminder, shift_escalation
  'break_', // break_due, break_over
  'overtime', // overtime_request, overtime_decision
  'noshow',
] as const;

/** Types that belong on the attendance channel rather than the task channel. */
const ATTENDANCE_PREFIXES = TIME_SENSITIVE_PREFIXES;

/**
 * The one routing decision, read by the notification service when it sends and
 * by the app when it registers. Unknown types fall to the task channel at normal
 * urgency: a new notification is quiet until somebody says it should not be.
 */
export function pushRouting(type?: string | null): PushRouting {
  const t = (type ?? '').toLowerCase();
  const isAttendance = ATTENDANCE_PREFIXES.some((p) => t.startsWith(p));
  const isTimeSensitive = TIME_SENSITIVE_PREFIXES.some((p) => t.startsWith(p));
  return {
    channelId: isAttendance ? PUSH_CHANNELS.ATTENDANCE : PUSH_CHANNELS.TASKS,
    interruptionLevel: isTimeSensitive ? 'time-sensitive' : 'active',
  };
}
