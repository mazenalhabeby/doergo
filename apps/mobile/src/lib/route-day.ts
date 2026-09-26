import {
  decodePolyline, haversineDistance, stopsAheadOf, supportsMultiStop,
  type LatLng, type NavApp, type OptimizedRoute, type RouteStop,
} from '@hbcfield/shared/client';
import { hasArrived, isMyRouteStop } from './my-route';
import type { Task } from './api';

/**
 * ⭐ THE DRIVING DAY — pure rules shared by the home's Today's route card and
 * the route planner. No React, no storage, no network: everything here is a
 * function of the jobs, the saved plan and where the phone is.
 * `docs/design/my-route/DATA.md`.
 */

/** A route stop with what the card shows about it. */
export interface DayStop extends RouteStop {
  /** Booked time (dueDate), or null when the job has none. */
  at: string | null;
  /** When the driver arrived (the record), or null. */
  arrivedAt: string | null;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
/** ⚠️ A coordinate is data from the server — never trusted into a URL or a drawing unless it is a real place. */
export const isLatLng = (p: { lat?: unknown; lng?: unknown } | null | undefined): p is LatLng =>
  !!p && finite(p.lat) && finite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

/**
 * My jobs to drive to, in BOOKED order (the order before a plan exists).
 * ⚠️ The SAME set the route planner routes (`isMyRouteStop`) — a plan made
 * there is restored here, and it only restores for the stops it was made for.
 */
export function dayStops(tasks: readonly Task[], userId: string | null | undefined): DayStop[] {
  return tasks
    .filter((t) => isMyRouteStop(t, userId) && isLatLng({ lat: t.locationLat, lng: t.locationLng }))
    .map((t) => ({
      id: t.id,
      lat: t.locationLat as number,
      lng: t.locationLng as number,
      label: t.title,
      address: t.locationAddress ?? undefined,
      at: t.dueDate ?? null,
      arrivedAt: (t as { routeEndedAt?: string | null }).routeEndedAt ?? null,
    }))
    .sort((a, b) => (a.at ?? '9').localeCompare(b.at ?? '9'));
}

/** Jobs already arrived at, by the record (En Route → Arrived). */
export const arrivedIdsOf = (tasks: readonly Task[]): Set<string> => new Set(tasks.filter(hasArrived).map((t) => t.id));

/** Stops of today that the plan does not know — added after it was made. Never dropped from view. */
export function notInPlan(plan: OptimizedRoute | null, stops: readonly DayStop[]): DayStop[] {
  if (!plan) return [];
  const planned = new Set(plan.order);
  return stops.filter((s) => !planned.has(s.id));
}

/** The stops in the plan's order; a plan naming a stop that is gone is no plan (restoreRoute already refuses it). */
export function inPlanOrder(plan: OptimizedRoute | null, stops: readonly DayStop[]): DayStop[] {
  if (!plan) return [];
  const by = new Map(stops.map((s) => [s.id, s]));
  return plan.order.map((id) => by.get(id)).filter((s): s is DayStop => !!s);
}

export type RouteState = 'none' | 'noLocation' | 'notPlanned' | 'finished' | 'midRoute' | 'startOfDay';

/** DATA.md §2 — the order matters. `straight` (no road data) is a modifier, not a state. */
export function routeState(input: {
  stops: readonly DayStop[]; plan: OptimizedRoute | null; start: LatLng | null; ahead: readonly DayStop[]; doneCount: number;
}): RouteState {
  if (input.stops.length === 0) return 'none';
  if (!input.plan && !input.start) return 'noLocation';
  if (!input.plan) return 'notPlanned';
  if (input.ahead.length === 0) return 'finished';
  return input.doneCount > 0 ? 'midRoute' : 'startOfDay';
}

export const isStraightLine = (plan: OptimizedRoute | null) => plan?.engine === 'nearest-neighbour';

/**
 * The card's figures, from the plan and where the driver has got to.
 *
 * ⚠️ `backBy` is only ever a promise the data can keep: anchored to the FIRST
 * stop's booked time (FINDINGS §7), and never on a straight-line plan, whose
 * seconds are "a rough time … never a promise".
 */
export function routeFigures(plan: OptimizedRoute | null, ordered: readonly DayStop[], ahead: readonly DayStop[]) {
  if (!plan) return { left: ahead.length, metresToGo: null as number | null, backBy: null as Date | null };
  // Legs arrive at waypoint i; waypoint 0 is the start. Sum the legs INTO the stops still ahead, plus any leg home.
  const aheadIds = new Set(ahead.map((s) => s.id));
  const idxOf = new Map(plan.waypoints.map((w, i) => [w.stopId, i] as const));
  let metresToGo = 0;
  for (const leg of plan.legs) {
    const to = plan.waypoints[leg.toIndex];
    if (!to?.stopId || aheadIds.has(to.stopId)) metresToGo += leg.meters;
  }
  let backBy: Date | null = null;
  const first = ordered[0];
  if (!isStraightLine(plan) && first?.at && finite(plan.totalSeconds)) {
    const firstIdx = idxOf.get(first.id);
    const firstLeg = plan.legs.find((l) => l.toIndex === firstIdx);
    const depart = new Date(first.at).getTime() - (firstLeg?.seconds ?? 0) * 1000;
    // A job booked at midnight carries no hour — no promise from it.
    if (new Date(first.at).getHours() !== 0 || new Date(first.at).getMinutes() !== 0) backBy = new Date(depart + plan.totalSeconds * 1000);
  }
  return { left: ahead.length, metresToGo, backBy };
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
export type PrimaryVerb = { kind: 'driveTo'; stop: DayStop } | { kind: 'continue' } | { kind: 'start' };
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
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]!);
}

