/**
 * The home with NO SIGNAL — what each widget draws, and what it does not ask.
 *
 *   shift clock   the phone's copy, straight away; the disk copy is never shut
 *                 out by a refresh that had nothing to ask
 *   my work       the phone's copy (home-perf-tasks.spec.ts)
 *   crew          presence is NEVER drawn from a copy: "needs a connection",
 *                 with no request, and the rings go the moment the signal does
 *   clients       the member's own reminders MAY come from a kept copy — keyed
 *                 by the day, so never yesterday's — but a reminder ticked off
 *                 and still in the queue never comes back
 */
jest.mock('react', () => require('./hook-harness').react);
jest.mock('../../lib/api/attendance', () => ({
  attendanceApi: {
    getStatus: jest.fn(), getBreakStatus: jest.fn(),
    getClockedInAll: jest.fn(), getActiveBreaks: jest.fn(), listNoShows: jest.fn(), pendingApprovalsSummary: jest.fn(),
  },
}));
jest.mock('../../hooks/use-live-refresh', () => ({ useLiveRefresh: (fn: () => unknown) => { mockLive.refresh = fn; } }));
const mockLive: { refresh: (() => unknown) | null } = { refresh: null };
const mockDisk = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    /* ⚠️ A real disk read is slower than a refresh with nothing to ask — as here. */
    getItem: async (k: string) => { await new Promise((r) => setTimeout(r, 5)); return mockDisk.get(k) ?? null; },
    setItem: async (k: string, v: string) => { mockDisk.set(k, v); },
    multiRemove: async (ks: string[]) => { ks.forEach((k) => mockDisk.delete(k)); },
  },
}));
jest.mock('../../contexts/auth-context', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../offline-context', () => ({
  useOffline: () => ({ records: null, engine: null, starting: false }),
  useSyncStatus: () => ({ operations: [] }),
}));

import * as fs from 'fs';
import * as path from 'path';
import { mountHook, settle } from './hook-harness';
import { shiftCard } from '../../lib/__tests__/shift-card-files';
import { connectivity } from '../connectivity';
import { attendanceApi } from '../../lib/api/attendance';
import { loadShift, useShift } from '../attendance/use-shift';
import { useCrew } from '../../components/home/use-crew';
import { useRemembered } from '../../home/remember/use-remembered';
import { forgetEverythingKept } from '../../home/remember/store';
import { queuedDoneIds, withoutDone } from '../../components/home/clients-state';
import { shouldKeep } from '../../lib/api/response-cache';
import { apiEndpoints as EP, type Endpoint } from '@hbcfield/shared/client';
import { readSource } from '../../test-utils/read-source';

/** Would the client let the cache hold this call's answer? (the endpoint's verdict, as the client passes it) */
const kept = <A,>(def: Endpoint<A, any, any>, args: A) => {
  const p = def.path(args);
  return shouldKeep(p, typeof def.keep === 'function' ? def.keep(args) : def.keep);
};

const api = attendanceApi as unknown as Record<string, jest.Mock>;

beforeEach(() => {
  for (const m of Object.values(api)) m.mockReset();
  connectivity.setNetwork('up');
  mockDisk.clear();
  forgetEverythingKept();
  mockLive.refresh = null;
});

describe('shift clock', () => {
  it('no signal: not one request — the phone’s saved shift instead', async () => {
    connectivity.setNetwork('down');
    const records = { get: jest.fn(async () => ({ data: { status: { isClockedIn: true }, breaks: null, serverAt: 5 } })) };
    const loaded = await loadShift(records as never, 'u1');
    expect(api.getStatus).not.toHaveBeenCalled();
    expect(api.getBreakStatus).not.toHaveBeenCalled();
    expect(loaded).toMatchObject({ source: 'phone', status: { isClockedIn: true } });
  });

  it('a refresh that knew nothing does NOT shut out what the last run saved to disk', async () => {
    mockDisk.set('@hbcfield/kept/shift/u1', JSON.stringify({ value: { status: { isClockedIn: true }, breaks: null, serverAt: 1 }, at: Date.now() }));
    connectivity.setNetwork('down');
    function useShiftCard() { return useShift(); }
    const m = mountHook(useShiftCard);
    await m.current.refresh(); // lands first: nothing to ask, nothing known
    expect(m.render().source).toBe('none');
    const s = await settle(m, 5, 20);
    expect(s.source).toBe('phone');
    expect(s.status?.isClockedIn).toBe(true);
  });

  it('the same for every remembered answer (the schedule totals)', async () => {
    mockDisk.set('@hbcfield/kept/totals-test/u1', JSON.stringify({ value: { n: 7 }, at: Date.now() }));
    const load = jest.fn(async () => { throw Object.assign(new Error('offline'), { statusCode: 0 }); });
    function useTotals() { return useRemembered<{ n: number }>({ name: 'totals-test', userId: 'u1', load }); }
    const m = mountHook(useTotals);
    const s = await settle(m, 5, 20);
    expect(s).toMatchObject({ ready: true, from: 'phone', data: { n: 7 } });
  });
});

