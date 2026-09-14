/**
 * The ways a day in the field goes wrong, against a fake server that — like
 * the real one — applies an operation once per id and replays the answer.
 *
 * Each test ends on the same question: did every piece of work arrive, exactly
 * once?
 */
import { assessOccurrence } from '@hbcfield/shared/client';
import { SyncEngine, type RecordsSink, type SyncTransport } from '../sync-engine';
import { MemoryOutboxStore } from '../outbox/memory-store';
import { MemoryFileRegistry } from '../files/sqlite-file-registry';
import { FileUploadPreparer } from '../files/upload-preparer';
import { captureEvidence, noteServerTime, resetClockAnchor } from '../clock';
import type { OutboxOp } from '../outbox/types';

const records: RecordsSink = { async applyPull() {}, async cursor() { return { cursor: null, lastPullAt: null }; } };

/** A server that applies each id once, can lose its answer, and can be down or signed out. */
function fakeServer() {
  const applied = new Map<string, number>();
  const state = { down: false, unauthorized: false, loseNextAnswer: false, pushes: 0, largestBatch: 0 };
  const transport: SyncTransport = {
    async push(ops: OutboxOp[]) {
      state.pushes++;
      state.largestBatch = Math.max(state.largestBatch, ops.length);
      if (state.down) throw new Error('Network request failed');
      if (state.unauthorized) return { ok: false, status: 401 };
      const results = ops.map((o) => {
        const seen = applied.has(o.id);
        applied.set(o.id, (applied.get(o.id) ?? 0) + (seen ? 0 : 1));
        return { id: o.id, status: seen ? ('replayed' as const) : ('applied' as const), body: {} };
      });
      if (state.loseNextAnswer) {
        state.loseNextAnswer = false;
        throw new Error('The connection dropped before the answer arrived');
      }
      return { ok: true, results };
    },
    async pull() {
      throw new Error('unused');
    },
  };
  return { transport, applied, state };
}

let t = 1_757_849_000_000;
function engineOn(store: MemoryOutboxStore, transport: SyncTransport, extra: Partial<ConstructorParameters<typeof SyncEngine>[0]> = {}) {
  let n = 0;
  return new SyncEngine({
    userId: 'u1', organizationId: 'o1', store, transport, records, now: () => t, random: () => 0.5,
    newId: () => `op-${String(++n).padStart(6, '0')}-${Math.random().toString(36).slice(2, 6)}`,
    ...extra,
  });
}
const note = (task: string, i = 0) => ({ op: 'task.comment' as const, lane: `task:${task}`, entityId: task, payload: { params: { taskId: task }, body: { content: `note ${i}` } } });

beforeEach(() => {
  t = 1_757_849_000_000;
});

