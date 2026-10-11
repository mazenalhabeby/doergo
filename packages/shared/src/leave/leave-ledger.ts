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
export function leaveYearOf(input: { mode: LeaveYearMode; employmentStartDate?: string | null; on: string }): LeaveYear {
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

export const DEFAULT_CARRY_OVER_RULE: CarryOverRule = { mode: 'NONE', maxDays: null, expiresAfterMonths: null };

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

/**
 * Carried days that expire: carried days are used FIRST (the oldest days go
 * first, which is what the law and every payroll office assume), so what
 * expires is what is left of them after the vacation taken up to the expiry.
 */
export function carryExpiredDays(input: { carried: number; takenUpToExpiry: number }): number {
  return half(Math.max(0, input.carried - Math.max(0, input.takenUpToExpiry)));
}

/* ------------------------------------------------------------------ the balance */

export interface LeaveAdjustmentRow {
  kind: LeaveAdjustmentKind | string;
  days: number;
}

export interface LeaveBalanceLine {
  /** 'ALLOWANCE' | 'TAKEN' | an adjustment kind. */
  key: 'ALLOWANCE' | 'TAKEN' | LeaveAdjustmentKind;
  days: number;
}

export interface LeaveBalance {
  allowance: number;
  /** Sum of every adjustment (signed). */
  adjusted: number;
  taken: number;
  pending: number;
  remaining: number;
  /** In display order, zero lines left out — what the screen draws. */
  lines: LeaveBalanceLine[];
}

const ORDER: LeaveBalanceLine['key'][] = ['ALLOWANCE', 'OPENING_USED', 'CARRY_OVER', 'CARRY_EXPIRED', 'GRANT', 'CORRECTION', 'TAKEN'];

/** allowance + adjustments − taken. Pending requests are shown, not subtracted. */
export function leaveBalance(input: {
  allowance: number;
  adjustments: readonly LeaveAdjustmentRow[];
  taken: number;
  pending: number;
}): LeaveBalance {
  const byKind = new Map<string, number>();
  for (const a of input.adjustments) {
    if (!isLeaveAdjustmentKind(a.kind) || !Number.isFinite(a.days)) continue;
    byKind.set(a.kind, half((byKind.get(a.kind) ?? 0) + a.days));
  }
  const adjusted = half([...byKind.values()].reduce((s, d) => s + d, 0));
  const lines: LeaveBalanceLine[] = [];
  for (const k of ORDER) {
    const days = k === 'ALLOWANCE' ? input.allowance : k === 'TAKEN' ? -input.taken : byKind.get(k) ?? 0;
    if (days !== 0 || k === 'ALLOWANCE') lines.push({ key: k, days: half(days) });
  }
  return {
    allowance: half(input.allowance),
    adjusted,
    taken: half(input.taken),
    pending: half(input.pending),
    remaining: half(input.allowance + adjusted - input.taken),
    lines,
  };
}

/* ------------------------------------------------------------------ input */

export const LEAVE_ADJUSTMENT_LIMITS = { MAX_ABS_DAYS: 366, REASON_MAX: 500 } as const;

export type LeaveAdjustmentInputError =
  | 'ADJUSTMENT_KIND_INVALID'
  | 'ADJUSTMENT_DAYS_INVALID'
  | 'ADJUSTMENT_REASON_REQUIRED'
  | 'ADJUSTMENT_REASON_TOO_LONG'
  | 'ADJUSTMENT_DATE_INVALID';

export interface LeaveAdjustmentInput {
  kind: LeaveAdjustmentKind;
  /** Signed, in half days. OPENING_USED is entered as the days used (positive) and stored negative. */
  days: number;
  /** A day inside the leave year it belongs to (YYYY-MM-DD). */
  on: string;
  reason: string | null;
}

/**
 * Read a hand-entered adjustment. Only MANUAL kinds; CORRECTION and GRANT need
 * a reason (a number nobody can explain is the problem this replaces).
 * "Used before HBCField: 10" is how people say it, so OPENING_USED accepts the
 * positive count and stores it as −10.
 */
export function parseLeaveAdjustment(
  raw: unknown,
): { ok: true; value: LeaveAdjustmentInput } | { ok: false; code: LeaveAdjustmentInputError } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (!isLeaveAdjustmentKind(b.kind) || !MANUAL_ADJUSTMENT_KINDS.includes(b.kind)) return { ok: false, code: 'ADJUSTMENT_KIND_INVALID' };
  const n = typeof b.days === 'number' ? b.days : typeof b.days === 'string' ? Number(b.days.replace(',', '.')) : NaN;
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) > LEAVE_ADJUSTMENT_LIMITS.MAX_ABS_DAYS || half(n) !== n) {
    return { ok: false, code: 'ADJUSTMENT_DAYS_INVALID' };
  }
  if (b.kind === 'OPENING_USED' && n < 0) return { ok: false, code: 'ADJUSTMENT_DAYS_INVALID' };
  if (b.kind === 'GRANT' && n < 0) return { ok: false, code: 'ADJUSTMENT_DAYS_INVALID' };
  const on = typeof b.on === 'string' ? b.on.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) return { ok: false, code: 'ADJUSTMENT_DATE_INVALID' };
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (reason.length > LEAVE_ADJUSTMENT_LIMITS.REASON_MAX) return { ok: false, code: 'ADJUSTMENT_REASON_TOO_LONG' };
  if ((b.kind === 'CORRECTION' || b.kind === 'GRANT') && !reason) return { ok: false, code: 'ADJUSTMENT_REASON_REQUIRED' };
  return { ok: true, value: { kind: b.kind, days: b.kind === 'OPENING_USED' ? -n : n, on, reason: reason || null } };
}

/* ------------------------------------------------------------------ starting balances */

export interface OpeningBalanceRow {
  /** 1-based line in what was pasted. */
  line: number;
  /** An email (preferred) or a full name — matched by the server, never trusted as an id. */
  person: string;
  used: number;
  carried: number;
}

/**
 * Read a pasted table from the old system: one person per line,
 * `person ; used ; carried` (also tab or comma separated; a header row and
 * empty lines are skipped; "10,5" reads as 10.5). Lines that cannot be read are
 * reported, not guessed — the screen shows them next to the rest.
 */
export function parseOpeningBalances(text: string): { rows: OpeningBalanceRow[]; errors: { line: number; text: string }[] } {
  const rows: OpeningBalanceRow[] = [];
  const errors: { line: number; text: string }[] = [];
  const num = (s: string | undefined) => (s == null || s.trim() === '' ? 0 : Number(s.trim().replace(',', '.')));
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line) return;
    const cells = line.includes('\t') ? line.split('\t') : line.includes(';') ? line.split(';') : line.split(',');
    const [person, usedS, carriedS] = cells.map((c) => c.trim());
    const used = num(usedS), carried = num(carriedS);
    if (!person) return;
    if (i === 0 && (Number.isNaN(used) || Number.isNaN(carried))) return; // a header row
    if (!Number.isFinite(used) || !Number.isFinite(carried) || used < 0 || carried < 0 || used > 366 || carried > 366 || half(used) !== used || half(carried) !== carried) {
      errors.push({ line: i + 1, text: rawLine });
      return;
    }
    rows.push({ line: i + 1, person, used, carried });
  });
  return { rows, errors };
}
