/**
 * The leave ledger as the API carries it — response shapes, the organization's leave
 * policy as a request body, and which day a `?on=` / `?year=` query means. Server, phone
 * and web read these; the arithmetic lives in leave-ledger.ts.
 */
import {
  CARRY_OVER_MODES,
  LEAVE_YEAR_MODES,
  type CarryOverMode,
  type LeaveAdjustmentKind,
  type LeaveBalanceLine,
  type LeaveYear,
  type LeaveYearMode,
} from './leave-ledger';

/* ------------------------------------------------------------------ which leave year */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The day whose leave year a request asks about: `on` (YYYY-MM-DD) wins; `year` means the
 * leave year that STARTS in that calendar year (for the calendar year: that year; for a work
 * year: the one beginning on that year's anniversary) — its 31 December always lies inside
 * it; nothing = today. Null when what was sent cannot be read (a 400, never a guess).
 */
export function leaveYearDayFromQuery(q: { on?: unknown; year?: unknown }, today: string): string | null {
  if (q.on != null && q.on !== '') {
    const on = String(q.on).slice(0, 10);
    return DAY.test(on) && !Number.isNaN(Date.parse(on)) ? on : null;
  }
  if (q.year != null && q.year !== '') {
    const y = Number(q.year);
    return Number.isInteger(y) && y >= 2000 && y <= 2100 ? `${y}-12-31` : null;
  }
  return today;
}

/* ------------------------------------------------------------------ the balance */

/** GET /employees/:id/leave-balance */
export interface LeaveBalanceResponse {
  /** Calendar year the leave year starts in (old clients key the request count's `byYear` on it). */
  year: number;
  allowance: number;
  taken: number;
  pending: number;
  remaining: number;
  prorated: boolean;
  fullAllowance: number;
  startedOn: string | null;
  leaveYear: LeaveYear;
  /** Sum of the leave year's non-voided adjustments (signed). */
  adjusted: number;
  /** allowance, each adjustment kind, taken — in display order, zero lines left out. */
  lines: LeaveBalanceLine[];
  /** The last day carried-over days can be used, when this year has carried days that expire. */
  carryExpiresOn: string | null;
}

/* ------------------------------------------------------------------ the ledger */

export interface LeaveLedgerPerson {
  id: string;
  firstName: string;
  lastName: string;
}

/** Where a line came from: typed by somebody, the starting-balances screen, or the carry-over rule. */
export type LeaveLedgerSource = 'MANUAL' | 'OPENING' | 'CARRY_RULE';

export interface LeaveLedgerEntry {
  id: string;
  kind: LeaveAdjustmentKind;
  /** Signed, half days. */
  days: number;
  leaveYearStart: string;
  reason: string | null;
  source: LeaveLedgerSource;
  createdAt: string;
  /** Null for a line the carry-over rule wrote. */
  createdBy: LeaveLedgerPerson | null;
  /** Set = undone; the line counts for nothing and stays visible. */
  voidedAt: string | null;
  voidedBy: LeaveLedgerPerson | null;
}

/** GET /employees/:id/leave-adjustments */
export interface LeaveLedgerResponse {
  leaveYear: LeaveYear;
  /** Newest first, voided lines included. */
  items: LeaveLedgerEntry[];
  /** May the CALLER add or undo lines for this person (scope + nobody adjusts their own). */
  canEdit: boolean;
}

/** POST /employees/:id/leave-adjustments and POST /employees/leave-adjustments/:id/void */
export interface LeaveAdjustmentWriteResponse {
  entry: LeaveLedgerEntry;
  balance: LeaveBalanceResponse;
}

/** The source a stored sourceKey names. */
export function leaveLedgerSource(sourceKey: string | null | undefined): LeaveLedgerSource {
  if (!sourceKey) return 'MANUAL';
  if (sourceKey.startsWith('opening')) return 'OPENING';
  return 'CARRY_RULE';
}

/** Idempotency keys — one per person, leave year and purpose. */
export const leaveSourceKey = {
  opening: (userId: string, yearStart: string) => `opening:${userId}:${yearStart}`,
  openingCarry: (userId: string, yearStart: string) => `opening-carry:${userId}:${yearStart}`,
  carry: (userId: string, yearStart: string) => `carry:${userId}:${yearStart}`,
  carryExpired: (userId: string, yearStart: string) => `carry-expired:${userId}:${yearStart}`,
} as const;

/* ------------------------------------------------------------------ starting balances */

export const OPENING_LIMITS = { MAX_ROWS: 500, MAX_TEXT: 200_000 } as const;

/** GET /employees/leave-opening */
export interface LeaveOpeningRow {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  leaveYear: LeaveYear;
  /** Days used before HBCField this leave year (positive), 0 when none entered. */
  used: number;
  /** Days brought over from the previous leave year on this screen, 0 when none. */
  carried: number;
  /** The balance as it stands with what is saved (allowance + adjustments − taken). */
  allowance: number;
  remaining: number;
}

export interface LeaveOpeningResponse {
  on: string;
  /** Organization.leaveTrackingStartedOn — null until starting balances are first saved. */
  trackingStartedOn: string | null;
  mode: LeaveYearMode;
  rows: LeaveOpeningRow[];
}

/** POST /employees/leave-opening */
export interface LeaveOpeningSaveResponse {
  on: string;
  trackingStartedOn: string | null;
  /** Lines written, lines undone (replaced or set to 0), people whose numbers were already the same. */
  written: number;
  voided: number;
  unchanged: number;
}

/** POST /employees/leave-opening/match */
export interface LeaveOpeningMatchResponse {
  matched: Array<{
    line: number;
    person: string;
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    used: number;
    carried: number;
    by: 'EMAIL' | 'NAME';
  }>;
  unmatched: Array<{
    line: number;
    person: string;
    used: number;
    carried: number;
    reason: 'NOT_FOUND' | 'AMBIGUOUS' | 'DUPLICATE';
  }>;
  errors: Array<{ line: number; text: string }>;
}

/* ------------------------------------------------------------------ the organization's policy */

export interface LeavePolicyInput {
  defaultLeaveAllowance?: number;
  leaveYearMode?: LeaveYearMode;
  carryOverMode?: CarryOverMode;
  carryOverMaxDays?: number | null;
  carryExpiresAfterMonths?: number | null;
  leaveTrackingStartedOn?: string | null;
}

export type LeavePolicyError =
  | 'LEAVE_ALLOWANCE_INVALID'
  | 'LEAVE_YEAR_MODE_INVALID'
  | 'CARRY_OVER_MODE_INVALID'
  | 'CARRY_OVER_MAX_INVALID'
  | 'CARRY_EXPIRY_INVALID'
  | 'LEAVE_TRACKING_DATE_INVALID'
  | 'LEAVE_POLICY_EMPTY';

/**
 * Read PATCH /organizations/leave-policy. Every field optional (the old body — only the
 * allowance — still means what it meant); at least one must be present. UP_TO needs a
 * maximum; the other modes clear it.
 */
export function parseLeavePolicy(
  raw: unknown,
): { ok: true; value: LeavePolicyInput } | { ok: false; code: LeavePolicyError } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: LeavePolicyInput = {};
  const has = (k: string) => b[k] !== undefined;
  if (has('defaultLeaveAllowance')) {
    const d = Number(b.defaultLeaveAllowance);
    if (!Number.isInteger(d) || d < 0 || d > 100) return { ok: false, code: 'LEAVE_ALLOWANCE_INVALID' };
    out.defaultLeaveAllowance = d;
  }
  if (has('leaveYearMode')) {
    if (!(LEAVE_YEAR_MODES as readonly unknown[]).includes(b.leaveYearMode))
      return { ok: false, code: 'LEAVE_YEAR_MODE_INVALID' };
    out.leaveYearMode = b.leaveYearMode as LeaveYearMode;
  }
  if (has('carryOverMode')) {
    if (!(CARRY_OVER_MODES as readonly unknown[]).includes(b.carryOverMode))
      return { ok: false, code: 'CARRY_OVER_MODE_INVALID' };
    out.carryOverMode = b.carryOverMode as CarryOverMode;
  }
  if (has('carryOverMaxDays')) {
    if (b.carryOverMaxDays === null) out.carryOverMaxDays = null;
    else {
      const m = Number(b.carryOverMaxDays);
      if (!Number.isInteger(m) || m < 1 || m > 100) return { ok: false, code: 'CARRY_OVER_MAX_INVALID' };
      out.carryOverMaxDays = m;
    }
  }
  if (out.carryOverMode === 'UP_TO' && !out.carryOverMaxDays) return { ok: false, code: 'CARRY_OVER_MAX_INVALID' };
  if (out.carryOverMode && out.carryOverMode !== 'UP_TO') out.carryOverMaxDays = null;
  if (has('carryExpiresAfterMonths')) {
    if (b.carryExpiresAfterMonths === null) out.carryExpiresAfterMonths = null;
    else {
      const m = Number(b.carryExpiresAfterMonths);
      if (!Number.isInteger(m) || m < 1 || m > 24) return { ok: false, code: 'CARRY_EXPIRY_INVALID' };
      out.carryExpiresAfterMonths = m;
    }
  }
  if (has('leaveTrackingStartedOn')) {
    if (b.leaveTrackingStartedOn === null) out.leaveTrackingStartedOn = null;
    else {
      const s = typeof b.leaveTrackingStartedOn === 'string' ? b.leaveTrackingStartedOn.slice(0, 10) : '';
      if (!DAY.test(s) || Number.isNaN(Date.parse(s))) return { ok: false, code: 'LEAVE_TRACKING_DATE_INVALID' };
      out.leaveTrackingStartedOn = s;
    }
  }
  if (!Object.keys(out).length) return { ok: false, code: 'LEAVE_POLICY_EMPTY' };
  return { ok: true, value: out };
}

/* ------------------------------------------------------------------ the request preview */

/**
 * What a leave range costs the balance on screen — only the days inside THAT balance's leave
 * year (a request over the turn of the year draws on each year for its own days). Reads the
 * count's `byLeaveYear` (keyed by leave-year start), falls back to `byYear` from a server before
 * the ledger, then to the whole count.
 */
export function leaveCostInBalanceYear(
  balance: { year: number; leaveYear?: { start: string } | null },
  cost: { counted: number; byYear?: Record<string, number>; byLeaveYear?: Record<string, number> },
): number {
  if (balance.leaveYear && cost.byLeaveYear) return cost.byLeaveYear[balance.leaveYear.start] ?? 0;
  if (cost.byYear) return cost.byYear[String(balance.year)] ?? 0;
  return cost.counted;
}
