import type { OptimizedRoute } from '@hbcfield/shared/client';
import {
  dayStops, fitProjection, inPlanOrder, isLatLng, lastArrival, primaryVerb, progress, routeFigures, routeLine,
  routeState, splitLine, thin, type DayStop,
} from '../route-day';

const ME = 'u1';
const task = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: `Stop ${id}`, status: 'ASSIGNED', assignedToId: ME, locationLat: 48.2 + Number(id) / 100, locationLng: 16.37 + Number(id) / 100,
  dueDate: `2026-09-26T0${id}:00:00`, ...over,
}) as never;

const stop = (id: string, lat: number, lng: number, at: string | null = null): DayStop => ({ id, lat, lng, label: id, at, arrivedAt: null });
const PLAN: OptimizedRoute = {
  order: ['a', 'b', 'c'],
  waypoints: [{ lat: 48.0, lng: 16.0 }, { lat: 48.1, lng: 16.1, stopId: 'a' }, { lat: 48.2, lng: 16.2, stopId: 'b' }, { lat: 48.3, lng: 16.3, stopId: 'c' }],
  legs: [{ fromIndex: 0, toIndex: 1, meters: 1000, seconds: 600 }, { fromIndex: 1, toIndex: 2, meters: 2000, seconds: 900 }, { fromIndex: 2, toIndex: 3, meters: 3000, seconds: 1200 }],
  totalMeters: 6000, totalSeconds: 2700,
  geometry: { coordinates: [[16.0, 48.0], [16.1, 48.1], [16.2, 48.2], [16.3, 48.3]] },
  engine: 'google',
};
const S = [stop('a', 48.1, 16.1, '2026-09-26T09:00:00'), stop('b', 48.2, 16.2), stop('c', 48.3, 16.3)];

