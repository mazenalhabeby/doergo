/**
 * Today's route — every pure rule in `route-day.ts`, at its edges.
 * (The designed paths are in route-day.spec.ts; this file is what breaks them.)
 */
import { straightLineRoute, type LatLng, type OptimizedRoute } from '@hbcfield/shared/client';
import {
  arrivedIdsOf, dayStops, fitProjection, inPlanOrder, isLatLng, isStraightLine, lastArrival, legInto, metresTo, notInPlan,
  primaryVerb, progress, routeFigures, routeLine, routeState, smoothPath, splitLine, svgPath, thin, type DayStop,
} from '../route-day';

const ME = 'me';
const task = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: id, status: 'ASSIGNED', assignedToId: ME, locationLat: 48.2, locationLng: 16.37, dueDate: null, ...over,
}) as never;
const stop = (id: string, lat = 48.2, lng = 16.37, at: string | null = null, arrivedAt: string | null = null): DayStop =>
  ({ id, lat, lng, label: id, at, arrivedAt });
const plan = (start: LatLng, stops: DayStop[], over: Partial<OptimizedRoute> = {}): OptimizedRoute =>
  ({ ...straightLineRoute({ start, stops }), engine: 'google', ...over });

describe('dayStops — which jobs are stops', () => {
  it('none, one, many', () => {
    expect(dayStops([], ME)).toEqual([]);
    expect(dayStops([task('a')], ME).map((s) => s.id)).toEqual(['a']);
    expect(dayStops(Array.from({ length: 500 }, (_, i) => task(`t${i}`)), ME)).toHaveLength(500);
  });

  it('no member, somebody else\'s job, a finished job, a desk job: not a stop', () => {
    expect(dayStops([task('a')], null)).toEqual([]);
    expect(dayStops([task('a')], undefined)).toEqual([]);
    expect(dayStops([task('a', { assignedToId: 'x' })], ME)).toEqual([]);
    for (const status of ['COMPLETED', 'CANCELED', 'CLOSED']) expect(dayStops([task('a', { status })], ME)).toEqual([]);
    expect(dayStops([task('a', { tracksLocation: false })], ME)).toEqual([]);
    expect(dayStops([task('a', { tracksLocation: true })], ME)).toHaveLength(1);
  });

  it('a coordinate that is not a place is not a stop (null, NaN, out of range, a string)', () => {
    const bad = [
      { locationLat: null }, { locationLng: null }, { locationLat: NaN }, { locationLng: Infinity },
      { locationLat: 90.01 }, { locationLng: -180.5 }, { locationLat: '48.2' },
    ];
    expect(dayStops(bad.map((o, i) => task(`b${i}`, o)), ME)).toEqual([]);
  });

  it('0,0 and the poles/antimeridian are places', () => {
    expect(dayStops([task('z', { locationLat: 0, locationLng: 0 }), task('p', { locationLat: 90, locationLng: 180 })], ME)).toHaveLength(2);
  });

  it('booked order: timed first by time, then the untimed; the arrival is carried', () => {
    const got = dayStops([
      task('none'),
      task('late', { dueDate: '2026-09-26T20:45:00.000Z' }),
      task('early', { dueDate: '2026-09-26T20:30:00.000Z', routeEndedAt: '2026-09-26T20:31:00.000Z' }),
    ], ME);
    expect(got.map((s) => s.id)).toEqual(['early', 'late', 'none']);
    expect(got[0]!.arrivedAt).toBe('2026-09-26T20:31:00.000Z');
    expect(got[2]!.at).toBeNull();
  });

  it('an empty address is not carried as an address', () => {
    expect(dayStops([task('a', { locationAddress: null })], ME)[0]!.address).toBeUndefined();
  });
});

