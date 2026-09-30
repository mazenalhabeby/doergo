/**
 * Which GPS points belong on a drawn route.
 *
 * One rule, read by the phone before it keeps a point and by the server before
 * it stores one — so an old app version that skips the phone's filter is still
 * held to it, and the two can never disagree about what a "real" point is.
 *
 * Keeping every point that passes is what draws the real road; dropping the
 * ones below is what stops the line jumping across fields:
 *   - a fix worse than ±50 m (indoors, a garage, the first fix after a tunnel);
 *   - an impossible jump (faster than ~250 km/h from the previous point);
 *   - a time in the future (a wrong clock) or too old to be this trip.
 */

import { haversineDistance } from '../utils/geofence';

/** A point is kept only when its accuracy radius is at most this. */
export const ROUTE_MAX_ACCURACY_M = 50;
/** ~250 km/h. Faster than that between two points is a GPS jump, not a drive. */
export const ROUTE_MAX_SPEED_MPS = 70;
/** Tolerance for a phone clock running ahead of the server's. */
export const ROUTE_MAX_FUTURE_MS = 2 * 60 * 1000;
/** Points older than this are not a live trip (the phone keeps them 48 h). */
export const ROUTE_MAX_AGE_MS = 72 * 60 * 60 * 1000;

export interface RoutePoint {
  lat: number;
  lng: number;
  accuracy?: number | null;
  /** ISO time the phone captured it. */
  timestamp?: string | null;
}

function validCoord(p: RoutePoint): boolean {
  return (
    typeof p.lat === 'number' && typeof p.lng === 'number' &&
    Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
    p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180 &&
    !(p.lat === 0 && p.lng === 0)
  );
}

/**
 * Keep the points worth drawing, in time order.
 *
 * `previous` is the last point already accepted for this trip (from the device
 * or the database), so a jump is judged across batches too. Points without a
 * timestamp are kept in the order given (older app versions), minus the speed
 * check, which needs a time.
 */
export function cleanRoutePoints<T extends RoutePoint>(
  points: readonly T[],
  opts: { now?: number; previous?: RoutePoint | null } = {},
): T[] {
  const now = opts.now ?? Date.now();
  const timeOf = (p: RoutePoint) => (p.timestamp ? Date.parse(p.timestamp) : NaN);

  const candidates = points
    .filter(validCoord)
    .filter((p) => p.accuracy == null || (Number.isFinite(p.accuracy) && p.accuracy >= 0 && p.accuracy <= ROUTE_MAX_ACCURACY_M))
    .filter((p) => {
      const t = timeOf(p);
      if (Number.isNaN(t)) return true;
      return t <= now + ROUTE_MAX_FUTURE_MS && t >= now - ROUTE_MAX_AGE_MS;
    })
    .map((p, i) => ({ p, i, t: timeOf(p) }))
    .sort((a, b) => (Number.isNaN(a.t) || Number.isNaN(b.t) ? a.i - b.i : a.t - b.t || a.i - b.i));

  const out: T[] = [];
  let last: RoutePoint | null = opts.previous ?? null;
  for (const { p, t } of candidates) {
    const lastT = last ? timeOf(last) : NaN;
    if (last && !Number.isNaN(t) && !Number.isNaN(lastT)) {
      const seconds = (t - lastT) / 1000;
      if (seconds <= 0) {
        if (t === lastT) continue; // the same fix sent twice
      } else if (haversineDistance(last.lat, last.lng, p.lat, p.lng) / seconds > ROUTE_MAX_SPEED_MPS) {
        continue; // a jump, not a drive
      }
    }
    out.push(p);
    last = p;
  }
  return out;
}
