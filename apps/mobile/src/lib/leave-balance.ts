import {
  LEAVE_ADJUSTMENT_KINDS,
  isLeaveYearMode,
  type LeaveBalanceLine,
  type LeaveYear,
} from '@hbcfield/shared/client';

/**
 * THE MEMBER'S VACATION BALANCE, AS THE PHONE READS IT.
 *
 * The server builds the balance as a sum of visible lines (shared
 * leave/leave-ledger.ts — allowance, used before HBCField, carried, expired,
 * granted, corrected, taken). This file never re-computes any of it: it reads
 * the answer, keeps what it can trust, and turns the lines into rows to draw.
 *
 * An older server answers only `{ year, allowance, taken, pending, remaining }`
 * — then `lines` is null and the screen shows what it showed before (the
 * "before → after" figure alone), never a breakdown guessed from two numbers.
 */
export interface MemberLeaveBalance {
  year: number;
  allowance: number;
  taken: number;
  pending: number;
  remaining: number;
  /** Null from an older server. */
  leaveYear: LeaveYear | null;
  /** In display order, as the server sent them. Null from an older server. */
  lines: LeaveBalanceLine[] | null;
  /** Last day carried days may be used (YYYY-MM-DD), or null. */
  carryExpiresOn: string | null;
}

const LINE_KEYS: ReadonlySet<string> = new Set(['ALLOWANCE', 'TAKEN', ...LEAVE_ADJUSTMENT_KINDS]);
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The server's answer → a balance, or null when it is not one. Unknown line keys are dropped. */
export function readLeaveBalance(raw: unknown): MemberLeaveBalance | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const remaining = num(r.remaining);
  if (remaining === null) return null;
  const ly = r.leaveYear as Record<string, unknown> | null | undefined;
  const leaveYear: LeaveYear | null = ly && isDay(ly.start) && isDay(ly.end) && isLeaveYearMode(ly.mode)
    ? { start: ly.start.slice(0, 10), end: ly.end.slice(0, 10), mode: ly.mode }
    : null;
  const lines = Array.isArray(r.lines)
    ? (r.lines as unknown[]).flatMap((l) => {
      const o = (l ?? {}) as Record<string, unknown>;
      const days = num(o.days);
      return typeof o.key === 'string' && LINE_KEYS.has(o.key) && days !== null ? [{ key: o.key as LeaveBalanceLine['key'], days }] : [];
    })
    : null;
  return {
    year: num(r.year) ?? new Date().getFullYear(),
    allowance: num(r.allowance) ?? 0,
    taken: num(r.taken) ?? 0,
    pending: num(r.pending) ?? 0,
    remaining,
    leaveYear,
    lines: lines && lines.length > 0 ? lines : null,
    carryExpiresOn: isDay(r.carryExpiresOn) ? r.carryExpiresOn.slice(0, 10) : null,
  };
}

export interface BalanceRow {
  key: LeaveBalanceLine['key'];
  /** i18n key of the row's name. */
  labelKey: string;
  days: number;
  /** "25", "−10", "+2" — the allowance unsigned, every change signed. */
  value: string;
}

/** A true minus sign, so "−3" lines up with "+2" and is not read as a hyphen. */
const MINUS = '−';

/** Signed days for a ledger line: "+2", "−3", "0". */
export function signedDays(n: number, format: (n: number) => string = String): string {
  if (n > 0) return `+${format(n)}`;
  if (n < 0) return `${MINUS}${format(-n)}`;
  return format(0);
}

/** The ledger lines → rows to draw. Null when the server sent no lines (older server). */
export function balanceRows(balance: MemberLeaveBalance | null | undefined, format: (n: number) => string = String): BalanceRow[] | null {
  if (!balance?.lines) return null;
  return balance.lines.map((l) => ({
    key: l.key,
    labelKey: `requests.ledger.line.${l.key}`,
    days: l.days,
    value: l.key === 'ALLOWANCE' ? format(l.days) : signedDays(l.days, format),
  }));
}

/**
 * Which leave year the figures are for: "Leave year 2026", or — counted from
 * the member's employment anniversary — "Work year 15 Apr – 14 Apr".
 * `day` formats a YYYY-MM-DD for the screen.
 */
export function leaveYearLabel(
  balance: MemberLeaveBalance | null | undefined,
  day: (key: string) => string,
): { key: string; values: Record<string, string> } | null {
  const y = balance?.leaveYear;
  if (!y) return null;
  if (y.mode === 'WORK_YEAR') return { key: 'requests.ledger.yearWork', values: { from: day(y.start), to: day(y.end) } };
  return { key: 'requests.ledger.yearCalendar', values: { year: y.start.slice(0, 4) } };
}

/**
 * "2 carried days can be used until 31 Mar" — only while that day is still
 * ahead (or today) and nothing has expired yet; once the rule has run, the
 * CARRY_EXPIRED line says it instead.
 */
export function carryNote(balance: MemberLeaveBalance | null | undefined, today: string): { count: number; date: string } | null {
  if (!balance?.lines || !balance.carryExpiresOn || balance.carryExpiresOn < today) return null;
  if (balance.lines.some((l) => l.key === 'CARRY_EXPIRED')) return null;
  const carried = balance.lines.find((l) => l.key === 'CARRY_OVER')?.days ?? 0;
  return carried > 0 ? { count: carried, date: balance.carryExpiresOn } : null;
}
