/**
 * When does this person need reminding next?
 *
 * Each attendee row carries ONE indexed instant (`nextRemindAt`) and the occurrence it belongs to.
 * The sweep asks "what is due" — a cheap index scan — instead of expanding every repeating event
 * every minute. After a reminder fires (or is snoozed, or marked done) this function decides the
 * next instant, and the row is updated with a conditional write so two replicas never send twice.
 */
import { occurrences, type Repeat } from './recurrence';

/** The offsets a person can pick, in minutes before the start. */
export const REMINDER_OFFSETS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080] as const;
export const MAX_REMINDERS = 5;
export const SNOOZE_MINUTES = 10;

/** Validate a list of reminder offsets from a request. */
export function parseReminderOffsets(input: unknown): number[] {
  if (input === undefined || input === null) return [10];
  if (!Array.isArray(input)) throw new Error('REMINDERS_INVALID');
  const allowed = new Set<number>(REMINDER_OFFSETS);
  const out = [...new Set(input.map(Number))];
  if (out.length > MAX_REMINDERS || out.some((m) => !allowed.has(m))) throw new Error('REMINDERS_INVALID');
  return out.sort((a, b) => b - a);
}

export interface ReminderEvent {
  startAt: Date;
  endAt: Date;
  repeat: Repeat | null;
  timezone: string;
  /** Minutes before the start. */
  offsets: readonly number[];
}

export interface NextReminder {
  at: Date;
  /** The occurrence this reminder is about. */
  occurrence: Date;
  /** Minutes before that occurrence. */
  offset: number;
}

/**
 * The earliest reminder strictly after `after` whose occurrence has not started yet.
 * `skipOccurrence` excludes one occurrence entirely — "Done" means "don't remind me about this one again".
 */
export function nextReminder(ev: ReminderEvent, after: Date, skipOccurrence?: Date | null): NextReminder | null {
  if (!ev.offsets.length) return null;
  const maxOffsetMs = Math.max(...ev.offsets) * 60000;
  const duration = Math.max(ev.endAt.getTime() - ev.startAt.getTime(), 0);
  // Occurrences that could still produce a reminder after `after`: they start after `after`, and
  // the furthest-ahead reminder for them is no more than maxOffset before that.
  const windowEnd = new Date(after.getTime() + maxOffsetMs + 400 * 86400000);
  const occ = occurrences(ev.startAt, duration, ev.repeat, ev.timezone, after, windowEnd)
    .filter((o) => o.getTime() > after.getTime())
    .slice(0, 60);
  let best: NextReminder | null = null;
  for (const o of occ) {
    if (skipOccurrence && o.getTime() === skipOccurrence.getTime()) continue;
    for (const off of ev.offsets) {
      const at = new Date(o.getTime() - off * 60000);
      // A reminder whose moment has already passed fires once, now, rather than never — saving an
      // event 5 minutes before it starts with a 10-minute reminder should still ring.
      const effective = at.getTime() > after.getTime() ? at : null;
      if (!effective) continue;
      if (!best || effective.getTime() < best.at.getTime()) best = { at: effective, occurrence: o, offset: off };
    }
    // Occurrences are in order; once one has produced a candidate earlier than the next could, stop.
    if (best && o.getTime() - maxOffsetMs > best.at.getTime()) break;
  }
  return best;
}

/**
 * The first reminder for a freshly saved event. Like `nextReminder`, but a reminder that should
 * already have fired for an occurrence that has not started yet fires immediately.
 */
export function firstReminder(ev: ReminderEvent, now: Date): NextReminder | null {
  const next = nextReminder(ev, now);
  const duration = Math.max(ev.endAt.getTime() - ev.startAt.getTime(), 0);
  const soon = occurrences(
    ev.startAt,
    duration,
    ev.repeat,
    ev.timezone,
    now,
    new Date(now.getTime() + Math.max(...ev.offsets, 0) * 60000 + 1),
  ).find((o) => o.getTime() > now.getTime());
  if (soon && (!next || next.occurrence.getTime() !== soon.getTime())) {
    return { at: now, occurrence: soon, offset: Math.round((soon.getTime() - now.getTime()) / 60000) };
  }
  return next;
}
