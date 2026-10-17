/** Moved here unchanged from leave-ledger.ts. */
import { MANUAL_ADJUSTMENT_KINDS, half, isLeaveAdjustmentKind, type LeaveAdjustmentKind } from './ledger-years';

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

const ORDER: LeaveBalanceLine['key'][] = [
  'ALLOWANCE',
  'OPENING_USED',
  'CARRY_OVER',
  'CARRY_EXPIRED',
  'GRANT',
  'CORRECTION',
  'TAKEN',
];

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
    const days = k === 'ALLOWANCE' ? input.allowance : k === 'TAKEN' ? -input.taken : (byKind.get(k) ?? 0);
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
  if (!isLeaveAdjustmentKind(b.kind) || !MANUAL_ADJUSTMENT_KINDS.includes(b.kind))
    return { ok: false, code: 'ADJUSTMENT_KIND_INVALID' };
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
  if ((b.kind === 'CORRECTION' || b.kind === 'GRANT') && !reason)
    return { ok: false, code: 'ADJUSTMENT_REASON_REQUIRED' };
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
export function parseOpeningBalances(text: string): {
  rows: OpeningBalanceRow[];
  errors: { line: number; text: string }[];
} {
  const rows: OpeningBalanceRow[] = [];
  const errors: { line: number; text: string }[] = [];
  const num = (s: string | undefined) => (s == null || s.trim() === '' ? 0 : Number(s.trim().replace(',', '.')));
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line) return;
    const cells = line.includes('\t') ? line.split('\t') : line.includes(';') ? line.split(';') : line.split(',');
    const [person, usedS, carriedS] = cells.map((c) => c.trim());
    const used = num(usedS),
      carried = num(carriedS);
    if (!person) return;
    if (i === 0 && (Number.isNaN(used) || Number.isNaN(carried))) return; // a header row
    if (
      !Number.isFinite(used) ||
      !Number.isFinite(carried) ||
      used < 0 ||
      carried < 0 ||
      used > 366 ||
      carried > 366 ||
      half(used) !== used ||
      half(carried) !== carried
    ) {
      errors.push({ line: i + 1, text: rawLine });
      return;
    }
    rows.push({ line: i + 1, person, used, carried });
  });
  return { rows, errors };
}
