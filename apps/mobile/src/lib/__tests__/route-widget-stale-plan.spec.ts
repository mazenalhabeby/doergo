/**
 * ⚠️ THE 1701 KM BUG — Today's route on the emulator, logged in as John.
 *
 * Four stops, all in Vienna, the phone at 48.105,16.335, and the card read
 * "~1701 km" (Luftlinie) to go and "~1679 km" to the next stop, with Spar
 * before Hofer and REWE — 2.6 km away — last.
 *
 * Root cause: the plan kept on the phone had been made from a start ~1 290 km
 * away (the phone's fix at planning time). A saved plan is restored for the day
 * and the same stops, but it carries the place it was planned FROM, so:
 *   • its nearest-neighbour order started at the stop nearest THAT place
 *     (Billa → Spar → Hofer → REWE), and
 *   • its first leg — 1 679 km × the 1.3 detour — was shown as the distance to
 *     the next stop and summed into the total (1 679 + 2.4 + 3.4 + 16.6 = 1 701).
 * No lat/lng swap, no unit bug: the legs after the first add up to exactly the
 * 22 km of the card's difference.
 */
import { straightLineRoute, type LatLng, type OptimizedRoute } from '@hbcfield/shared/client';
import {
  AT_START_METRES, STALE_START_METRES, inPlanOrder, isStalePlan, legToNext, planStart, progress, routeFigures, routeState,
  type DayStop,
} from '../route-day';

const HERE: LatLng = { lat: 48.105, lng: 16.335 };
/** Where the saved plan was made from — ~1 290 km north of Vienna. */
const FAR: LatLng = { lat: 59.8, lng: 17.6 };
const at = (id: string, lat: number, lng: number, time: string): DayStop => ({ id, lat, lng, label: id, at: time, arrivedAt: null });
const STOPS = [
  at('billa', 48.2015, 16.3905, '2026-09-26T20:00:00.000Z'),
  at('hofer', 48.1702, 16.421, '2026-09-26T20:30:00.000Z'),
  at('spar', 48.1928, 16.4122, '2026-09-26T20:45:00.000Z'),
  at('rewe', 48.079, 16.316, '2026-09-08T22:00:00.000Z'),
];
const planFrom = (start: LatLng): OptimizedRoute => straightLineRoute({ start, stops: STOPS.map(({ id, lat, lng, label }) => ({ id, lat, lng, label })) });

describe('the 1701 km bug — reproduced from the numbers on the card', () => {
  const stale = planFrom(FAR);

  it('a plan made far away orders the day from there and measures the first leg from there', () => {
    expect(stale.order).toEqual(['billa', 'spar', 'hofer', 'rewe']);
    const first = stale.legs[0]!.meters;
    expect(first).toBeGreaterThan(1_600_000);
    // The legs AFTER the first are the card's 22 km difference (1701 − 1679).
    const rest = stale.legs.slice(1).reduce((a, l) => a + l.meters, 0);
    expect(Math.round(rest / 1000)).toBe(22);
  });

  it('is recognised as stale while nothing is done, so the card shows no plan', () => {
    expect(isStalePlan(stale, HERE, 0)).toBe(true);
    const ordered = inPlanOrder(stale, STOPS);
    const { done } = progress(ordered, HERE, new Set());
    expect(done).toHaveLength(0);
    const plan = isStalePlan(stale, HERE, done.length) ? null : stale;
    expect(routeState({ stops: STOPS, plan, start: HERE, ahead: [], doneCount: 0 })).toBe('notPlanned');
    // …and with no plan the figures are the stops, not a distance.
    expect(routeFigures(plan, [], STOPS, HERE).metresToGo).toBeNull();
  });

  it('even if shown, the next stop is never measured from the far start', () => {
    const ordered = inPlanOrder(stale, STOPS);
    const leg = legToNext(stale, ordered[0], HERE)!;
    expect(leg.estimated).toBe(true);
    expect(leg.seconds).toBeNull();
    expect(leg.meters).toBeLessThan(25_000);
    const f = routeFigures(stale, ordered, ordered, HERE);
    expect(f.estimated).toBe(true);
    expect(f.metresToGo!).toBeLessThan(60_000);
  });

  it('a plan made HERE orders the day from here: REWE first, a city-sized total', () => {
    const fresh = planFrom(HERE);
    expect(fresh.order).toEqual(['rewe', 'hofer', 'spar', 'billa']);
    expect(isStalePlan(fresh, HERE, 0)).toBe(false);
    const ordered = inPlanOrder(fresh, STOPS);
    const f = routeFigures(fresh, ordered, ordered, HERE);
    expect(f.estimated).toBe(false);
    expect(f.metresToGo).toBe(fresh.totalMeters);
    expect(f.metresToGo!).toBeLessThan(30_000);
  });
});

