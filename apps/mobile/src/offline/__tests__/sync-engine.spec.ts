/**
 * The sync engine end to end, with the network and storage faked.
 */
import { SyncEngine, type SyncTransport, type RecordsSink } from '../sync-engine';
import { MemoryOutboxStore } from '../outbox/memory-store';
import { ConnectivityMonitor } from '../connectivity';
import { captureEvidence, noteServerTime, resetClockAnchor } from '../clock';
import type { SyncPullResponse } from '@hbcfield/shared/client';

let t = 1_757_849_000_000;
let n = 0;
const clock = () => t;
const newId = () => `0190f3c2-7b1a-7c3d-9e4f-${String(++n).padStart(12, '0')}`;

function fakeTransport() {
  const pushes: string[][] = [];
  const transport: SyncTransport & { mode: 'ok' | 'offline' | 'unauth'; reject: Set<string>; pages: SyncPullResponse[] } = {
    mode: 'ok',
    reject: new Set(),
    pages: [],
    async push(ops) {
      pushes.push(ops.map((o) => o.id));
      if (this.mode === 'offline') throw new Error('Network request failed');
      if (this.mode === 'unauth') return { ok: false, status: 401 };
      // Like the gateway: a dependency refused earlier in the same batch skips its dependents.
      const refused = new Set<string>();
      return {
        ok: true,
        results: ops.map((o) => {
          if (o.dependsOn.some((d) => refused.has(d))) {
            refused.add(o.id);
            return { id: o.id, status: 'skipped' as const, code: 'DEPENDENCY_FAILED' };
          }
          if (this.reject.has(o.id)) {
            refused.add(o.id);
            return { id: o.id, status: 'rejected' as const, code: 'HTTP_400' };
          }
          return { id: o.id, status: 'applied' as const, body: { id: o.entityId } };
        }),
      };
    },
    async pull() {
      return this.pages.shift()!;
    },
  };
  return { transport, pushes };
}

function fakeRecords(): RecordsSink & { applied: { page: SyncPullResponse; keep?: ReadonlySet<string>; firstPage: boolean }[] } {
  let cursor: string | null = null;
  const applied: any[] = [];
  return {
    applied,
    async applyPull(_scope, page, options) {
      applied.push({ page, ...options });
      cursor = page.cursor;
    },
    async cursor() {
      return { cursor, lastPullAt: null };
    },
  };
}

function engine(transport: SyncTransport, records = fakeRecords(), store = new MemoryOutboxStore()) {
  return { e: new SyncEngine({ userId: 'u1', organizationId: 'o1', store, transport, records, newId, now: clock, random: () => 0.5 }), store, records };
}

const comment = (taskId = 't1') => ({ op: 'task.comment' as const, lane: `task:${taskId}`, entityId: taskId, payload: { params: { taskId }, body: { content: 'x' } } });

