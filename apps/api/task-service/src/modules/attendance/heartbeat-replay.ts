/**
 * Location check-ins that arrive late, replayed in the order they were taken.
 *
 * A phone without signal keeps its check-ins and sends them together when it
 * reconnects. Fed to the live logic one by one they would be judged as if each
 * were happening now: a point from 09:10 outside the ring would open an
 * excursion at 11:40 and tell a supervisor somebody "has left the site", when
 * they came back at 09:25 and have been inside for two hours.
 *
 * So the points become PERIODS first. A period that ended before the last point
 * is history — recorded with its real times, told to nobody. Only a period
 * still open at a point recent enough to describe the present is treated like a
 * live one. Pure, so every case below is a test.
 */

export interface RingReading {
  at: Date;
  /** Inside the ring (a return counts the moment this is true). */
  inside: boolean;
  /** Clearly outside: past the hysteresis buffer (a departure needs this). */
  outPastBuffer: boolean;
  distanceM: number;
}

export interface OutsidePeriod {
  leftAt: Date;
  /** Null: still outside at the last reading. */
  backAt: Date | null;
  /** Furthest distance seen while out — the approver's context. */
  maxDistanceM: number;
  /** This period continues an excursion that was already open before the batch. */
  continuesOpen: boolean;
}

/** How old the last reading may be and still stand for "now". */
export const LATE_POINT_FRESH_MS = 20 * 60 * 1000;

export function replayRing(readings: readonly RingReading[], startsOutsideSince: Date | null): OutsidePeriod[] {
  const sorted = [...readings].sort((a, b) => a.at.getTime() - b.at.getTime());
  const periods: OutsidePeriod[] = [];
  let open: OutsidePeriod | null = startsOutsideSince
    ? { leftAt: startsOutsideSince, backAt: null, maxDistanceM: 0, continuesOpen: true }
    : null;

  for (const r of sorted) {
    if (open) {
      if (r.inside) {
        open.backAt = r.at;
        periods.push(open);
        open = null;
      } else {
        open.maxDistanceM = Math.max(open.maxDistanceM, r.distanceM);
      }
    } else if (r.outPastBuffer) {
      open = { leftAt: r.at, backAt: null, maxDistanceM: r.distanceM, continuesOpen: false };
    }
  }
  if (open) periods.push(open);
  return periods;
}

/** Does the newest reading describe the present? */
export function lastReadingIsFresh(readings: readonly RingReading[], now: Date): boolean {
  if (readings.length === 0) return false;
  const newest = Math.max(...readings.map((r) => r.at.getTime()));
  return now.getTime() - newest <= LATE_POINT_FRESH_MS;
}