describe('Today\'s route', () => {
  it('stops are MY jobs with a real place, in booked order', () => {
    const got = dayStops([task('3'), task('1'), task('2', { assignedToId: 'other' }), task('4', { locationLat: 999 }), task('5', { status: 'COMPLETED' })], ME);
    expect(got.map((s) => s.id)).toEqual(['1', '3']);
  });

  it('never trusts a coordinate that is not a place', () => {
    expect(isLatLng({ lat: 48, lng: 16 })).toBe(true);
    expect(isLatLng({ lat: NaN, lng: 16 })).toBe(false);
    expect(isLatLng({ lat: 91, lng: 16 })).toBe(false);
    expect(isLatLng({ lat: '48' as never, lng: 16 })).toBe(false);
  });

  it('decides the state in the designed order', () => {
    const none = routeState({ stops: [], plan: null, start: null, ahead: [], doneCount: 0 });
    const noLoc = routeState({ stops: S, plan: null, start: null, ahead: [], doneCount: 0 });
    const notPlanned = routeState({ stops: S, plan: null, start: { lat: 48, lng: 16 }, ahead: [], doneCount: 0 });
    const finished = routeState({ stops: S, plan: PLAN, start: null, ahead: [], doneCount: 3 });
    const mid = routeState({ stops: S, plan: PLAN, start: null, ahead: [S[2]!], doneCount: 2 });
    const start = routeState({ stops: S, plan: PLAN, start: null, ahead: S, doneCount: 0 });
    expect([none, noLoc, notPlanned, finished, mid, start]).toEqual(['none', 'noLocation', 'notPlanned', 'finished', 'midRoute', 'startOfDay']);
  });

  it('moves on by itself within 150 m of a stop — no tap', () => {
    const { ahead, done } = progress(S, { lat: 48.2, lng: 16.2 }, new Set());
    expect(done.map((s) => s.id)).toEqual(['a', 'b']);
    expect(ahead.map((s) => s.id)).toEqual(['c']);
  });

  it('km to go counts only the legs into stops still ahead', () => {
    const f = routeFigures(PLAN, S, [S[1]!, S[2]!]);
    expect(f.metresToGo).toBe(5000);
    expect(f.left).toBe(2);
  });

  it('"back by" is anchored to the first booked time, and never on straight lines', () => {
    const f = routeFigures(PLAN, S, S);
    expect(f.backBy?.getTime()).toBe(new Date('2026-09-26T09:00:00').getTime() - 600_000 + 2_700_000);
    expect(routeFigures({ ...PLAN, engine: 'nearest-neighbour' }, S, S).backBy).toBeNull();
  });

  it('"back at" is only a time that happened', () => {
    expect(lastArrival([{ ...S[0]!, arrivedAt: '2026-09-26T10:00:00Z' }, { ...S[1]!, arrivedAt: '2026-09-26T12:00:00Z' }])?.toISOString()).toBe('2026-09-26T12:00:00.000Z');
    expect(lastArrival(S)).toBeNull();
  });

  it('the big button never promises Apple or Waze the whole route', () => {
    expect(primaryVerb('apple', 0, S[0])).toEqual({ kind: 'driveTo', stop: S[0] });
    expect(primaryVerb('google', 0, S[0])).toEqual({ kind: 'start' });
    expect(primaryVerb('google', 2, S[2])).toEqual({ kind: 'continue' });
    expect(primaryVerb('google', 3, undefined)).toBeNull();
  });

  it('a plan naming a stop that is gone keeps only what is still here', () => {
    expect(inPlanOrder(PLAN, [S[0]!, S[2]!]).map((s) => s.id)).toEqual(['a', 'c']);
  });

  describe('the drawing', () => {
    it('draws the road line, and none on a straight-line plan', () => {
      expect(routeLine(PLAN)).toHaveLength(4);
      expect(routeLine({ ...PLAN, engine: 'nearest-neighbour' })).toEqual([]);
      expect(routeLine({ ...PLAN, geometry: { coordinates: [[16, 48], ['x', 1], [500, 48]] } })).toEqual([[16, 48]]);
    });

    it('is bounded: a long road line is thinned, the ends kept', () => {
      const long = Array.from({ length: 5000 }, (_, i) => i);
      const t = thin(long, 240);
      expect(t).toHaveLength(240);
      expect(t[0]).toBe(0);
      expect(t.at(-1)).toBe(4999);
    });

    it('fits every place inside the box, keeping the shape', () => {
      const p = fitProjection(S, 330, 126, 16)!;
      for (const s of S) {
        expect(p.x(s)).toBeGreaterThanOrEqual(16 - 1e-6);
        expect(p.x(s)).toBeLessThanOrEqual(330 - 16 + 1e-6);
        expect(p.y(s)).toBeGreaterThanOrEqual(16 - 1e-6);
        expect(p.y(s)).toBeLessThanOrEqual(126 - 16 + 1e-6);
      }
      // north is up
      expect(p.y(S[2]!)).toBeLessThan(p.y(S[0]!));
    });

    it('splits the line at the last stop reached', () => {
      const line = [{ lat: 48, lng: 16 }, { lat: 48.1, lng: 16.1 }, { lat: 48.2, lng: 16.2 }];
      const { driven, ahead } = splitLine(line, { lat: 48.1, lng: 16.1 });
      expect(driven).toHaveLength(2);
      expect(ahead).toHaveLength(2);
    });
  });
});

describe('a job added after the plan', () => {
  it('is never dropped: it is listed as not in the plan', () => {
    const { notInPlan } = jest.requireActual('../route-day') as typeof import('../route-day');
    const plan = { order: ['a'], waypoints: [], legs: [], totalMeters: 0, totalSeconds: 0, engine: 'google' } as never;
    const a = { id: 'a', lat: 48, lng: 16, at: null, arrivedAt: null };
    const b = { id: 'b', lat: 48.1, lng: 16.1, at: null, arrivedAt: null };
    expect(notInPlan(plan, [a, b]).map((s) => s.id)).toEqual(['b']);
    expect(notInPlan(null, [a, b])).toEqual([]);
  });
});
