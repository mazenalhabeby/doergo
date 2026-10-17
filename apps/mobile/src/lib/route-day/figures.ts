/** The next leg, the day's figures, the main action and progress (moved here unchanged) */
import {
  decodePolyline,
  haversineDistance,
  stopsAheadOf,
  supportsMultiStop,
  type LatLng,
  type NavApp,
  type OptimizedRoute,
} from '@hbcfield/shared/client';
import { AT_START_METRES, finite, isLatLng, isStraightLine, roadEstimate, type DayStop } from './stops';

/**
 * How far to the NEXT stop, and whether that is a measured leg or an estimate.
 *
 * The plan's leg is believed — except the leg out of the plan's START when the
 * driver is no longer there: that leg measures a drive from a place they left
 * (or never were), so the distance is estimated from where they are instead.
 * No leg at all (a stop added after the plan) is estimated the same way.
 */
export function legToNext(plan: OptimizedRoute | null, next: DayStop | undefined, position: LatLng | null) {
  if (!next) return null;
  const here = isLatLng(position) ? position : null;
  const leg = legInto(plan, next.id);
  const from = leg ? plan!.waypoints[leg.fromIndex] : undefined;
  const leftStart = !!leg && !!here && !from?.stopId && !!from && isLatLng(from)
    && haversineDistance(from.lat, from.lng, here.lat, here.lng) > AT_START_METRES;
  if (leg && !leftStart) return { meters: leg.meters, seconds: leg.seconds as number | null, estimated: false };
  if (!here) return leg ? { meters: leg.meters, seconds: leg.seconds as number | null, estimated: false } : null;
  return { meters: roadEstimate(here, next), seconds: null as number | null, estimated: true };
}

/**
 * The card's figures, from the plan and where the driver has got to.
 *
 * ⚠️ `backBy` is only ever a promise the data can keep: anchored to the FIRST
 * stop's booked time (FINDINGS §7), and never on a straight-line plan, whose
 * seconds are "a rough time … never a promise".
 *
 * `position` (optional) replaces the leg into the next stop when that leg
 * starts at a plan start the driver has left (`legToNext`); `estimated` then
 * says the total is not a road figure.
 */
export function routeFigures(
  plan: OptimizedRoute | null,
  ordered: readonly DayStop[],
  ahead: readonly DayStop[],
  position: LatLng | null = null,
) {
  if (!plan) return { left: ahead.length, metresToGo: null as number | null, backBy: null as Date | null, estimated: false };
  // Legs arrive at waypoint i; waypoint 0 is the start. Sum the legs INTO the stops still ahead, plus any leg home.
  const aheadIds = new Set(ahead.map((s) => s.id));
  const idxOf = new Map(plan.waypoints.map((w, i) => [w.stopId, i] as const));
  const next = ahead[0];
  const nextLeg = legToNext(plan, next, position);
  let metresToGo = 0;
  let counted = false;
  for (const leg of plan.legs) {
    const to = plan.waypoints[leg.toIndex];
    if (to?.stopId && to.stopId === next?.id && nextLeg) { metresToGo += nextLeg.meters; counted = true; continue; }
    if (!to?.stopId || aheadIds.has(to.stopId)) metresToGo += finite(leg.meters) ? leg.meters : 0;
  }
  // The next stop has no leg in the plan (a stop added after it): its estimate still counts.
  if (next && nextLeg && !counted && nextLeg.estimated) metresToGo += nextLeg.meters;
  let backBy: Date | null = null;
  const first = ordered[0];
  if (!isStraightLine(plan) && first?.at && finite(plan.totalSeconds)) {
    const firstIdx = idxOf.get(first.id);
    const firstLeg = plan.legs.find((l) => l.toIndex === firstIdx);
    const depart = new Date(first.at).getTime() - (firstLeg?.seconds ?? 0) * 1000;
    // A job booked at midnight carries no hour — no promise from it.
    if (new Date(first.at).getHours() !== 0 || new Date(first.at).getMinutes() !== 0) backBy = new Date(depart + plan.totalSeconds * 1000);
    if (backBy && !Number.isFinite(backBy.getTime())) backBy = null;
  }
  return { left: ahead.length, metresToGo, backBy, estimated: !!nextLeg?.estimated };
}

/** How far from here to one stop, in metres (straight), for the next-stop line when no leg is known. */
export const metresTo = (from: LatLng | null, to: LatLng) => (from ? haversineDistance(from.lat, from.lng, to.lat, to.lng) : null);

/** The leg that ARRIVES at a stop, if the plan has one. */
export function legInto(plan: OptimizedRoute | null, stopId: string) {
  if (!plan) return null;
  const i = plan.waypoints.findIndex((w) => w.stopId === stopId);
  return i < 0 ? null : plan.legs.find((l) => l.toIndex === i) ?? null;
}

/** The big button — SPEC §5. Only Google takes several stops; the label must not promise the others what they cannot do. */
type PrimaryVerb = { kind: 'driveTo'; stop: DayStop } | { kind: 'continue' } | { kind: 'start' };

export function primaryVerb(app: NavApp, doneCount: number, next: DayStop | undefined): PrimaryVerb | null {
  if (!next) return null;
  if (!supportsMultiStop(app)) return { kind: 'driveTo', stop: next };
  return doneCount > 0 ? { kind: 'continue' } : { kind: 'start' };
}

/** What is still to drive, and what is behind — one rule for the card, the planner and the button. */
export function progress(ordered: readonly DayStop[], position: LatLng | null, arrived: ReadonlySet<string>) {
  const ahead = stopsAheadOf(position, [...ordered], arrived);
  const aheadIds = new Set(ahead.map((s) => s.id));
  const done = ordered.filter((s) => !aheadIds.has(s.id));
  return { ahead, done };
}

/* ═══════════════════════════════ the drawing ═══════════════════════════════ */

/** The route's line as [lng, lat] points: the road geometry when an engine gave one, else nothing (pins only). */
export function routeLine(plan: OptimizedRoute | null): [number, number][] {
  if (!plan || isStraightLine(plan)) return [];
  const g = plan.geometry as { coordinates?: unknown } | string | undefined;
  const raw: unknown = typeof g === 'string' ? decodePolyline(g) : g?.coordinates;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is [number, number] =>
    Array.isArray(c) && isLatLng({ lng: c[0], lat: c[1] }));
}

/**
 * ⚠️ BOUNDED. A road line from a routing engine can hold thousands of points;
 * a 330 × 126 drawing cannot show more than a few hundred. Keep every Nth, the
 * ends always kept, so the path is cheap to draw and to diff.
 */
export function thin<T>(points: readonly T[], max = 240): T[] {
  if (points.length <= max) return [...points];
  // Fewer than two kept cannot keep both ends (and max 1 divided by zero into `[undefined]`).
  if (!(max >= 2)) return max >= 1 ? [points[0]!] : [];
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]!);
}
