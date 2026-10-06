import { calendarApi } from './api';

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

/** Do what the button said. Resolves to the kind of outcome for the toast; never throws. */
export async function runCalendarAction(actionId: string, data: Record<string, unknown> | undefined): Promise<'done' | 'snoozed' | 'answered' | 'failed'> {
  const eventId = typeof data?.eventId === 'string' ? data.eventId : null;
  if (!eventId) return 'failed';
  try {
    if (actionId === CALENDAR_ACTIONS.done) { await calendarApi.done(eventId); return 'done'; }
    if (actionId === CALENDAR_ACTIONS.snooze) { await calendarApi.snooze(eventId, 10); return 'snoozed'; }
    const answer = ANSWER[actionId];
    if (answer) { await calendarApi.respond(eventId, answer); return 'answered'; }
  } catch {
    return 'failed';
  }
  return 'failed';
}
