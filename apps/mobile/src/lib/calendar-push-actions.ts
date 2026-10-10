import { calendarApi } from './api';
import { sessionStartedAt } from './api/client';
import { mayActOnPush } from './push-recipient';

/**
 * The buttons on a calendar push (notification-service sends `category: calendar_reminder |
 * calendar_invite`). A category is the JS API on both platforms — no native change, OTA-safe —
 * and each button opens the app, which then does the one thing the button says.
 */
export const CALENDAR_REMINDER_CATEGORY = 'calendar_reminder';
export const CALENDAR_INVITE_CATEGORY = 'calendar_invite';
export const CALENDAR_ACTIONS = {
  done: 'cal_done',
  snooze: 'cal_snooze',
  accept: 'cal_accept',
  maybe: 'cal_maybe',
  decline: 'cal_decline',
} as const;

const ANSWER: Record<string, 'ACCEPTED' | 'MAYBE' | 'DECLINED'> = {
  [CALENDAR_ACTIONS.accept]: 'ACCEPTED',
  [CALENDAR_ACTIONS.maybe]: 'MAYBE',
  [CALENDAR_ACTIONS.decline]: 'DECLINED',
};

/** Is this tap one of the calendar's buttons (rather than the notification itself)? */
export function isCalendarAction(actionId: string | undefined | null): boolean {
  return !!actionId && (Object.values(CALENDAR_ACTIONS) as string[]).includes(actionId);
}

/**
 * Do what the button said. Resolves to the kind of outcome for the toast; never throws.
 *
 * ⚠️ `not-yours`: the push was not for the member signed in now (see
 * `push-recipient.ts`) — a reminder left in the tray by the last person on a
 * shared phone must not be ticked off, snoozed or answered as the next one.
 */
export async function runCalendarAction(
  actionId: string,
  data: Record<string, unknown> | undefined,
  who: { userId: string | null; deliveredAt: number | null },
): Promise<'done' | 'snoozed' | 'answered' | 'failed' | 'not-yours'> {
  const eventId = typeof data?.eventId === 'string' ? data.eventId : null;
  if (!eventId) return 'failed';
  const started = await sessionStartedAt().catch(() => null);
  if (!mayActOnPush({ data, deliveredAt: who.deliveredAt, userId: who.userId, sessionStartedAt: started })) return 'not-yours';
  // Which occurrence the push was about — a weekly reminder's "Done" is about THIS week's.
  const occurrence = typeof data?.occurrence === 'string' ? data.occurrence : undefined;
  try {
    if (actionId === CALENDAR_ACTIONS.done) { await calendarApi.done(eventId, occurrence); return 'done'; }
    if (actionId === CALENDAR_ACTIONS.snooze) { await calendarApi.snooze(eventId, 10, occurrence); return 'snoozed'; }
    const answer = ANSWER[actionId];
    if (answer) { await calendarApi.respond(eventId, answer); return 'answered'; }
  } catch {
    return 'failed';
  }
  return 'failed';
}
