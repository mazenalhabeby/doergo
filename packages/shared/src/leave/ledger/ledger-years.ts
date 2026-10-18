/** Moved here unchanged from leave-ledger.ts. */

/**
 * THE LEAVE LEDGER — how a vacation balance is built, line by line.
 *
 * A balance used to be one subtraction: allowance − vacation approved inside
 * HBCField this calendar year. An organization that started in August, whose
 * people had already used days in their old system, showed everybody a full
 * year left. The balance is now a SUM OF VISIBLE LINES:
 *
 *   allowance (computed: the person's or the organization's, pro-rated in a
 *              first year — never stored, so changing the allowance moves it)
 * + adjustments (STORED rows: used before HBCField, carried over, a correction,
 *                an extra day granted, carried days that expired — each with
 *                who, when and why)
 * − approved vacation in the leave year (computed from the requests, never
 *   copied — a cancelled request gives its days back with no second write)
 *
 * ⚠️ Only adjustments are stored. Storing the allowance or the taken days too
 * would be a second copy of a number that already has a source, and the two
 * disagree the first time anything changes.
 *
 * Pure — the server computes, the phone and the web show the same lines.
 */

/** Stored adjustment kinds. Signed days; half days allowed. */
export const LEAVE_ADJUSTMENT_KINDS = [
  /** Used in the leave year BEFORE the organization started HBCField (negative). */
  'OPENING_USED',
  /** Brought over from the previous leave year by the carry-over rule (positive). */
  'CARRY_OVER',
  /** Carried days not used by the rule's expiry date (negative). */
  'CARRY_EXPIRED',
  /** An office correction, either sign — always with a reason. */
  'CORRECTION',
  /** Extra days granted (positive) — always with a reason. */
  'GRANT',
] as const;

export type LeaveAdjustmentKind = (typeof LEAVE_ADJUSTMENT_KINDS)[number];

/** Kinds a person may enter by hand; the others are written by the carry-over rule. */
export const MANUAL_ADJUSTMENT_KINDS: readonly LeaveAdjustmentKind[] = ['OPENING_USED', 'CORRECTION', 'GRANT'];

export function isLeaveAdjustmentKind(v: unknown): v is LeaveAdjustmentKind {
  return typeof v === 'string' && (LEAVE_ADJUSTMENT_KINDS as readonly string[]).includes(v);
}

/* ------------------------------------------------------------------ leave year */

/**
 * CALENDAR: 1 January – 31 December. WORK_YEAR: from each person's employment
 * anniversary — the Austrian default (UrlG), unless the company agreed on the
 * calendar year.
 */
export const LEAVE_YEAR_MODES = ['CALENDAR', 'WORK_YEAR'] as const;

export type LeaveYearMode = (typeof LEAVE_YEAR_MODES)[number];

export function isLeaveYearMode(v: unknown): v is LeaveYearMode {
  return typeof v === 'string' && (LEAVE_YEAR_MODES as readonly string[]).includes(v);
}

export interface LeaveYear {
  /** First and last day, inclusive, YYYY-MM-DD. */
  start: string;
  end: string;
  mode: LeaveYearMode;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD → [year, month, day]; strict index access needs the defaults. */
const ymd = (k: string): [number, number, number] => {
  const [y = 1970, m = 1, d = 1] = k.split('-').map(Number);
  return [y, m, d];
};

const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The anniversary of month/day in year y — 29 February falls back to the 28th. */
const anniversary = (y: number, m: number, d: number) => key(y, m, Math.min(d, lastDayOf(y, m)));

const dayBefore = (k: string) => {
  const t = new Date(`${k}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
};

/**
 * The leave year that contains `on` (YYYY-MM-DD). WORK_YEAR without a recorded
 * employment start falls back to the calendar year — a guessed start date would
 * move every number on the screen.
 */
export function leaveYearOf(input: {
  mode: LeaveYearMode;
  employmentStartDate?: string | null;
  on: string;
}): LeaveYear {
  const [y] = ymd(input.on);
  const start = input.employmentStartDate?.slice(0, 10);
  if (input.mode !== 'WORK_YEAR' || !start) return { mode: 'CALENDAR', start: key(y, 1, 1), end: key(y, 12, 31) };
  const [, sm, sd] = ymd(start);
  let from = anniversary(y, sm, sd);
  if (from > input.on) from = anniversary(y - 1, sm, sd);
  const [fy] = ymd(from);
  return { mode: 'WORK_YEAR', start: from, end: dayBefore(anniversary(fy + 1, sm, sd)) };
}

/** The leave year just before `year` (for carry-over). */
export function previousLeaveYear(year: LeaveYear, employmentStartDate?: string | null): LeaveYear {
  return leaveYearOf({ mode: year.mode, employmentStartDate, on: dayBefore(year.start) });
}

/* ------------------------------------------------------------------ carry-over */

export const CARRY_OVER_MODES = ['NONE', 'UP_TO', 'ALL'] as const;

export type CarryOverMode = (typeof CARRY_OVER_MODES)[number];

export interface CarryOverRule {
  mode: CarryOverMode;
  /** UP_TO: the most days carried. */
  maxDays?: number | null;
  /** Carried days expire this many months into the new leave year (e.g. 3 → end of the third month). Null = never. */
  expiresAfterMonths?: number | null;
}

/** Half days, never rounding a person's days away. */
const half = (n: number) => Math.round(n * 2) / 2;

/** How many of `remaining` days go into the next leave year. */
export function carryOverDays(remaining: number, rule: CarryOverRule): number {
  if (!(remaining > 0) || rule.mode === 'NONE') return 0;
  if (rule.mode === 'ALL') return half(remaining);
  return half(Math.min(remaining, Math.max(0, rule.maxDays ?? 0)));
}

/** The last day carried days can be used (inclusive), or null when they never expire. */
export function carryExpiryDate(year: LeaveYear, rule: CarryOverRule): string | null {
  const m = rule.expiresAfterMonths;
  if (!m || m <= 0) return null;
  const [y, mo] = ymd(year.start);
  const target = new Date(Date.UTC(y, mo - 1 + m, 1));
  return dayBefore(target.toISOString().slice(0, 10));
}

export { half };
