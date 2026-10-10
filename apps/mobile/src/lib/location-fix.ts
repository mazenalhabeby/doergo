import * as Location from 'expo-location';

/**
 * ONE way to ask "where is the phone right now" — every one-shot fix in the app.
 *
 * ⚠️ ALWAYS SETTLES. `getCurrentPositionAsync` has no timeout of its own: a
 * phone indoors, in a basement or with location services half-off can leave it
 * pending for minutes, and every spinner waiting on it spins with it. Before
 * this file about half of the call sites raced a timer and the other half
 * (clock-in, the arrival check, "use my location", the route planner) did not.
 * Here the deadline is part of the policy, and the timer is cleared on settle.
 *
 * ⚠️ THE PURPOSE PICKS THE POLICY, not the call site. Accuracy, how long to
 * wait and whether a recent cached position is good enough are decided once per
 * kind of question, so two screens asking the same question cannot drift.
 *
 * ⚠️ PERMISSION IS ASKED ONLY WHEN `ask` IS SET. A screen that merely shows a
 * distance must never pop the system prompt; a button the member pressed may.
 * Without `ask`, a missing permission is a `denied` rejection, never a dialog.
 * The prompt itself is outside the deadline — a person reading it is not a GPS
 * that hung.
 *
 * Background tracking (route, heartbeat, geofence tasks) is NOT one-shot and
 * does not come through here.
 */

export type FixPurpose =
  /** Evidence the server judges: clock-in, arrival / start at a job, a route's first point. Accurate and fresh. */
  | 'evidence'
  /** "Use my location" on a map — the member is waiting with the map open. */
  | 'pick'
  /** A button that must answer quickly: re-plan from here, the route card's fresh fix. */
  | 'tap'
  /** A distance or estimate drawn on a screen. A recent cached position is fine. */
  | 'nearby'
  /** The shift heartbeat: a fresh fix, nobody watching it. */
  | 'heartbeat'
  /** Presence: the OS's cached position only — the GPS radio is never switched on. */
  | 'cached';

export interface FixPolicy {
  accuracy: Location.Accuracy;
  /** The longest the GPS part may take before the call rejects with `timeout`. */
  timeoutMs: number;
  /** A cached position younger than this is used without a fresh fix; null = always fresh. */
  maxAgeMs: number | null;
  /** Never switch the radio on — the cached position or nothing. */
  cacheOnly?: boolean;
}

export const FIX_POLICIES: Record<FixPurpose, FixPolicy> = {
  evidence: { accuracy: Location.Accuracy.High, timeoutMs: 15_000, maxAgeMs: null },
  pick: { accuracy: Location.Accuracy.High, timeoutMs: 10_000, maxAgeMs: null },
  tap: { accuracy: Location.Accuracy.Balanced, timeoutMs: 6_000, maxAgeMs: null },
  nearby: { accuracy: Location.Accuracy.Balanced, timeoutMs: 10_000, maxAgeMs: 5 * 60_000 },
  heartbeat: { accuracy: Location.Accuracy.Balanced, timeoutMs: 15_000, maxAgeMs: null },
  cached: { accuracy: Location.Accuracy.Lowest, timeoutMs: 3_000, maxAgeMs: Number.POSITIVE_INFINITY, cacheOnly: true },
};

export type FixFailure = 'denied' | 'timeout' | 'unavailable';

export class FixError extends Error {
  constructor(readonly reason: FixFailure, message?: string) {
    super(message ?? `location ${reason}`);
    this.name = 'FixError';
  }
}

export interface FixOptions {
  purpose: FixPurpose;
  /** Show the permission prompt when it has not been granted yet. Only from a tap. */
  ask?: boolean;
  /**
   * When no fresh fix comes in time, settle for the last position the OS knows,
   * however old. It carries its OWN timestamp, so the server can tell.
   */
  orLastKnown?: boolean;
}

/** The fix's failure reason, for callers that answer `denied` differently. */
export function fixFailure(err: unknown): FixFailure {
  return err instanceof FixError ? err.reason : 'unavailable';
}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FixError('timeout')), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

async function permitted(ask: boolean): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted || current.status === 'granted') return true;
  if (!ask) return false;
  const asked = await Location.requestForegroundPermissionsAsync();
  return asked.granted || asked.status === 'granted';
}

async function lastKnown(maxAgeMs?: number): Promise<Location.LocationObject | null> {
  try {
    const opts = maxAgeMs !== undefined && Number.isFinite(maxAgeMs) ? { maxAge: maxAgeMs } : undefined;
    return await Location.getLastKnownPositionAsync(opts);
  } catch {
    return null;
  }
}

/**
 * A position for one purpose. Resolves with a fix, or rejects with a
 * `FixError` (`denied` / `timeout` / `unavailable`) — never later than the
 * policy's deadline once permission is settled.
 */
export async function getFix({ purpose, ask = false, orLastKnown = false }: FixOptions): Promise<Location.LocationObject> {
  const policy = FIX_POLICIES[purpose];
  let allowed: boolean;
  try {
    allowed = await permitted(ask);
  } catch {
    throw new FixError('unavailable');
  }
  if (!allowed) throw new FixError('denied');

  const attempt = async (): Promise<Location.LocationObject> => {
    if (policy.maxAgeMs !== null) {
      const cached = await lastKnown(policy.maxAgeMs);
      if (cached) return cached;
      if (policy.cacheOnly) throw new FixError('unavailable');
    }
    const fresh = await Location.getCurrentPositionAsync({ accuracy: policy.accuracy });
    if (!fresh) throw new FixError('unavailable');
    return fresh;
  };

  try {
    return await withDeadline(attempt(), policy.timeoutMs);
  } catch (err) {
    if (orLastKnown) {
      const last = await withDeadline(lastKnown(), 2_000).catch(() => null);
      if (last) return last;
    }
    throw err instanceof FixError ? err : new FixError('unavailable', err instanceof Error ? err.message : undefined);
  }
}

/** The common shape — `{ lat, lng, accuracy }` — for callers that need no more. */
export function fixPoint(loc: Location.LocationObject): { lat: number; lng: number; accuracy?: number } {
  return { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy ?? undefined };
}