describe('SyncEngine', () => {
  beforeEach(() => {
    t = 1_757_849_000_000;
  });

  it('keeps work made offline and sends it once the network is back', async () => {
    const { transport, pushes } = fakeTransport();
    transport.mode = 'offline';
    const { e } = engine(transport);
    await e.start();
    const op = await e.enqueue(comment());
    await e.flush();
    expect(e.operations()[0]).toMatchObject({ id: op.id, state: 'retry', attempts: 1 });
    expect(e.snapshot().waiting).toBe(1);

    // Still inside the backoff: nothing is sent.
    transport.mode = 'ok';
    await e.flush();
    expect(pushes).toHaveLength(1);

    t += 2_500;
    await e.flush();
    expect(e.operations()[0]!.state).toBe('done');
    expect(e.snapshot()).toMatchObject({ waiting: 0, attention: 0 });
    expect(e.hasUnsent()).toBe(false);
  });

  it('puts operations left in flight by a crash back in the queue', async () => {
    const store = new MemoryOutboxStore();
    await store.save([{ id: 'x-crashed-op-0000000001', userId: 'u1', organizationId: 'o1', op: 'task.comment', lane: 'task:t1', dependsOn: [], payload: {}, state: 'inflight', attempts: 0, createdAt: t, updatedAt: t }]);
    const { transport } = fakeTransport();
    const { e } = engine(transport, fakeRecords(), store);
    await e.start();
    await e.flush();
    expect((await store.get('x-crashed-op-0000000001'))!.state).toBe('done');
  });

  it('pauses on a signed-out session and resumes after sign-in', async () => {
    const { transport } = fakeTransport();
    transport.mode = 'unauth';
    const { e } = engine(transport);
    await e.start();
    await e.enqueue(comment());
    await e.flush();
    expect(e.operations()[0]!.state).toBe('awaiting_auth');
    expect(e.hasUnsent()).toBe(true);

    transport.mode = 'ok';
    await e.resumeAfterSignIn();
    await e.flush();
    expect(e.operations()[0]!.state).toBe('done');
  });

  it('never sends a step whose dependency was refused, and says why', async () => {
    const { transport, pushes } = fakeTransport();
    const { e } = engine(transport);
    await e.start();
    transport.mode = 'offline';
    const complete = await e.enqueue({ op: 'task.complete', lane: 'task:t9', entityId: 't9', payload: { params: { taskId: 't9' }, body: {} } });
    const photo = await e.enqueue({ op: 'report.attachment', lane: 'task:t9', entityId: 't9', dependsOn: [complete.id], payload: { params: { reportId: 'r9' }, body: {} } });
    // Let the offline attempts the enqueues started finish before the network returns.
    await e.flush();
    transport.mode = 'ok';
    transport.reject.add(complete.id);
    t += 5_000;
    await e.flush();
    const byId = Object.fromEntries(e.operations().map((o) => [o.id, o]));
    expect(byId[complete.id]!.state).toBe('failed');
    expect(byId[photo.id]).toMatchObject({ state: 'failed', lastError: { code: 'DEPENDENCY_FAILED' } });
    // Sent with its dependency (the server skips it in the same batch), never on its own afterwards.
    expect(pushes.flat().filter((id) => id === photo.id).length).toBeLessThanOrEqual(2);
    expect(e.snapshot().attention).toBe(2);
  });

  it('runs one flush at a time and does not lose a flush requested during it', async () => {
    const { transport, pushes } = fakeTransport();
    const { e } = engine(transport);
    await e.start();
    const a = e.enqueue(comment('a'));
    const b = e.enqueue(comment('b'));
    await Promise.all([a, b, e.flush(), e.flush()]);
    await e.flush();
    const sent = pushes.flat();
    expect(new Set(sent).size).toBe(sent.length); // nothing sent twice
    expect(e.operations().every((o) => o.state === 'done')).toBe(true);
  });

  it('lets the member dismiss a refusal or try it again', async () => {
    const { transport } = fakeTransport();
    const { e } = engine(transport);
    await e.start();
    const op = await e.enqueue(comment());
    transport.reject.add(op.id);
    await e.flush();
    expect(e.operations()[0]!.state).toBe('failed');

    transport.reject.delete(op.id);
    await e.retry(op.id);
    await e.flush();
    expect(e.operations()[0]!.state).toBe('done');

    const other = await e.enqueue(comment('t2'));
    transport.reject.add(other.id);
    await e.flush();
    await e.discard(other.id);
    expect(e.operations().find((o) => o.id === other.id)!.state).toBe('discarded');
    expect(e.hasUnsent()).toBe(false);
  });

  it('pulls every page and never evicts a record with work still waiting', async () => {
    const { transport } = fakeTransport();
    const page = (cursor: string, hasMore: boolean): SyncPullResponse => ({ scope: 'tasks', rows: [], deleted: [], cursor, hasMore, reset: false, serverTime: '' });
    transport.pages = [page('c1', true), page('c2', true), page('c3', false)];
    const records = fakeRecords();
    const { e } = engine(transport, records);
    await e.start();
    transport.mode = 'offline';
    await e.enqueue(comment('t-waiting'));
    await e.flush();
    transport.mode = 'ok';
    await e.pull('tasks');
    expect(records.applied.map((a) => a.page.cursor)).toEqual(['c1', 'c2', 'c3']);
    expect(records.applied.map((a) => a.firstPage)).toEqual([true, false, false]);
    expect([...records.applied[0]!.keep!]).toEqual(['t-waiting']);
  });
});

describe('ConnectivityMonitor', () => {
  it('goes limited after two failed requests with a network, and back online on a success', () => {
    const m = new ConnectivityMonitor();
    const seen: string[] = [];
    m.subscribe((s) => seen.push(s));
    m.setNetwork('up');
    m.reportRequest(false);
    expect(m.state).toBe('online');
    m.reportRequest(false);
    expect(m.state).toBe('limited');
    m.reportRequest(true);
    expect(m.state).toBe('online');
    m.setNetwork('down');
    expect(m.state).toBe('offline');
    expect(seen).toEqual(['limited', 'online', 'offline']);
  });
});

describe('captureEvidence', () => {
  beforeEach(() => resetClockAnchor());

  it('carries no anchor until the server has answered', () => {
    expect(captureEvidence()).not.toHaveProperty('anchor');
  });

  it('carries the anchor and a monotonic reading after a response', () => {
    noteServerTime('2026-09-14T07:31:02Z');
    const ev = captureEvidence({ lat: 1, lng: 2, accuracy: 5, fixAt: '2026-09-14T07:31:03Z' });
    expect(ev.anchor).toMatchObject({ serverTime: '2026-09-14T07:31:02.000Z' });
    expect(typeof ev.uptimeMs).toBe('number');
    expect(ev.fix).toMatchObject({ lat: 1 });
  });

  it('ignores a malformed server time', () => {
    noteServerTime('not a date');
    expect(captureEvidence()).not.toHaveProperty('anchor');
  });
});
