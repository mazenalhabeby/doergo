/**
 * Route points held offline are kept in SMALL chunks — a burst is one small
 * write, not the whole list rewritten (route-buffer.ts).
 */
import { CHUNK_POINTS, createRouteBuffer, type KV, type PendingBurst } from '../route-buffer';

function memoryKV() {
  const store = new Map<string, string>();
  const writes: { key: string; bytes: number }[] = [];
  const kv: KV = {
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => { store.set(k, v); writes.push({ key: k, bytes: v.length }); },
    removeItem: async (k) => { store.delete(k); },
    multiRemove: async (ks) => { ks.forEach((k) => store.delete(k)); },
  };
  return { kv, store, writes };
}

const T0 = Date.parse('2026-10-10T06:00:00Z');
const pts = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({
  lat: 47.98 + (from + i) * 0.0002, lng: 13.82, accuracy: 5, timestamp: new Date(T0 + (from + i) * 5000).toISOString(),
}));
const make = (kv: KV, extra: Partial<Parameters<typeof createRouteBuffer>[1]> = {}) => {
  let n = 0;
  return createRouteBuffer(kv, { maxPoints: 5000, maxAgeMs: 48 * 3600_000, now: () => T0 + 3600_000, newId: () => `c${n++}`, ...extra });
};

describe('holding points offline', () => {
  it('a burst through a dead zone writes ONE small chunk and a small index — never the whole list', async () => {
    const { kv, writes } = memoryKV();
    const buf = make(kv);
    // An hour in a tunnel's worth: 4,000 points held already.
    for (let i = 0; i < 20; i++) await buf.append('mike', [{ taskId: 't', points: pts(200, i * 200) }]);
    writes.length = 0;
    await buf.append('mike', [{ taskId: 't', points: pts(3, 4000) }]);
    const biggest = Math.max(...writes.map((w) => w.bytes));
    // The old layout rewrote all 4,003 points (~400 KB) here.
    expect(biggest).toBeLessThan(20_000);
    expect(writes).toHaveLength(2);
    expect(await buf.count('mike')).toBe(4003);
  });

  it('tops up the last chunk while it has room and the same task; a new task starts a new chunk', async () => {
    const { kv, store } = memoryKV();
    const buf = make(kv);
    await buf.append('mike', [{ taskId: 'a', points: pts(5) }]);
    await buf.append('mike', [{ taskId: 'a', points: pts(5, 5) }]);
    await buf.append('mike', [{ taskId: 'b', points: pts(2, 10) }]);
    const index = JSON.parse(store.get('route_pending_bursts:mike:index')!);
    expect(index.map((e: { n: number; taskId: string }) => [e.taskId, e.n])).toEqual([['a', 10], ['b', 2]]);
  });

  it('no chunk holds more than CHUNK_POINTS', async () => {
    const { kv, store } = memoryKV();
    const buf = make(kv);
    await buf.append('mike', [{ taskId: 't', points: pts(CHUNK_POINTS * 2 + 7) }]);
    const index = JSON.parse(store.get('route_pending_bursts:mike:index')!);
    expect(index.map((e: { n: number }) => e.n)).toEqual([CHUNK_POINTS, CHUNK_POINTS, 7]);
  });

  it('past the ceiling the OLDEST points go — the recent ones say where the member is now', async () => {
    const { kv } = memoryKV();
    const buf = make(kv, { maxPoints: 300 });
    await buf.append('mike', [{ taskId: 't', points: pts(250) }]);
    await buf.append('mike', [{ taskId: 't', points: pts(100, 250) }]);
    const all = (await buf.all('mike')).flatMap((b) => b.points);
    expect(all).toHaveLength(300);
    expect(all[0]!.lat).toBeCloseTo(47.98 + 50 * 0.0002);
    expect(all[299]!.lat).toBeCloseTo(47.98 + 349 * 0.0002);
  });

  it('points past the age limit are neither kept nor sent', async () => {
    const { kv } = memoryKV();
    const buf = make(kv, { now: () => T0 + 49 * 3600_000 });
    await buf.append('mike', [{ taskId: 't', points: pts(4) }]);
    const send = jest.fn(async () => []);
    expect(await buf.drain('mike', send)).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('sending what is held', () => {
  it('oldest first, chunks of one task joined up to a batch, and each deleted as it lands', async () => {
    const { kv, store } = memoryKV();
    const buf = make(kv);
    await buf.append('mike', [{ taskId: 't', points: pts(600) }]);
    const sent: PendingBurst[] = [];
    expect(await buf.drain('mike', async (b) => { sent.push(b); return []; }, 500)).toBe(true);
    expect(sent.map((b) => b.points.length)).toEqual([400, 200]);
    expect(sent.flatMap((b) => b.points).map((p) => p.timestamp)).toEqual(pts(600).map((p) => p.timestamp));
    expect([...store.keys()].filter((k) => k.startsWith('route_pending_bursts'))).toEqual([]);
  });

  it('a failure keeps the undelivered tail IN FRONT and stops — nothing is lost or reordered', async () => {
    const { kv } = memoryKV();
    const buf = make(kv);
    await buf.append('mike', [{ taskId: 'a', points: pts(10) }, { taskId: 'b', points: pts(5, 10) }]);
    // The server took the first 4 of task a, then the connection went.
    expect(await buf.drain('mike', async (b) => b.points.slice(4))).toBe(false);
    const all = await buf.all('mike');
    expect(all.map((b) => [b.taskId, b.points.length])).toEqual([['a', 6], ['b', 5]]);
    expect(all[0]!.points[0]!.timestamp).toBe(pts(1, 4)[0]!.timestamp);
  });

  it('never mixes tasks in one request', async () => {
    const { kv } = memoryKV();
    const buf = make(kv);
    await buf.append('mike', [{ taskId: 'a', points: pts(3) }, { taskId: 'b', points: pts(3, 3) }]);
    const tasks: (string | undefined)[] = [];
    await buf.drain('mike', async (b) => { tasks.push(b.taskId); return []; });
    expect(tasks).toEqual(['a', 'b']);
  });

  it('the list held before this update is folded in and sent first', async () => {
    const { kv, store } = memoryKV();
    store.set('route_pending_bursts:mike', JSON.stringify([{ taskId: 'old', points: pts(3) }]));
    const buf = make(kv);
    await buf.append('mike', [{ taskId: 'new', points: pts(2, 3) }]);
    expect(store.has('route_pending_bursts:mike')).toBe(false);
    const order: (string | undefined)[] = [];
    await buf.drain('mike', async (b) => { order.push(b.taskId); return []; });
    expect(order).toEqual(['old', 'new']);
  });

  it('one member\'s points are never another\'s', async () => {
    const { kv } = memoryKV();
    const buf = make(kv);
    await buf.append('mike', [{ taskId: 't', points: pts(3) }]);
    const send = jest.fn(async () => []);
    await buf.drain('karim', send);
    expect(send).not.toHaveBeenCalled();
    expect(await buf.count('mike')).toBe(3);
  });
});
