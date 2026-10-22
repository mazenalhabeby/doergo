/**
 * What re-renders the home, and what it redraws — the identities the memos
 * depend on, pinned.
 *
 *   ⚠️ `useHomeLayout` is ONE object until something in it changes. Every card
 *      is `React.memo`'d on callbacks keyed on it; a fresh object each render
 *      re-rendered every live widget whenever the screen did anything.
 *   ⚠️ A parked phone's position keeps its identity, so the route sketch is
 *      not redrawn every minute for a driver who has not moved.
 *   ⚠️ The shift card asks once on appearing (not twice), the route card has
 *      no minute timer, and nothing on the home polls in the background.
 */
import * as fs from 'fs';
import * as path from 'path';
import { shiftCard } from '../../lib/__tests__/shift-card-files';

jest.mock('react', () => require('./hook-harness').react);
jest.mock('../../contexts/auth-context', () => ({ useAuth: () => ({ user: mockUser }) }));
const mockUser = { id: 'u1', role: 'ADMIN', canViewAllTasks: true };
jest.mock('../../features/home/layout-store', () => ({
  EMPTY_LAYOUT: { keys: [], hidden: [] },
  loadLayout: async () => ({ keys: ['my-work', 'shortcuts', 'shift-clock'], hidden: ['shift-clock'] }),
  saveLayout: async () => undefined,
}));
/* The registry's components are never rendered here — only its rows are read. */
jest.mock('../../features/home/registry', () => {
  const row = (key: string) => ({ key, title: key, surface: 'well', empty: 'hidden', Component: () => null });
  const WIDGETS = [row('shift-clock'), row('my-work'), row('shortcuts')];
  return {
    WIDGETS,
    DEFAULT_ORDER: ['shift-clock', 'my-work', 'shortcuts'],
    availableWidgets: () => WIDGETS,
  };
});
const mockPosition = { coords: { latitude: 47.9813, longitude: 13.8269 } };
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: async () => ({ granted: true }),
  getLastKnownPositionAsync: async () => mockPosition,
  getCurrentPositionAsync: async () => mockPosition,
  Accuracy: { Balanced: 3 },
}));
jest.mock('../../hooks/use-live-refresh', () => ({ useLiveRefresh: (fn: () => unknown) => { mockLive.refresh = fn; } }));
const mockLive: { refresh: (() => unknown) | null } = { refresh: null };

import { mountHook, settle } from './hook-harness';
import { useHomeLayout } from '../../features/home/use-home-layout';
import { useDriverPosition } from '../../hooks/use-driver-position';
import { readSource } from '../../test-utils/read-source';

const SRC = path.resolve(__dirname, '../..');
const code = (rel: string) =>
  readSource(path.join(SRC, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('the home layout keeps its identity', () => {
  function useLayout() { return useHomeLayout(); }

  it('the same object across renders once the saved order has landed', async () => {
    const m = mountHook(useLayout);
    const loaded = await settle(m);
    expect(loaded.loading).toBe(false);
    expect(loaded.rows.map((r) => r.key)).toEqual(['my-work', 'shortcuts']);
    expect(m.render()).toBe(loaded);
    expect(m.render().move).toBe(loaded.move);
  });

  it('a change to the layout is a new object — the memo is not a freeze', async () => {
    const m = mountHook(useLayout);
    const before = await settle(m);
    before.hide('shortcuts');
    const after = m.render();
    expect(after).not.toBe(before);
    expect(after.rows.map((r) => r.key)).toEqual(['my-work']);
  });

  it('the screen keys its callbacks on it, and its own set of keys is memoised', () => {
    const screen = code('features/home/home-screen.tsx');
    expect(screen).toMatch(/const onHomeKeys = React\.useMemo\(/);
    expect(screen).not.toMatch(/const onHomeKeys = new Set/);
    expect(code('features/home/use-home-layout.ts')).toMatch(/return useMemo\(\s*\(\) => \(\{ rows, available, offScreen, loading, move/);
  });
});

describe('a parked phone is one position', () => {
  function usePosition() { return useDriverPosition(); }

  it('the same fix twice is the SAME object — the route sketch has nothing to redraw', async () => {
    const m = mountHook(usePosition);
    await mockLive.refresh!();
    const first = (await settle(m)).position;
    expect(first).toEqual({ lat: 47.9813, lng: 13.8269 });
    await mockLive.refresh!();
    expect((await settle(m)).position).toBe(first);
  });

  it('a real move is a new position', async () => {
    const m = mountHook(usePosition);
    await mockLive.refresh!();
    const first = (await settle(m)).position;
    mockPosition.coords = { latitude: 47.99, longitude: 13.83 };
    await mockLive.refresh!();
    expect((await settle(m)).position).not.toBe(first);
  });
});

describe('triggers, pinned in the source', () => {
  it('the shift card has ONE trigger set — no separate first-render ask beside a focus ask', () => {
    const card = shiftCard(code);
    expect(card).not.toMatch(/first\.current/);
    expect(card).not.toMatch(/useFocusEffect\(/);
    expect(card.match(/useLiveRefresh\(/g)).toHaveLength(1);
  });

  it('the route card reads the task list on focus and resume — no minute timer of pulls', () => {
    expect(code('features/home/use-route-day.ts')).toMatch(/useLiveRefresh\(load, null\)/);
  });

  it('the minute tick asks only while the app is in the foreground', () => {
    expect(code('hooks/use-live-refresh.ts')).toMatch(/if \(isAppActive\(\)\) ask\(\)/);
  });

  it('the engine joins a pull already on its way rather than starting another', () => {
    expect(code('offline/sync-engine.ts')).toMatch(/const running = this\.pulls\.get\(scope\);\s*if \(running\) return running;/);
  });

  it('the offline banner’s "last synced" does not re-query on every kept response', () => {
    expect(code('offline/offline-context.tsx')).toMatch(/onChange\(\(scope\) => \{ if \(scope === 'tasks' \|\| scope === 'spaces'\) read\(\); \}\)/);
  });
});
