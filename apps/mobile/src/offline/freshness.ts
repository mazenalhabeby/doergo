/**
 * How old what the member is looking at is.
 *
 * A screen read from the phone must say when it was last brought up to date —
 * quietly while that is recent, plainly once it is not. It is never blanked for
 * being old: yesterday's job list is still the best list there is in a basement.
 */

/** Past this, the time turns into an age and turns amber. */
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;
/** Past this without a sync, the banner says so. */
export const LONG_OFFLINE_MS = 3 * 24 * 60 * 60 * 1000;

export type Freshness =
  | { kind: 'never' }
  /** Recent: shown as the clock time it was updated. */
  | { kind: 'at'; at: number; stale: false }
  /** Old: shown as an age, in hours or days. */
  | { kind: 'age'; unit: 'hours' | 'days'; value: number; stale: true; longOffline: boolean };

export function freshnessOf(at: number | null | undefined, now: number): Freshness {
  if (!at) return { kind: 'never' };
  const age = Math.max(0, now - at);
  if (age < STALE_AFTER_MS) return { kind: 'at', at, stale: false };
  const hours = Math.floor(age / 3_600_000);
  return hours < 48
    ? { kind: 'age', unit: 'hours', value: hours, stale: true, longOffline: age >= LONG_OFFLINE_MS }
    : { kind: 'age', unit: 'days', value: Math.floor(hours / 24), stale: true, longOffline: age >= LONG_OFFLINE_MS };
}

/** The newest of several "last updated" moments, ignoring the ones that never happened. */
export function newest(...moments: (number | null | undefined)[]): number | null {
  const known = moments.filter((m): m is number => typeof m === 'number' && m > 0);
  return known.length ? Math.max(...known) : null;
}