describe('when a plan is stale — and when it is not', () => {
  const near = planFrom(HERE);

  it('never without a position, a plan, or a start that is a real place', () => {
    expect(isStalePlan(near, null, 0)).toBe(false);
    expect(isStalePlan(null, HERE, 0)).toBe(false);
    expect(isStalePlan({ ...near, waypoints: [{ lat: NaN, lng: 0 }, ...near.waypoints.slice(1)] }, HERE, 0)).toBe(false);
    expect(isStalePlan(near, { lat: NaN, lng: NaN }, 0)).toBe(false);
  });

  it('never once a stop is done — the start no longer matters', () => {
    expect(isStalePlan(planFrom(FAR), HERE, 1)).toBe(false);
  });

  it('a driver ON a long first leg keeps the plan (under 100 km from the start)', () => {
    const depot = { lat: 47.5, lng: 15.5 }; // ~95 km from HERE
    const p = planFrom(depot);
    expect(isStalePlan(p, HERE, 0)).toBe(false);
    expect(STALE_START_METRES).toBe(100_000);
  });

  it('the plan start is waypoint 0, and only when it is not itself a stop', () => {
    expect(planStart(near)).toEqual(HERE);
    expect(planStart({ ...near, waypoints: [{ lat: 48, lng: 16, stopId: 'x' }] })).toBeNull();
    expect(planStart({ ...near, waypoints: [] })).toBeNull();
  });
});

describe('the leg into the next stop', () => {
  const p = planFrom(HERE);
  const ordered = inPlanOrder(p, STOPS);

  it('standing at the start: the engine\'s leg, with its minutes', () => {
    const leg = legToNext(p, ordered[0], { lat: HERE.lat + 0.001, lng: HERE.lng })!; // ~110 m
    expect(leg.estimated).toBe(false);
    expect(leg.meters).toBe(p.legs[0]!.meters);
    expect(leg.seconds).toBe(p.legs[0]!.seconds);
  });

  it(`moved more than ${AT_START_METRES} m from the start: an estimate from here`, () => {
    const moved = { lat: HERE.lat - 0.015, lng: HERE.lng - 0.012 }; // towards REWE
    const leg = legToNext(p, ordered[0], moved)!;
    expect(leg.estimated).toBe(true);
    expect(leg.meters).toBeLessThan(p.legs[0]!.meters);
  });

  it('mid-route (the leg starts at a stop): the plan\'s leg stands wherever the driver is', () => {
    const leg = legToNext(p, ordered[1], { lat: 48.12, lng: 16.36 })!;
    expect(leg.estimated).toBe(false);
    expect(leg.meters).toBe(p.legs[1]!.meters);
  });

  it('no position: the plan\'s leg; no plan and no position: nothing', () => {
    expect(legToNext(p, ordered[0], null)!.estimated).toBe(false);
    expect(legToNext(null, ordered[0], null)).toBeNull();
    expect(legToNext(p, undefined, HERE)).toBeNull();
  });

  it('a stop the plan does not know: estimated from here', () => {
    const extra = at('new', 48.2, 16.37, '2026-09-26T10:00:00.000Z');
    const leg = legToNext(p, extra, HERE)!;
    expect(leg.estimated).toBe(true);
    expect(leg.meters).toBeGreaterThan(10_000);
  });
});