describe('arrivals', () => {
  it('only a recorded arrival counts', () => {
    const ids = arrivedIdsOf([task('a', { routeEndedAt: '2026-09-26T09:00:00Z' }), task('b')]);
    expect(ids.has('b')).toBe(false);
  });

  it('lastArrival: the latest real time, ignoring nonsense', () => {
    expect(lastArrival([])).toBeNull();
    expect(lastArrival([stop('a', 0, 0, null, 'not a date')])).toBeNull();
    expect(lastArrival([stop('a', 0, 0, null, '2026-09-26T09:00:00Z'), stop('b', 0, 0, null, '2026-09-26T11:00:00Z'), stop('c')])!.toISOString())
      .toBe('2026-09-26T11:00:00.000Z');
  });
});

describe('the plan against today\'s stops', () => {
  const S = [stop('a', 48.21, 16.37), stop('b', 48.22, 16.37), stop('c', 48.23, 16.37)];
  const P = plan({ lat: 48.2, lng: 16.37 }, S.slice(0, 2));

  it('no plan: nothing ordered, nothing "new"', () => {
    expect(inPlanOrder(null, S)).toEqual([]);
    expect(notInPlan(null, S)).toEqual([]);
  });

  it('a plan older than a new stop: the new stop is listed, never dropped', () => {
    expect(inPlanOrder(P, S).map((s) => s.id)).toEqual(['a', 'b']);
    expect(notInPlan(P, S).map((s) => s.id)).toEqual(['c']);
  });

  it('a plan naming a stop that is gone keeps only what is here', () => {
    expect(inPlanOrder(P, [S[1]!]).map((s) => s.id)).toEqual(['b']);
  });

  it('straight-line vs road', () => {
    expect(isStraightLine(null)).toBe(false);
    expect(isStraightLine(P)).toBe(false);
    expect(isStraightLine({ ...P, engine: 'nearest-neighbour' })).toBe(true);
    expect(isStraightLine({ ...P, engine: 'osrm' })).toBe(false);
  });
});

describe('state', () => {
  const S = [stop('a')];
  const P = plan({ lat: 48.1, lng: 16.3 }, S);

  it('no stops wins over everything, even a plan', () => {
    expect(routeState({ stops: [], plan: P, start: { lat: 1, lng: 1 }, ahead: [], doneCount: 0 })).toBe('none');
  });

  it('a plan without a position is still a plan', () => {
    expect(routeState({ stops: S, plan: P, start: null, ahead: S, doneCount: 0 })).toBe('startOfDay');
  });

  it('all done (by record or by standing there): finished', () => {
    expect(routeState({ stops: S, plan: P, start: null, ahead: [], doneCount: 1 })).toBe('finished');
  });
});

