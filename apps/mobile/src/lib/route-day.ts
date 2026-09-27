import {
  decodePolyline, haversineDistance, stopsAheadOf, supportsMultiStop, STRAIGHT_LINE_ROAD_FACTOR,
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
/** Every job of the member's that is a stop at all: theirs, open, on a flow that travels, with a real place. */
function stopsOf(tasks: readonly Task[], userId: string | null | undefined): Array<DayStop & { task: Task }> {
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
      task: t,
    }))
    .sort((a, b) => (a.at ?? '9').localeCompare(b.at ?? '9'));
}

const UNDER_WAY = new Set(['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']);
const localDayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const strip = ({ task: _t, ...stop }: DayStop & { task: Task }): DayStop => stop;

/**
 * ⭐ TODAY'S ROUTE IS WHAT IS STILL TO DRIVE TODAY.
 *
 * Every open stop counted, whatever its date — so next week's deliveries sat
 * on today's route — and the card said "nothing to drive to today" while
 * yesterday's deliveries still waited at their doors. The route is now:
 *   • stops dated today (by the member's own calendar day, DST-safe),
 *   • stops CARRIED OVER — due before today and still open,
 *   • the job already under way, whatever its date,
 *   • an open stop with no date at all (nothing says it is not today);
 * and a stop dated a later day waits for that day (`nextDriveDay`).
 */
export function routeDayOf(tasks: readonly Task[], userId: string | null | undefined, now: Date = new Date()) {
  const today = localDayStart(now);
  const tomorrow = localDayStart(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const all = stopsOf(tasks, userId);
  const due = (s: DayStop) => (s.at ? new Date(s.at).getTime() : NaN);
  const todays = all.filter((s) => UNDER_WAY.has(s.task.status as string) || !s.at || !(due(s) >= tomorrow));
  const carried = todays.filter((s) => s.at && due(s) < today && !UNDER_WAY.has(s.task.status as string)).length;
  const later = all.filter((s) => !todays.includes(s));
  let nextDay: { day: Date; stops: DayStop[] } | null = null;
  if (later.length) {
    const first = localDayStart(new Date(due(later[0]!)));
    const sameDay = later.filter((s) => localDayStart(new Date(due(s))) === first);
    nextDay = { day: new Date(first), stops: sameDay.map(strip) };
  }
  return { stops: todays.map(strip), carried, nextDay };
}

/** Today's stops — see `routeDayOf`. */
export function dayStops(tasks: readonly Task[], userId: string | null | undefined, now: Date = new Date()): DayStop[] {
  return routeDayOf(tasks, userId, now).stops;
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

/** Where the plan was made from — its first waypoint, when that is a real place. */
export function planStart(plan: OptimizedRoute | null): LatLng | null {
  const w = plan?.waypoints?.[0];
  return w && !w.stopId && isLatLng(w) ? { lat: w.lat, lng: w.lng } : null;
}

/**
 * Within this of the plan's start the driver is still "there", and the leg out
 * of it stands as the engine measured it.
 */
export const AT_START_METRES = 1_000;

/**
 * A plan made this far from where the driver now is — with nothing done yet —
 * ordered the day from somewhere else.
 *
 * ⚠️ THE 1701 KM BUG. A plan is kept for the day and restored for the same
 * stops, but it carries the place it was planned FROM. Planned 1 300 km away
 * (another city, an emulator's default fix, a phone that last knew somewhere
 * else) it put the stop nearest THAT place first and measured the first leg
 * from there, so a driver 2 km from a stop read "~1679 km" to the next one and
 * a day in one city read 1701 km. Such a plan is shown as no plan: the booked
 * order and the Plan button, one tap to order the day from here.
 *
 * Generous on purpose (100 km): a long first leg to a regional stop must not
 * flip a driver who is ON it back to "not planned". Once a stop is done the
 * start no longer matters and the plan is never called stale.
 */
export const STALE_START_METRES = 100_000;

export function isStalePlan(plan: OptimizedRoute | null, position: LatLng | null, doneCount: number): boolean {
  if (!plan || doneCount > 0 || !isLatLng(position)) return false;
  const start = planStart(plan);
  return !!start && haversineDistance(start.lat, start.lng, position.lat, position.lng) > STALE_START_METRES;
}

/** A road estimate from here: the crow line times the usual detour — the same rule as a straight-line plan. */
const roadEstimate = (from: LatLng, to: LatLng) =>
  Math.round(haversineDistance(from.lat, from.lng, to.lat, to.lng) * STRAIGHT_LINE_ROAD_FACTOR);

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
export function routeFigures(plan: OptimizedRoute | null, ordered: readonly DayStop[], ahead: readonly DayStop[], position: LatLng | null = null) {
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
  // Fewer than two kept cannot keep both ends (and max 1 divided by zero into `[undefined]`).
  if (!(max >= 2)) return max >= 1 ? [points[0]!] : [];
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
  if (!ps.length || !(width > 0) || !(height > 0)) return null;
  const midLat = ps.reduce((a, p) => a + p.lat, 0) / ps.length;
  const k = Math.cos((midLat * Math.PI) / 180);
  /*
    A day across the antimeridian (Fiji, the Aleutians) spans 359° if read
    naively and draws as two dots at the card's edges. When the points spread
    wider than half the world, the western ones are read one turn east.
  */
  const lngs = ps.map((p) => p.lng);
  const wrap = Math.max(...lngs) - Math.min(...lngs) > 180;
  const lngOf = (l: number) => (wrap && l < 0 ? l + 360 : l);
  const xs = ps.map((p) => lngOf(p.lng) * k), ys = ps.map((p) => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
  const s = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  // Centred on the real middle — not on `span`, whose 1e-6 floor for a single place (or a day along one street) put the pin off-centre.
  const ox = width / 2 - ((minX + maxX) / 2) * s, oy = height / 2 - ((minY + maxY) / 2) * s;
  return { x: (p) => lngOf(p.lng) * k * s + ox, y: (p) => -p.lat * s + oy };
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

/**
 * A smooth curve through points (Catmull-Rom as cubic Béziers) — the order of
 * the stops drawn as a line that reads like a route, not a zig-zag.
 */
export function smoothPath(pts: readonly { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(pts[0]!.x)},${f(pts[0]!.y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}
