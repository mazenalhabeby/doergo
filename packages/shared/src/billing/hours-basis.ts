import { expectedPaidMinutes } from '../attendance/counted-time';

/**
 * Which hours of a person's day go on a CLIENT's invoice — chosen per person in
 * a workspace (`SpaceAssignment.hoursBasis`, null = COUNTED).
 *
 * - COUNTED: the clock-in inside the shift, less unpaid rests — the timesheet's
 *   figure, and what every invoice used before this choice existed.
 * - CLOCKED: clock-in to clock-out, less unpaid rests. An early start and a late
 *   finish count.
 * - SHIFT:   the planned shift, less unpaid rests, on each day the person
 *   clocked in — nothing else. A late arrival is not taken off, and overtime
 *   is not added (that is what COUNTED and CLOCKED are for). A day with no
 *   shift planned falls back to COUNTED, and says so.
 *
 * ⚠️ Approving overtime MOVES `expectedClockOutAt`, so that column alone is the
 * shift PLUS its overtime. The planned end is the earliest of: that column, the
 * planned start + the shift's own length, and where the first approved round
 * began (`overtimeStartAt`).
 *
 * ⚠️ ONLY WHAT THE CLIENT IS CHARGED. The worker's statement and the margin's
 * cost stay on counted time — that is what is owed to the person. Billing a
 * client by the shift does not mean paying the person for minutes they did not
 * work, nor the other way round.
 *
 * ⚠️ Saved on the invoice line (`InvoiceItem.hoursBasis`), so changing the
 * setting later never moves an invoice already drawn up.
 */
export const HOURS_BASES = ['COUNTED', 'CLOCKED', 'SHIFT'] as const;
export type HoursBasis = (typeof HOURS_BASES)[number];

export function isHoursBasis(v: unknown): v is HoursBasis {
  return typeof v === 'string' && (HOURS_BASES as readonly string[]).includes(v);
}

/** The basis in force: what is set, or COUNTED. */
export function effectiveHoursBasis(v: unknown): HoursBasis {
  return isHoursBasis(v) ? v : 'COUNTED';
}

const MIN = 60_000;

/** One clock-in, with the columns each basis reads. */
export interface ClockInForHours {
  clockInAt: Date;
  clockOutAt?: Date | null;
  paidMinutes?: number | null;
  totalMinutes?: number | null;
  unpaidBreakMinutes?: number | null;
  expectedClockInAt?: Date | null;
  expectedClockOutAt?: Date | null;
  /** The shift's own length in minutes (start→end, before any overtime), when known. */
  shiftLengthMinutes?: number | null;
  /** Where the first approved overtime round began — the shift's end before it moved. */
  overtimeStartAt?: Date | null;
}

/** "06:00"→"18:00" = 720; crossing midnight wraps ("22:00"→"06:00" = 480). Null on a bad time. */
export function shiftLengthMinutes(startLocal: string, endLocal: string): number | null {
  const m = (t: string) => {
    const r = /^(\d{1,2}):(\d{2})$/.exec(t ?? '');
    return r ? Number(r[1]) * 60 + Number(r[2]) : null;
  };
  const a = m(startLocal);
  const b = m(endLocal);
  if (a == null || b == null) return null;
  const d = b - a;
  return d > 0 ? d : d + 24 * 60;
}

/** The shift's planned end WITHOUT any approved overtime (see SHIFT above). */
export function plannedShiftEnd(e: ClockInForHours): Date | null {
  const ends: number[] = [];
  if (e.expectedClockOutAt) ends.push(e.expectedClockOutAt.getTime());
  if (e.expectedClockInAt && e.shiftLengthMinutes != null && e.shiftLengthMinutes > 0) {
    ends.push(e.expectedClockInAt.getTime() + e.shiftLengthMinutes * MIN);
  }
  if (e.overtimeStartAt) ends.push(e.overtimeStartAt.getTime());
  return ends.length ? new Date(Math.min(...ends)) : null;
}


/** Counted minutes of one clock-in — the timesheet's figure. */
export function countedMinutesOf(e: ClockInForHours): number {
  if (e.paidMinutes != null) return Math.max(0, e.paidMinutes);
  if (e.totalMinutes != null) return Math.max(0, e.totalMinutes);
  return e.clockOutAt ? Math.max(0, Math.round((e.clockOutAt.getTime() - e.clockInAt.getTime()) / MIN)) : 0;
}

/**
 * Minutes of one clock-in, by a basis. `fellBack` is true when SHIFT was asked
 * for and the day had no planned shift, so counted time was used instead.
 *
 * ⚠️ A clock-in still running is its counted time under every basis: billing a
 * planned shift that has not been worked yet would charge for the future.
 */
export function minutesByBasis(e: ClockInForHours, basis: HoursBasis): { minutes: number; fellBack: boolean } {
  const counted = countedMinutesOf(e);
  if (basis === 'COUNTED' || !e.clockOutAt) return { minutes: counted, fellBack: false };
  const unpaid = Math.max(0, Math.round(e.unpaidBreakMinutes ?? 0));
  if (basis === 'CLOCKED') {
    return { minutes: Math.max(0, Math.round((e.clockOutAt.getTime() - e.clockInAt.getTime()) / MIN) - unpaid), fellBack: false };
  }
  const shift = expectedPaidMinutes({ expectedStartAt: e.expectedClockInAt, expectedEndAt: plannedShiftEnd(e), unpaidBreakMinutes: unpaid });
  return shift == null ? { minutes: counted, fellBack: true } : { minutes: shift, fellBack: false };
}