export interface Projection { x: (p: LatLng) => number; y: (p: LatLng) => number }

/**
 * Fit a set of places into a box, keeping their true shape.
 *
 * Longitude shrinks towards the poles, so a degree of lng is scaled by
 * cos(latitude) — without it a route across Vienna is drawn half again too
 * wide. One scale for both axes (the smaller), centred: a day in one street
 * and a day across a region both fill the card, neither is stretched.
 */
export function fitProjection(points: readonly LatLng[], width: number, height: number, pad: number): Projection | null {
  const ps = points.filter(isLatLng);
  if (!ps.length) return null;
  const midLat = ps.reduce((a, p) => a + p.lat, 0) / ps.length;
  const k = Math.cos((midLat * Math.PI) / 180);
  const xs = ps.map((p) => p.lng * k), ys = ps.map((p) => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
  const s = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const ox = (width - spanX * s) / 2 - minX * s, oy = (height - spanY * s) / 2 - minY * s;
  return { x: (p) => p.lng * k * s + ox, y: (p) => -p.lat * s + oy };
}

/** An SVG path through points, rounded to a tenth of a point (shorter strings, identical picture). */
export function svgPath(points: readonly LatLng[], proj: Projection): string {
  let d = '';
  points.forEach((p, i) => { d += `${i ? 'L' : 'M'}${proj.x(p).toFixed(1)},${proj.y(p).toFixed(1)}`; });
  return d;
}

/** The line split at the driver: the part already driven (to the last done stop) and the rest. */
export function splitLine(line: readonly LatLng[], lastDone: LatLng | null): { driven: LatLng[]; ahead: LatLng[] } {
  if (!lastDone || line.length < 2) return { driven: [], ahead: [...line] };
  let best = 0, bestD = Infinity;
  line.forEach((p, i) => { const d = (p.lat - lastDone.lat) ** 2 + (p.lng - lastDone.lng) ** 2; if (d < bestD) { bestD = d; best = i; } });
  return { driven: line.slice(0, best + 1), ahead: line.slice(best) };
}

/** The last recorded arrival among these stops — "back at" is only ever a time that happened. */
export function lastArrival(stops: readonly DayStop[]): Date | null {
  const t = stops.map((s) => (s.arrivedAt ? Date.parse(s.arrivedAt) : NaN)).filter(Number.isFinite);
  return t.length ? new Date(Math.max(...t)) : null;
}

/* ═════════════════════════ the real map underneath ═════════════════════════ */

/** Web Mercator — the projection Apple and Google draw in, so our pins land on their streets. */
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360));
const invMercY = (y: number) => (Math.atan(Math.exp(y)) - Math.PI / 4) * (360 / Math.PI);

export interface MapBounds { northEast: LatLng; southWest: LatLng }

/** Project onto a map image whose edges are these bounds. */
export function mercatorProjection(b: MapBounds, width: number, height: number): Projection {
  const top = mercY(b.northEast.lat), bottom = mercY(b.southWest.lat);
  const west = b.southWest.lng, east = b.northEast.lng;
  return {
    x: (p) => ((p.lng - west) / (east - west || 1e-9)) * width,
    y: (p) => ((top - mercY(p.lat)) / (top - bottom || 1e-9)) * height,
  };
}

/**
 * The map area to show: every place, padded, with the box's own shape.
 * ⚠️ A single stop has no span — `minSpanDeg` (~1 km) keeps it from being
 * drawn at the scale of a doorway.
 */
export function mapRegionFor(points: readonly LatLng[], width: number, height: number, pad: number, minSpanDeg = 0.012) {
  const ps = points.filter(isLatLng);
  if (!ps.length || !width || !height) return null;
  let w = Math.min(...ps.map((p) => p.lng)), e = Math.max(...ps.map((p) => p.lng));
  let s = mercY(Math.min(...ps.map((p) => p.lat))), n = mercY(Math.max(...ps.map((p) => p.lat)));
  const minY = (minSpanDeg * Math.PI) / 180;
  if (e - w < minSpanDeg) { const c = (w + e) / 2; w = c - minSpanDeg / 2; e = c + minSpanDeg / 2; }
  if (n - s < minY) { const c = (n + s) / 2; s = c - minY / 2; n = c + minY / 2; }
  // Degrees of lng and mercator units share a scale (deg → rad); fit, then grow to the box's shape.
  const spanX = ((e - w) * Math.PI) / 180, spanY = n - s;
  const k = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const fullX = (width / k) * (180 / Math.PI), fullY = height / k;
  const cx = (w + e) / 2, cy = (n + s) / 2;
  const north = invMercY(cy + fullY / 2), south = invMercY(cy - fullY / 2);
  return {
    latitude: (north + south) / 2, longitude: cx,
    latitudeDelta: north - south, longitudeDelta: fullX,
    bounds: { northEast: { lat: north, lng: cx + fullX / 2 }, southWest: { lat: south, lng: cx - fullX / 2 } } as MapBounds,
  };
}

/** A stable name for one map picture: the area, the size, the theme. */
export function mapKey(b: MapBounds, width: number, height: number, dark: boolean): string {
  const raw = [b.northEast.lat, b.northEast.lng, b.southWest.lat, b.southWest.lng].map((n) => n.toFixed(4)).join(',') + `|${width}x${height}|${dark ? 'd' : 'l'}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
