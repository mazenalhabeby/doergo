import { straightLineRoute } from '@hbcfield/shared/client';
import { restoreRoute, saveRoute } from '../routes/saved-route';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v) };
};
const MORNING = new Date(2026, 8, 14, 7, 30).getTime();
const plan = straightLineRoute({
  start: { lat: 47.98, lng: 13.82 },
  stops: [
    { id: 'far', lat: 48.2, lng: 16.37 },
    { id: 'near', lat: 47.99, lng: 13.83 },
  ],
});

describe('the day’s route on the phone', () => {
  it('orders stops with no signal, nearest first, with no road geometry', () => {
    expect(plan.order).toEqual(['near', 'far']);
    expect(plan.engine).toBe('nearest-neighbour');
    expect(plan.geometry).toBeUndefined();
    expect(plan.totalMeters).toBeGreaterThan(0);
  });

  it('restores today’s plan for the same stops', async () => {
    const s = mem();
    await saveRoute(s, 'u1', plan, MORNING);
    expect(await restoreRoute(s, 'u1', ['near', 'far', 'another'], MORNING + 4 * 3600_000)).toEqual(plan);
  });

  it('does not restore yesterday’s plan, somebody else’s, or one with a stop that is gone', async () => {
    const s = mem();
    await saveRoute(s, 'u1', plan, MORNING);
    expect(await restoreRoute(s, 'u1', ['near', 'far'], MORNING + 24 * 3600_000)).toBeNull();
    expect(await restoreRoute(s, 'u2', ['near', 'far'], MORNING)).toBeNull();
    expect(await restoreRoute(s, 'u1', ['near'], MORNING)).toBeNull();
  });
});
