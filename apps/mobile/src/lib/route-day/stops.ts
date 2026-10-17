/** A day's stops, their order and the route's state (moved here unchanged) */
import {
  STRAIGHT_LINE_ROAD_FACTOR,
  haversineDistance,
  type LatLng,
  type OptimizedRoute,
  type RouteStop,
} from '@hbcfield/shared/client';
import type { Task } from '../api';
import { hasArrived, isMyRouteStop } from '../my-route';

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

type RouteState = 'none' | 'noLocation' | 'notPlanned' | 'finished' | 'midRoute' | 'startOfDay';

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

export { finite, roadEstimate };
