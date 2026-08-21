/**
 * Support SLA & priority — response targets and queue priority.
 *
 * These used to be keyed by TIER: four plans, four promises, ranked. With tiers
 * gone the promise follows what the organization actually bought, and support is
 * now three separate things it can buy:
 *
 *   nothing              48 business hours — everybody gets a real answer
 *   priority_routing     8 business hours, and ahead of everyone without it
 *   dedicated_support    2 business hours, a named contact, an onboarding call
 *
 * `live_chat` is deliberately absent. It is a different channel, not a faster
 * queue, and folding it in here would promise a ticket deadline to somebody who
 * bought a chat window.
 *
 * Pure / client-safe — no server deps.
 */

/** Everybody, including an organization that has bought no support add-on. */
export const SUPPORT_SLA_BASE_MINUTES = 48 * 60;
/** With `priority_routing` — same working day. */
export const SUPPORT_SLA_PRIORITY_MINUTES = 8 * 60;
/** With `dedicated_support` — two business hours. */
export const SUPPORT_SLA_DEDICATED_MINUTES = 120;

/**
 * Business-hours calendar used to turn "24 business hours" into a wall-clock
 * deadline. Defaults to the company HQ (Austria). `days` = ISO weekdays that
 * count (1=Mon … 7=Sun). Times are minutes-from-midnight in `timeZone`.
 */
export interface BusinessCalendar {
  timeZone: string;
  days: number[]; // ISO weekday numbers that are working days
  startMinute: number; // e.g. 9 * 60
  endMinute: number; // e.g. 17 * 60
}

export const DEFAULT_BUSINESS_CALENDAR: BusinessCalendar = {
  timeZone: 'Europe/Vienna',
  days: [1, 2, 3, 4, 5],
  startMinute: 9 * 60,
  endMinute: 17 * 60,
};

/** ISO weekday (1=Mon … 7=Sun) for a Date in a given IANA timezone. */
function isoWeekdayInTz(date: Date, timeZone: string): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[wd] ?? 1;
}

/** Minutes-from-midnight of a Date as seen in a given IANA timezone. */
function minutesOfDayInTz(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return (h % 24) * 60 + m;
}

/**
 * Add `businessMinutes` of working time to `from`, respecting the calendar's
 * working days and hours. Walks forward in coarse steps then fine steps — cheap
 * (worst case a few dozen iterations) and dependency-free. Deterministic given
 * the same inputs, so it's safe to call in a workflow / on the request path.
 */
export function businessHoursAdd(
  from: Date,
  businessMinutes: number,
  cal: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR,
): Date {
  const dayLen = cal.endMinute - cal.startMinute;
  if (dayLen <= 0 || cal.days.length === 0) {
    // Misconfigured calendar → fall back to plain elapsed minutes.
    return new Date(from.getTime() + businessMinutes * 60_000);
  }

  let cursor = new Date(from.getTime());
  let remaining = businessMinutes;
  // Safety bound: at most businessMinutes/dayLen working days + slack.
  const maxIterations = Math.ceil(businessMinutes / dayLen) + 14;

  for (let i = 0; i < maxIterations && remaining > 0; i++) {
    const weekday = isoWeekdayInTz(cursor, cal.timeZone);
    if (!cal.days.includes(weekday)) {
      cursor = advanceToNextDayStart(cursor, cal);
      continue;
    }
    const nowMin = minutesOfDayInTz(cursor, cal.timeZone);
    if (nowMin < cal.startMinute) {
      // Before opening → jump to open.
      cursor = new Date(cursor.getTime() + (cal.startMinute - nowMin) * 60_000);
      continue;
    }
    if (nowMin >= cal.endMinute) {
      // After close → next working day's open.
      cursor = advanceToNextDayStart(cursor, cal);
      continue;
    }
    const availableToday = cal.endMinute - nowMin;
    if (remaining <= availableToday) {
      return new Date(cursor.getTime() + remaining * 60_000);
    }
    remaining -= availableToday;
    cursor = new Date(cursor.getTime() + availableToday * 60_000); // now at close
  }
  return cursor;
}

/** Move the cursor to the start of the next calendar day (loop handles skips). */
function advanceToNextDayStart(cursor: Date, cal: BusinessCalendar): Date {
  const nowMin = minutesOfDayInTz(cursor, cal.timeZone);
  const minutesToMidnight = 24 * 60 - nowMin;
  // Land a hair past midnight, then to opening time on the next pass.
  return new Date(cursor.getTime() + (minutesToMidnight + cal.startMinute) * 60_000);
}

/**
 * BullMQ / inbox priority — LOWER value = higher priority.
 *
 * Never 0: BullMQ reads 0 as "unset" and the ticket would silently take the
 * default priority instead of the one it was bought.
 */
export function supportPriority(addOns: string[] | null | undefined): number {
  const has = (k: string) => Array.isArray(addOns) && addOns.includes(k);
  if (has('dedicated_support')) return 1;
  if (has('priority_routing')) return 2;
  return 4;
}

/** First-response SLA in business minutes for what this organization bought. */
export function slaBusinessMinutes(addOns: string[] | null | undefined): number {
  const has = (k: string) => Array.isArray(addOns) && addOns.includes(k);
  if (has('dedicated_support')) return SUPPORT_SLA_DEDICATED_MINUTES;
  if (has('priority_routing')) return SUPPORT_SLA_PRIORITY_MINUTES;
  return SUPPORT_SLA_BASE_MINUTES;
}

/** First-response due date for a ticket created now. */
export function slaFirstResponseDueAt(
  addOns: string[] | null | undefined,
  createdAt: Date,
  cal: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR,
): Date {
  return businessHoursAdd(createdAt, slaBusinessMinutes(addOns), cal);
}
