import { formatDistance, type SupportedLocale } from '@hbcfield/shared';
import { msg, render, type LocalizedText, type Msg } from '../../i18n/translate';

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
/** One device to reach, and whose it is. */
interface PushTarget {
  token: string;
  userId: string;
}

// ── Texts shared by a push and the bell entry written beside it ──────────────
// One definition each, so the two cannot drift into saying different things.

export function shiftEscalationText(data: {
  userName: string;
  locationName: string;
  unscheduled?: boolean;
  hoursOpen?: number;
}): LocalizedText {
  return data.unscheduled
    ? {
        title: msg('attendance.escalation.titleUnscheduled'),
        body: msg('attendance.escalation.bodyUnscheduled', {
          name: data.userName,
          location: data.locationName,
          hours: data.hoursOpen ?? '?',
        }),
      }
    : {
        title: msg('attendance.escalation.title'),
        body: msg('attendance.escalation.body', { name: data.userName, location: data.locationName }),
      };
}

export function noShowEscalationText(userName: string): LocalizedText {
  return {
    title: msg('attendance.noShowEscalation.title'),
    body: msg('attendance.noShowEscalation.body', { name: userName }),
  };
}

export function overtimeRequestText(userName: string, locationName: string): LocalizedText {
  return {
    title: msg('attendance.overtimeRequest.title'),
    body: msg('attendance.overtimeRequest.body', { name: userName, location: locationName }),
  };
}

export function geofenceAlertText(data: {
  userName: string;
  locationName: string;
  distance: number;
  action: 'clock_in' | 'clock_out';
}): LocalizedText {
  return {
    title: msg('attendance.geofence.title'),
    body: msg(data.action === 'clock_in' ? 'attendance.geofence.bodyIn' : 'attendance.geofence.bodyOut', {
      name: data.userName,
      // Written by the shared formatter in each reader's language: "850 m", "9,631 km".
      distance: (locale) => formatDistance(data.distance, { locale }),
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
        [
          ...new Set(
            reasons.map((r) =>
              KNOWN_FLAGS.has(r)
                ? render(locale, msg(`attendance.flag.${r}` as 'attendance.flag.OVERTIME'))
                : r.replace(/_/g, ' ').toLowerCase(),
            ),
          ),
        ].join(', ')
    : msg('attendance.flag.needsReview');
  return { title: msg('attendance.approval.title'), body: msg('attendance.approval.body', { name: userName, flags }) };
}

const KNOWN_STATUSES = new Set([
  'DRAFT',
  'NEW',
  'ASSIGNED',
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'BLOCKED',
  'COMPLETED',
  'CANCELED',
  'CLOSED',
]);

/**
 * A status name. The built-in statuses are translated; a workflow's own status
 * was named by the organization, in its own language, and is shown as named.
 */
export function taskStatus(status: string): Msg | string {
  return KNOWN_STATUSES.has(status)
    ? msg(`taskStatus.${status}` as 'taskStatus.NEW')
    : String(status ?? '').replace(/_/g, ' ');
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

export { PushTarget, KNOWN_FLAGS, KNOWN_STATUSES };
