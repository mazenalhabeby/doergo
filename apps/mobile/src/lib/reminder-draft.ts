import type { ReminderKind, ReminderRepeat } from '@hbcfield/shared/client';
import { dateFromDayKey } from './log-dates';

/**
 * The reminder half of the composer's draft, and the one calculation it does.
 *
 * Kept out of `components/customer/reminder-fields.tsx` so it can be tested:
 * the mobile runner is deliberately React-Native-free and matches `.spec.ts`
 * only, so anything living in a `.tsx` component is verified by eye. The
 * local-time rule below is precisely the kind of thing eyes do not catch — it
 * is wrong by two hours in Vienna and right in London.
 */
export type ReminderDraft = {
  /** "YYYY-MM-DD", or "" while only a preset has been chosen. */
  dayKey: string;
  /** "HH:mm". Defaults to a working hour rather than midnight. */
  time: string;
  kind: ReminderKind;
  /** Minutes before `dueAt` to fire. */
  lead: number;
  repeat: ReminderRepeat;
  /** A user id, or "" for every manager of this client. */
  assigneeId: string;
};

/** A reminder with nothing said about it yet. */
export const EMPTY_REMINDER: ReminderDraft = {
  dayKey: '',
  time: '09:00',
  kind: 'CALL',
  lead: 0,
  repeat: 'NONE',
  assigneeId: '',
};

/**
 * The exact instant this draft means, or null while no day has been picked.
 *
 * ⚠️ Built in LOCAL time and then serialised, never assembled as a string. A
 * member standing in Vienna picking 09:00 means nine o'clock where they are;
 * `new Date('2026-09-20T09:00:00Z')` is eleven, and `new Date('2026-09-20T09:00')`
 * is parsed as UTC by some engines and locally by others — so a reminder set at
 * the customer's door would fire two hours late, on some phones.
 *
 * A malformed hour falls back to nine rather than to midnight: a day picked for
 * a follow-up call is never a request to be woken at 00:00.
 */
export function reminderDueAt(draft: ReminderDraft): string | null {
  const day = dateFromDayKey(draft.dayKey);
  if (!day) return null;
  const [hh, mm] = draft.time.split(':');
  day.setHours(hourOr(hh, 9), hourOr(mm, 0), 0, 0);
  return day.toISOString();
}

/**
 * One segment of "HH:mm", or the fallback.
 *
 * ⚠️ The blank is checked BEFORE the number. `Number('')` is `0`, not `NaN`, so
 * `Number.isFinite(Number(''))` is true — an empty time therefore read as
 * midnight, which is the single value this function exists to avoid.
 */
function hourOr(part: string | undefined, fallback: number): number {
  if (!part?.trim()) return fallback;
  const n = Number(part);
  return Number.isFinite(n) ? n : fallback;
}