describe('progress', () => {
  const S = [stop('a', 48.21, 16.37), stop('b', 48.22, 16.37), stop('c', 48.23, 16.37)];

  it('no position, nothing arrived: everything ahead', () => {
    expect(progress(S, null, new Set()).ahead).toHaveLength(3);
  });

  it('every stop arrived: nothing ahead, all done', () => {
    const r = progress(S, null, new Set(['a', 'b', 'c']));
    expect(r.ahead).toEqual([]);
    expect(r.done).toHaveLength(3);
  });

  it('standing at the last stop skips the ones before it (they were done or skipped)', () => {
    const r = progress(S, { lat: 48.23, lng: 16.37 }, new Set());
    expect(r.ahead).toEqual([]);
    expect(r.done.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('151 m away is not "at" the stop', () => {
    const r = progress(S, { lat: 48.21 + 151 / 111_320, lng: 16.37 }, new Set());
    // Between a and b: nothing done by position.
    expect(r.done).toEqual([]);
  });

  it('a NaN position is no position', () => {
    expect(progress(S, { lat: NaN, lng: NaN }, new Set()).ahead).toHaveLength(3);
  });

  it('empty route', () => {
    expect(progress([], { lat: 1, lng: 1 }, new Set())).toEqual({ ahead: [], done: [] });
  });
});

describe('figures', () => {
  const START = { lat: 48.2, lng: 16.37 };
  const S = [stop('a', 48.21, 16.37, '2026-09-26T09:00:00'), stop('b', 48.22, 16.37), stop('c', 48.23, 16.37)];
  const P = plan(START, S);

  it('no plan: stops left, no distance, no promise', () => {
    expect(routeFigures(null, [], S)).toEqual({ left: 3, metresToGo: null, backBy: null, estimated: false });
  });

  it('all done: 0 left, 0 to go', () => {
    const f = routeFigures(P, S, []);
    expect(f.left).toBe(0);
    expect(f.metresToGo).toBe(0);
  });

  it('a leg home counts until the end', () => {
    const round = plan(START, S, { ...straightLineRoute({ start: START, stops: S, roundTrip: true }), engine: 'google' });
    expect(routeFigures(round, S, []).metresToGo).toBe(round.legs.at(-1)!.meters);
  });

  it('backBy: road plan, first stop timed → first time minus its leg plus the day', () => {
    const f = routeFigures(P, S, S);
    const want = new Date('2026-09-26T09:00:00').getTime() - P.legs[0]!.seconds * 1000 + P.totalSeconds * 1000;
    expect(f.backBy!.getTime()).toBe(want);
  });

  it('backBy: never on a straight line, never from an untimed or midnight first stop, never from nonsense', () => {
    expect(routeFigures({ ...P, engine: 'nearest-neighbour' }, S, S).backBy).toBeNull();
    expect(routeFigures(P, [stop('a', 48.21, 16.37)], S).backBy).toBeNull();
    expect(routeFigures(P, [stop('a', 48.21, 16.37, '2026-09-26T00:00:00')], S).backBy).toBeNull();
    expect(routeFigures(P, [stop('a', 48.21, 16.37, 'garbage')], S).backBy).toBeNull();
    expect(routeFigures({ ...P, totalSeconds: NaN }, S, S).backBy).toBeNull();
  });

  it('a leg with no number adds nothing rather than NaN', () => {
    const broken = { ...P, legs: P.legs.map((l, i) => (i === 2 ? { ...l, meters: NaN } : l)) };
    expect(Number.isFinite(routeFigures(broken, S, S).metresToGo)).toBe(true);
  });

  it('legInto: the leg that arrives at a stop; unknown stop or no plan → null', () => {
    expect(legInto(P, 'b')!.toIndex).toBe(2);
    expect(legInto(P, 'zzz')).toBeNull();
    expect(legInto(null, 'a')).toBeNull();
  });

  it('metresTo: straight, or null without a position', () => {
    expect(metresTo(null, S[0]!)).toBeNull();
    expect(Math.round(metresTo(START, S[0]!)! / 10)).toBe(111);
  });
});

describe('the big button', () => {
  const n = stop('n');
  it('nothing next: no button', () => {
    for (const app of ['google', 'apple', 'waze'] as const) expect(primaryVerb(app, 0, undefined)).toBeNull();
  });
  it('Apple and Waze take one stop — the button names it, even mid-route', () => {
    expect(primaryVerb('apple', 2, n)).toEqual({ kind: 'driveTo', stop: n });
    expect(primaryVerb('waze', 0, n)).toEqual({ kind: 'driveTo', stop: n });
  });
  it('Google: start, then continue', () => {
    expect(primaryVerb('google', 0, n)).toEqual({ kind: 'start' });
    expect(primaryVerb('google', 1, n)).toEqual({ kind: 'continue' });
  });
});

describe('the drawing', () => {
  it('routeLine: [lng,lat] from GeoJSON or an encoded polyline, never lat/lng swapped', () => {
    const encoded = { geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@', engine: 'google' } as unknown as OptimizedRoute;
    const line = routeLine(encoded);
    expect(line[0]![0]).toBeCloseTo(-120.2, 4); // lng first
    expect(line[0]![1]).toBeCloseTo(38.5, 4);
    expect(routeLine(null)).toEqual([]);
    expect(routeLine({ engine: 'google' } as never)).toEqual([]);
    expect(routeLine({ engine: 'google', geometry: { coordinates: 'x' } } as never)).toEqual([]);
    expect(routeLine({ engine: 'google', geometry: { coordinates: [[16, 48], [NaN, 48], [200, 48], [16.1]] } } as never)).toEqual([[16, 48]]);
  });

  it('thin: bounded, ends kept, tiny maxima never yield holes', () => {
    const pts = Array.from({ length: 100_000 }, (_, i) => i);
    const t0 = Date.now();
    const out = thin(pts);
    expect(Date.now() - t0).toBeLessThan(200);
    expect(out).toHaveLength(240);
    expect(out[0]).toBe(0);
    expect(out.at(-1)).toBe(99_999);
    expect(thin(pts, 2)).toEqual([0, 99_999]);
    expect(thin(pts, 1)).toEqual([0]);
    expect(thin(pts, 0)).toEqual([]);
    expect(thin([], 5)).toEqual([]);
    expect(thin(pts, 3).every((x) => x !== undefined)).toBe(true);
  });

  it('fitProjection: nothing to fit, or no room → no drawing', () => {
    expect(fitProjection([], 300, 150, 20)).toBeNull();
    expect(fitProjection([{ lat: NaN, lng: 1 }], 300, 150, 20)).toBeNull();
    expect(fitProjection([{ lat: 48, lng: 16 }], 0, 150, 20)).toBeNull();
  });

  it('fitProjection: one point sits in the middle, finite', () => {
    const p = fitProjection([{ lat: 48, lng: 16 }], 300, 150, 20)!;
    expect(p.x({ lat: 48, lng: 16 })).toBeCloseTo(150, 5);
    expect(p.y({ lat: 48, lng: 16 })).toBeCloseTo(75, 5);
  });

  it('fitProjection: a day across the antimeridian is drawn as the short hop it is', () => {
    const pts = [{ lat: -17.7, lng: 179.9 }, { lat: -17.8, lng: -179.9 }];
    const p = fitProjection(pts, 300, 150, 20)!;
    for (const q of pts) {
      expect(p.x(q)).toBeGreaterThanOrEqual(19.9);
      expect(p.x(q)).toBeLessThanOrEqual(280.1);
    }
    // 0.2° of longitude apart, 0.1° of latitude: wider than tall, not a 359° smear to both edges.
    expect(Math.abs(p.x(pts[0]!) - p.x(pts[1]!))).toBeLessThan(300);
  });

  it('fitProjection: every point of a big Vienna day lands inside the box', () => {
    const pts = Array.from({ length: 2000 }, (_, i) => ({ lat: 48.1 + (i % 37) / 300, lng: 16.2 + (i % 53) / 250 }));
    const p = fitProjection(pts, 330, 150, 24)!;
    for (const q of pts) {
      expect(p.x(q)).toBeGreaterThanOrEqual(23.9); expect(p.x(q)).toBeLessThanOrEqual(306.1);
      expect(p.y(q)).toBeGreaterThanOrEqual(23.9); expect(p.y(q)).toBeLessThanOrEqual(126.1);
    }
  });

  it('svgPath / smoothPath: empty and single-point inputs draw nothing broken', () => {
    const p = fitProjection([{ lat: 48, lng: 16 }], 300, 150, 20)!;
    expect(svgPath([], p)).toBe('');
    expect(svgPath([{ lat: 48, lng: 16 }], p)).toMatch(/^M[\d.]+,[\d.]+$/);
    expect(smoothPath([])).toBe('');
    expect(smoothPath([{ x: 1, y: 1 }])).toBe('');
    expect(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 10 }])).not.toMatch(/NaN/);
  });

  it('splitLine: no last stop or a one-point line → all ahead', () => {
    const line = [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }];
    expect(splitLine(line, null)).toEqual({ driven: [], ahead: line });
    expect(splitLine([line[0]!], line[0]!)).toEqual({ driven: [], ahead: [line[0]!] });
    expect(splitLine(line, { lat: 2, lng: 2 }).driven).toHaveLength(2);
  });

  it('isLatLng: the edges', () => {
    expect(isLatLng(null)).toBe(false);
    expect(isLatLng(undefined)).toBe(false);
    expect(isLatLng({})).toBe(false);
    expect(isLatLng({ lat: 90, lng: -180 })).toBe(true);
    expect(isLatLng({ lat: -90.0001, lng: 0 })).toBe(false);
  });
});
