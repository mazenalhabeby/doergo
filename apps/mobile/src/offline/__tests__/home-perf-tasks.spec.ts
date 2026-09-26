/**
 * What the home's task list costs — `useHomeTasks` and the engine's pull,
 * driven for real.
 *
 * My work and Today's route each read `useHomeTasks`, so every trigger used to
 * be TWO pulls — each carrying the scope's whole membership (`scopeIds`, ~4 KB
 * for an admin) — plus a third from the provider on reconnect, and a new
 * array for every card on every pull even when nothing had changed.
 *
 *   ⚠️ Two readers on one focus: ONE pull on the wire (the engine joins them).
 *   ⚠️ A pull within HOME_PULL_GAP_MS: no pull at all, the phone's copy is read.
 *   ⚠️ No signal: no pull, and no server fallback requests either.
 *   ⚠️ A pull that changed nothing hands the cards the SAME array.
 *   ⚠️ `load` keeps its identity when the signal or the database changes.
 *   ⚠️ Nothing answered while the database is opening is not "loaded".
 */
jest.mock('react', () => require('./hook-harness').react);
jest.mock('../../lib/api/tasks', () => ({ tasksApi: { list: jest.fn() } }));
const mockOffline: { records: any; engine: any; starting: boolean } = { records: null, engine: null, starting: false };
const mockSync: { operations: any[] } = { operations: [] };
jest.mock('../offline-context', () => ({
  useOffline: () => mockOffline,
  useSyncStatus: () => mockSync,
}));

import { mountHook, settle } from './hook-harness';
import { connectivity } from '../connectivity';
import { HOME_PULL_GAP_MS, homeTasksSignature, useHomeTasks } from '../tasks/use-home-tasks';
import { tasksApi } from '../../lib/api/tasks';
import { SyncEngine, type RecordsSink, type SyncTransport } from '../sync-engine';
import { MemoryOutboxStore } from '../outbox/memory-store';

const list = tasksApi.list as jest.Mock;

function fakeRecords(rows: any[], lastPullAt: number | null) {
  const listeners = new Set<(scope: string) => void>();
  return {
    rows,
    lastPullAt,
    listCalls: 0,
    async cursor() { return { cursor: 'c1', lastPullAt: this.lastPullAt }; },
    async list() { this.listCalls++; return this.rows; },
    onChange(l: (scope: string) => void) { listeners.add(l); return () => listeners.delete(l); },
    emit(scope: string) { listeners.forEach((l) => l(scope)); },
  };
}
const row = (id: string, updatedAt = '2026-09-26T08:00:00Z') => ({ id, parentId: null, serverUpdatedAt: updatedAt, data: { id, status: 'NEW', updatedAt } });

/* Two readers of the hook, as on the home: My work and Today's route. */
function useMyWorkReader() { return useHomeTasks(); }

beforeEach(() => {
  list.mockReset();
  list.mockResolvedValue([]);
  connectivity.setNetwork('up');
  mockSync.operations = [];
  mockOffline.starting = false;
});

describe('pulls', () => {
  it('a stale copy pulls once — and two readers on one focus are still one pull on the wire', async () => {
    const transportPull = jest.fn(async () => ({ scope: 'tasks', rows: [], deleted: [], cursor: 'c2', hasMore: false }));
    const records = fakeRecords([row('t1')], Date.now() - HOME_PULL_GAP_MS - 1);
    const sink: RecordsSink = { applyPull: async () => undefined, cursor: async () => ({ cursor: 'c1', lastPullAt: null }) };
    const engine = new SyncEngine({
      userId: 'u1', organizationId: 'o1', store: new MemoryOutboxStore(), records: sink,
      transport: { push: async () => ({ ok: true, results: [] }), pull: transportPull } as unknown as SyncTransport,
      newId: () => 'x', now: () => Date.now(), random: () => 0.5,
    });
    mockOffline.records = records;
    mockOffline.engine = engine;
    const a = mountHook(useMyWorkReader);
    const loadA = a.current.load;
    const b = mountHook(useMyWorkReader);
    await Promise.all([loadA(), b.current.load()]);
    await settle(b);
    expect(transportPull).toHaveBeenCalledTimes(1);
    expect(list).not.toHaveBeenCalled();
  });

  it('a copy pulled moments ago is READ, not pulled again', async () => {
    const pull = jest.fn(async () => undefined);
    mockOffline.records = fakeRecords([row('t1')], Date.now() - 1_000);
    mockOffline.engine = { pull, operations: () => [] };
    const m = mountHook(useMyWorkReader);
    await expect(m.current.load()).resolves.toBe(true);
    const s = await settle(m);
    expect(pull).not.toHaveBeenCalled();
    expect(s.tasks.map((t: any) => t.id)).toEqual(['t1']);
  });

  it('with no signal: the copy, no pull', async () => {
    const pull = jest.fn(async () => undefined);
    mockOffline.records = fakeRecords([row('t1')], 0);
    mockOffline.engine = { pull, operations: () => [] };
    connectivity.setNetwork('down');
    const m = mountHook(useMyWorkReader);
    await m.current.load();
    expect(pull).not.toHaveBeenCalled();
  });
});