describe('chaos', () => {
  it('the app is killed in the middle of a push: after restart everything arrives once', async () => {
    const store = new MemoryOutboxStore();
    const server = fakeServer();
    const first = engineOn(store, server.transport);
    await first.start();
    server.state.down = true;
    for (let i = 0; i < 5; i++) await first.enqueue(note('t1', i));
    await first.flush();

    // The kill: operations left mid-flight on disk, the process gone.
    const ops = await store.list('u1');
    await store.save(ops.map((o) => ({ ...o, state: 'inflight' as const })));
    first.stop();

    server.state.down = false;
    const second = engineOn(store, server.transport);
    await second.start();
    t += 60_000;
    await second.flush();

    expect([...server.applied.values()]).toEqual([1, 1, 1, 1, 1]);
    expect(second.operations().every((o) => o.state === 'done')).toBe(true);
  });

  it('the answer to a push is lost: the batch is sent again and nothing is doubled', async () => {
    const store = new MemoryOutboxStore();
    const server = fakeServer();
    const e = engineOn(store, server.transport);
    await e.start();
    server.state.down = true;
    for (let i = 0; i < 3; i++) await e.enqueue(note('t1', i));
    await e.flush();

    server.state.down = false;
    server.state.loseNextAnswer = true;
    t += 60_000;
    await e.flush(); // applied on the server, answer lost → retry
    t += 60_000;
    await e.flush(); // replayed

    expect(server.applied.size).toBe(3);
    expect([...server.applied.values()].every((n) => n === 1)).toBe(true);
    expect(e.operations().every((o) => o.state === 'done')).toBe(true);
  });

  it('the session expires during a sync: the queue waits, then goes once after sign-in', async () => {
    const store = new MemoryOutboxStore();
    const server = fakeServer();
    const e = engineOn(store, server.transport);
    await e.start();
    server.state.unauthorized = true;
    await e.enqueue(note('t1'));
    await e.enqueue(note('t2'));
    await e.flush();
    expect(e.operations().every((o) => o.state === 'awaiting_auth')).toBe(true);
    const pushesWhileSignedOut = server.state.pushes;
    await e.flush();
    // Not hammering a server that already said "who are you".
    expect(server.state.pushes).toBe(pushesWhileSignedOut);

    server.state.unauthorized = false;
    await e.resumeAfterSignIn();
    await e.flush();
    expect([...server.applied.values()]).toEqual([1, 1]);
  });

  it('killed between the upload and the confirm: one upload, one record', async () => {
    const store = new MemoryOutboxStore();
    const server = fakeServer();
    const registry = new MemoryFileRegistry();
    await registry.add({ id: 'photo-1', path: 'file:///p.jpg', kind: 'photo', mime: 'image/jpeg', bytes: 10, state: 'kept', createdAt: 0 });
    let puts = 0;
    const preparer = () =>
      new FileUploadPreparer({
        files: registry,
        disk: { async remove() {} },
        uploader: { async presign() { return { uploadUrl: 'u', fileKey: 'k' }; }, async put() { puts++; } },
      });

    server.state.down = true; // the confirm cannot go
    const first = engineOn(store, server.transport, { preparer: preparer() });
    await first.start();
    await first.enqueue({ op: 'task.attachment', lane: 'task:t1', entityId: 't1', payload: { params: { taskId: 't1' }, body: { id: 'photo-1', fileName: 'p.jpg', fileType: 'image/jpeg' } } });
    await first.flush();
    expect(puts).toBe(1);
    // Killed with the op back to inflight, the upload recorded on the file row.
    const ops = await store.list('u1');
    await store.save(ops.map((o) => ({ ...o, state: 'inflight' as const })));
    first.stop();

    server.state.down = false;
    const second = engineOn(store, server.transport, { preparer: preparer() });
    await second.start();
    t += 60_000;
    await second.flush();
    expect(puts).toBe(1);
    expect(server.applied.size).toBe(1);
    expect(second.operations()[0]!.state).toBe('done');
  });

  it('a thousand operations from a long day offline flush in bounded batches, all once', async () => {
    const store = new MemoryOutboxStore();
    const server = fakeServer();
    const e = engineOn(store, server.transport);
    await e.start();
    server.state.down = true;
    // Straight into the store: a thousand enqueues each triggering a flush is not the scenario.
    const base = { userId: 'u1', organizationId: 'o1', dependsOn: [], state: 'pending' as const, attempts: 0 };
    await store.save(
      Array.from({ length: 1000 }, (_, i) => ({
        ...base, id: `bulk-${String(i).padStart(4, '0')}`, op: 'task.comment' as const, lane: `task:t${i % 40}`,
        payload: { params: { taskId: `t${i % 40}` }, body: { content: `n${i}` } }, createdAt: t + i, updatedAt: t + i,
      })),
    );
    server.state.down = false;
    const started = Date.now();
    await e.start();
    await e.flush();
    const elapsed = Date.now() - started;

    expect(server.applied.size).toBe(1000);
    expect([...server.applied.values()].every((n) => n === 1)).toBe(true);
    expect(server.state.largestBatch).toBeLessThanOrEqual(50);
    // Generous on a CI box; the point is "not quadratic", not a benchmark.
    expect(elapsed).toBeLessThan(10_000);
  });

  it('the phone clock is moved three hours: the server can tell', () => {
    resetClockAnchor();
    const realNow = new Date('2026-09-14T08:00:00.000Z');
    noteServerTime(realNow.toUTCString());
    // A moved clock: the wall clock says 11:00, monotonic time says seconds passed.
    const evidence = captureEvidence(null, new Date(realNow.getTime() + 3 * 3600_000));
    const judged = assessOccurrence(evidence, { now: new Date(realNow.getTime() + 3 * 3600_000 + 60_000) });
    expect(judged.flags).toContain('CLOCK_SUSPECT');

    // An honest clock with the same anchor is not suspected.
    const honest = captureEvidence(null, new Date(realNow.getTime() + 5_000));
    expect(assessOccurrence(honest, { now: new Date(realNow.getTime() + 60_000) }).flags).not.toContain('CLOCK_SUSPECT');
  });
});