describe('crew — presence is never kept', () => {
  function useCrewCard() { return useCrew(true); }

  it('no signal: four requests NOT made, and the card says it needs a connection', async () => {
    connectivity.setNetwork('down');
    const m = mountHook(useCrewCard);
    await mockLive.refresh!();
    const s = await settle(m);
    for (const k of ['getClockedInAll', 'getActiveBreaks', 'listNoShows', 'pendingApprovalsSummary']) expect(api[k]).not.toHaveBeenCalled();
    expect(s).toMatchObject({ failed: true, loading: false, people: [] });
  });

  it('the signal going takes the rings with it at once — not a minute later', async () => {
    api.getClockedInAll.mockResolvedValue([{ id: 'e1', userId: 'u2', locationId: 'a', clockInAt: new Date().toISOString(), user: { id: 'u2' }, location: { id: 'a' } }]);
    api.getActiveBreaks.mockResolvedValue([]);
    api.listNoShows.mockResolvedValue([]);
    api.pendingApprovalsSummary.mockResolvedValue({ total: 0, bySpace: {} });
    const m = mountHook(useCrewCard);
    await mockLive.refresh!();
    expect((await settle(m)).people).toHaveLength(1);
    connectivity.setNetwork('down');
    const s = await settle(m);
    expect(s).toMatchObject({ failed: true, people: [] });
  });

  it('an answer that lands AFTER the signal went is not drawn', async () => {
    let answer!: (v: unknown) => void;
    api.getClockedInAll.mockReturnValue(new Promise((r) => { answer = r; }));
    api.getActiveBreaks.mockResolvedValue([]);
    api.listNoShows.mockResolvedValue([]);
    api.pendingApprovalsSummary.mockResolvedValue({ total: 0, bySpace: {} });
    const m = mountHook(useCrewCard);
    const asking = mockLive.refresh!() as Promise<void>;
    connectivity.setNetwork('down');
    answer([{ id: 'e1', userId: 'u2', clockInAt: new Date().toISOString(), user: { id: 'u2' } }]);
    await asking;
    expect((await settle(m))).toMatchObject({ failed: true, people: [] });
  });

  it('the endpoints behind it are never kept', () => {
    expect(kept(EP.attendance.allEntries, { status: 'CLOCKED_IN', limit: 200 })).toBe(false);
    expect(kept(EP.attendance.activeBreaks, undefined)).toBe(false);
    expect(kept(EP.attendance.noShows, { days: 1 })).toBe(false);
    expect(kept(EP.attendance.pendingApprovals, { summary: true })).toBe(false);
    expect(kept(EP.attendance.status, undefined)).toBe(false);
    expect(kept(EP.attendance.breakStatus, undefined)).toBe(false);
  });
});

describe('clients — a kept copy, but never one that undoes the member', () => {
  it('the due list is kept, keyed by the day it asks about', () => {
    const day = { dayStart: '2026-09-26T00:00:00.000Z', dayEnd: '2026-09-26T23:59:59.999Z', limit: 3 };
    expect(EP.customers.due.path(day)).toBe('/customers/due?dayStart=2026-09-26T00%3A00%3A00.000Z&dayEnd=2026-09-26T23%3A59%3A59.999Z&limit=3');
    expect(kept(EP.customers.due, day)).toBe(true);
  });

  const r = (id: string, kind = 'CALL') => ({ id, customerId: 'c1', kind, dueAt: null, name: 'A', shared: 1 }) as any;
  const due = { allowed: true, total: 3, counts: { call: 3, email: 0, other: 0, overdue: 0 }, items: [r('a'), r('b'), r('c')], cold: { count: 0, days: 30 }, book: 10 } as any;
  const op = (entityId: string, state: string, done = true) => ({ op: 'customer.activityUpdate', entityId, state, payload: { body: { done } } });

  it('a reminder ticked off and still in the queue is taken out of the count', () => {
    const queued = queuedDoneIds([op('b', 'pending'), op('c', 'retry')]);
    expect([...queued].sort()).toEqual(['b', 'c']);
    const shown = withoutDone(due, due.items.filter((x: any) => queued.has(x.id)), new Date());
    expect(shown.total).toBe(1);
  });

  it('only a DONE tick, only while it is still the member’s', () => {
    expect(queuedDoneIds([op('a', 'pending', false)]).size).toBe(0);
    expect(queuedDoneIds([op('a', 'failed')]).size).toBe(0);
    expect(queuedDoneIds([op('a', 'discarded')]).size).toBe(0);
    expect(queuedDoneIds([{ op: 'customer.activity', entityId: 'a', state: 'pending', payload: { body: { done: true } } }]).size).toBe(0);
  });
});

describe('what the cards do with it, pinned in the source', () => {
  const code = (rel: string) =>
    readSource(path.resolve(__dirname, '../..', rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('my work says "Nothing scheduled" only once a list is on screen — never while the database opens', () => {
    const card = code('components/home/my-work-card.tsx');
    expect(card).toMatch(/if \(await load\(\)\) setPhase\('ready'\)/);
    expect(card).toMatch(/if \(loaded && phase === 'opening'\) setPhase\('ready'\)/);
    expect(card).not.toMatch(/held\.length > 0 && phase === 'opening'/);
  });

  it('clients hides a queued tick, and re-reads on reconnect only after the queue has gone', () => {
    // The card and the top of the client book share one loader, so this pins both.
    const card = code('components/home/use-clients-due.ts');
    expect(code('components/home/clients-card.tsx')).toMatch(/useClientsDue\(ROWS\)/);
    expect(card).toMatch(/queuedDoneIds\(operations\)/);
    expect(card).toMatch(/onReconnect: true, beforeReconnect: \(\) => running\?\.flush\(\)/);
  });

  it('crew and the shift clock come back by themselves when the signal does', () => {
    expect(code('components/home/use-crew.ts')).toMatch(/useLiveRefresh\(refresh, REFRESH_MS, \{ onReconnect: true \}\)/);
    // The home widget's loader; the Time tab holds its own copy and does the same.
    expect(shiftCard(code)).toMatch(/useLiveRefresh\(shift\.refresh, null, \{ onReconnect: true \}\)/);
    expect(code('components/time/time-screen.tsx')).toMatch(/useLiveRefresh\(shift\.refresh, null, \{ onReconnect: true \}\)/);
  });
});