describe('no copy on the phone', () => {
  beforeEach(() => {
    mockOffline.records = null;
    mockOffline.engine = null;
  });

  it('online: the two narrow list requests — and not again for a focus moments later', async () => {
    const m = mountHook(useMyWorkReader);
    await expect(m.current.load()).resolves.toBe(true);
    expect(list).toHaveBeenCalledTimes(2);
    await expect(m.current.load()).resolves.toBe(true);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('no signal: NO request is attempted — and it is not "loaded" while the database is still opening', async () => {
    connectivity.setNetwork('down');
    mockOffline.starting = true;
    const m = mountHook(useMyWorkReader);
    await expect(m.current.load()).resolves.toBe(false);
    expect(list).not.toHaveBeenCalled();
    expect((await settle(m)).loaded).toBe(false);
  });

  it('no signal, and no copy coming: unreachable, which the card draws as ⑦ — still without a request', async () => {
    connectivity.setNetwork('down');
    const m = mountHook(useMyWorkReader);
    await expect(m.current.load()).rejects.toMatchObject({ statusCode: 0 });
    expect(list).not.toHaveBeenCalled();
  });
});

describe('identity', () => {
  it('`load` survives the signal changing and the database finishing opening', async () => {
    mockOffline.records = fakeRecords([row('t1')], Date.now());
    mockOffline.engine = { pull: jest.fn(), operations: () => [] };
    mockOffline.starting = true;
    const m = mountHook(useMyWorkReader);
    const first = m.current.load;
    connectivity.setNetwork('down');
    mockOffline.starting = false;
    m.render();
    connectivity.setNetwork('up');
    m.render();
    expect(m.current.load).toBe(first);
  });

  it('a pull that changed nothing keeps the SAME array; a changed row gives a new one', async () => {
    const records = fakeRecords([row('t1'), row('t2')], Date.now());
    mockOffline.records = records;
    mockOffline.engine = { pull: jest.fn(), operations: () => [] };
    const m = mountHook(useMyWorkReader);
    await m.current.load();
    const before = (await settle(m)).tasks;
    expect(before).toHaveLength(2);
    records.emit('tasks'); // an empty pull landed
    const same = (await settle(m)).tasks;
    expect(same).toBe(before);
    records.rows = [row('t1'), row('t2', '2026-09-26T09:30:00Z')];
    records.emit('tasks');
    const moved = (await settle(m)).tasks;
    expect(moved).not.toBe(before);
  });

  it('a write to ANOTHER scope does not even re-read the copy', async () => {
    const records = fakeRecords([row('t1')], Date.now());
    mockOffline.records = records;
    mockOffline.engine = { pull: jest.fn(), operations: () => [] };
    const m = mountHook(useMyWorkReader);
    await m.current.load();
    await settle(m);
    const reads = records.listCalls;
    records.emit('http');
    await settle(m);
    expect(records.listCalls).toBe(reads);
  });
});

describe('homeTasksSignature', () => {
  const rows = [row('t1'), row('t2')] as any[];
  it('is stable for the same rows', () => {
    expect(homeTasksSignature(rows, [])).toBe(homeTasksSignature([row('t1'), row('t2')] as any[], []));
  });
  it('moves with a server change', () => {
    expect(homeTasksSignature(rows, [])).not.toBe(homeTasksSignature([row('t1'), row('t2', 'later')] as any[], []));
  });
  it('moves with a queued change about one of the rows, and ignores the others', () => {
    const base = homeTasksSignature(rows, []);
    expect(homeTasksSignature(rows, [{ id: 'o1', entityId: 't2', state: 'pending' } as any])).not.toBe(base);
    expect(homeTasksSignature(rows, [{ id: 'o2', entityId: 'shift', state: 'pending' } as any])).toBe(base);
  });
});

describe('SyncEngine.pull — one per scope at a time', () => {
  it('three callers, one pull; the next caller after it lands starts a new one', async () => {
    let resolvePage!: (v: unknown) => void;
    const transportPull = jest.fn(() => new Promise((r) => { resolvePage = r; }));
    const applied: unknown[] = [];
    const sink: RecordsSink = { applyPull: async (_s, p) => { applied.push(p); }, cursor: async () => ({ cursor: null, lastPullAt: null }) };
    const engine = new SyncEngine({
      userId: 'u1', organizationId: 'o1', store: new MemoryOutboxStore(), records: sink,
      transport: { push: async () => ({ ok: true, results: [] }), pull: transportPull } as unknown as SyncTransport,
      newId: () => 'x', now: () => Date.now(), random: () => 0.5,
    });
    const calls = [engine.pull('tasks'), engine.pull('tasks'), engine.pull('tasks')];
    await new Promise((r) => setImmediate(r));
    resolvePage({ scope: 'tasks', rows: [], deleted: [], cursor: 'c', hasMore: false });
    await Promise.all(calls);
    expect(transportPull).toHaveBeenCalledTimes(1);
    expect(applied).toHaveLength(1);
    const again = engine.pull('tasks');
    await new Promise((r) => setImmediate(r));
    resolvePage({ scope: 'tasks', rows: [], deleted: [], cursor: 'd', hasMore: false });
    await again;
    expect(transportPull).toHaveBeenCalledTimes(2);
  });

  it('a failed pull is not remembered — the next one tries', async () => {
    const transportPull = jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue({ scope: 'tasks', rows: [], deleted: [], cursor: 'c', hasMore: false });
    const sink: RecordsSink = { applyPull: async () => undefined, cursor: async () => ({ cursor: null, lastPullAt: null }) };
    const engine = new SyncEngine({
      userId: 'u1', organizationId: 'o1', store: new MemoryOutboxStore(), records: sink,
      transport: { push: async () => ({ ok: true, results: [] }), pull: transportPull } as unknown as SyncTransport,
      newId: () => 'x', now: () => Date.now(), random: () => 0.5,
    });
    await expect(engine.pull('tasks')).rejects.toThrow('down');
    await expect(engine.pull('tasks')).resolves.toBeUndefined();
    expect(transportPull).toHaveBeenCalledTimes(2);
  });
});
