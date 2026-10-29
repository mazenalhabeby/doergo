/**
 * Custody by the DAY — what a receipt is dated with.
 *
 * A receipt carries a day, not a moment: a past day is filed as its local noon
 * (`assetEntryOccurredAt`) and today as "now". Asking custody of that instant
 * refused a driver who handed the van over at 09:00 for the 08:00 fuel he
 * filed that evening, and gave his slip to whoever held the van at noon.
 *
 * ⚠️ DECISION (2026-10-29): a receipt for a day counts if the person held the
 * asset at ANY moment of that local day — the gate asks `heldDuringDay`, and
 * the attribution below gives the cost to the same person, so a slip that was
 * allowed because Ahmed had the van that morning is never charged to Bea.
 *
 * The day is read in the asset's workspace zone (workspace → organization →
 * UTC); a client without a zone reads UTC, the same default as the server.
 *
 * Pure: the server, the web ledger and the phone decide the same thing.
 */

import { addDaysStr, localPartsIn, zonedWallTimeToUtc } from '../../attendance/zoned-time';
import { zoneOf } from '../../utils/workspace-zone';

/** The period fields this module reads (structural, so periods.ts can import it without a loop). */
interface CustodyPeriod {
  userId?: string | null;
  startedAt: Date | string;
  endedAt?: Date | string | null;
}

const ms = (v: Date | string | null | undefined): number =>
  v == null ? Number.NaN : (v instanceof Date ? v : new Date(v)).getTime();

/** The local day `when` falls on, as the half-open instant range [from, to). */
export function custodyDayWindow(when: Date | string, timeZone?: string | null): { from: Date; to: Date } {
  const at = when instanceof Date ? when : new Date(when);
  const tz = zoneOf(timeZone);
  try {
    const day = localPartsIn(at, tz).dateStr;
    return { from: zonedWallTimeToUtc(day, 0, 0, tz), to: zonedWallTimeToUtc(addDaysStr(day, 1), 0, 0, tz) };
  } catch {
    // An unknown zone reads as UTC — never a refusal of the receipt.
    const day = at.toISOString().slice(0, 10);
    return { from: new Date(`${day}T00:00:00.000Z`), to: new Date(`${addDaysStr(day, 1)}T00:00:00.000Z`) };
  }
}

/** How long a period overlaps [from, to), in ms (0 = not at all). */
export function overlapMs(period: CustodyPeriod, from: Date, to: Date): number {
  const start = Math.max(ms(period.startedAt), from.getTime());
  const end = Math.min(period.endedAt == null ? Number.POSITIVE_INFINITY : ms(period.endedAt), to.getTime());
  return Number.isNaN(start) || Number.isNaN(end) || end <= start ? 0 : end - start;
}

/** Did this member hold it at any moment of the local day `when` falls on? The expense gate's question. */
export function heldDuringDay(
  periods: CustodyPeriod[],
  userId: string,
  when: Date | string,
  timeZone?: string | null,
): boolean {
  const { from, to } = custodyDayWindow(when, timeZone);
  return periods.some((p) => p.userId === userId && overlapMs(p, from, to) > 0);
}

const byStart = (a: CustodyPeriod, b: CustodyPeriod) => ms(a.startedAt) - ms(b.startedAt);

/**
 * Whose cost is this entry — THE attribution rule, in order:
 *
 * 1. The AUTHOR, if they held it at any moment of the entry's day (the same
 *    test the gate let them file on) — their period covering the instant, else
 *    their earliest period that day.
 * 2. Else whoever held it at the entry's instant (the earliest, when several).
 * 3. Else whoever held it LONGEST that day (an office entry dated noon on a
 *    day the van went back at 10:00 is still that driver's).
 * 4. Else nobody — `unattributed`, which is information, not an error.
 */
export function entryHolder<P extends CustodyPeriod>(
  entry: { occurredAt: Date | string; authorId?: string | null },
  periods: P[],
  timeZone?: string | null,
): P | null {
  const t = ms(entry.occurredAt);
  if (Number.isNaN(t)) return null;
  const { from, to } = custodyDayWindow(entry.occurredAt, timeZone);
  const sameDay = periods.filter((p) => overlapMs(p, from, to) > 0).sort(byStart);
  const atInstant = sameDay.filter((p) => ms(p.startedAt) <= t && (p.endedAt == null || t < ms(p.endedAt)));

  if (entry.authorId) {
    const mine = sameDay.filter((p) => p.userId === entry.authorId);
    const hit = mine.find((p) => atInstant.includes(p)) ?? mine[0];
    if (hit) return hit;
  }
  if (atInstant[0]) return atInstant[0];
  let best: P | null = null;
  let bestMs = 0;
  for (const p of sameDay) {
    const o = overlapMs(p, from, to);
    if (o > bestMs) [best, bestMs] = [p, o];
  }
  return best;
}
