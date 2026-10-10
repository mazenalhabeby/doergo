/**
 * The update that seals the buffers must not lose what an older version held
 * in plaintext: route points from a dead zone and kept check-ins still go up
 * after the OTA lands — once, in order, and the disk holds no plaintext after.
 */
import { webcrypto } from 'crypto';
import { createSecureBuffer, ENVELOPE, type KeyVault, type PlainStorage } from '../secure-buffer';
import { createRouteBuffer, PENDING_PREFIX, type PendingBurst } from '../../services/route-buffer';
import { checkInBufferKey, createCheckInBuffer, type KeptCheckIn } from '../../services/check-in-buffer';

function disk() {
  const data = new Map<string, string>();
  const storage: PlainStorage & { data: Map<string, string>; writes: string[] } = {
    data,
    writes: [],
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => { data.set(k, v); storage.writes.push(k); },
    removeItem: async (k) => { data.delete(k); },
    multiRemove: async (ks) => { ks.forEach((k) => data.delete(k)); },
    getAllKeys: async () => [...data.keys()],
  };
  return storage;
}
function vault() {
  const data = new Map<string, string>();
  let down = false;
  const v: KeyVault & { down(on: boolean): void } = {
    down: (on) => { down = on; },
    get: async (n) => { if (down) throw new Error('locked'); return data.get(n) ?? null; },
    set: async (n, x) => { if (down) throw new Error('locked'); data.set(n, x); },
    remove: async (n) => { data.delete(n); },
  };
  return v;
}
const random = (n: number) => webcrypto.getRandomValues(new Uint8Array(n));

const T0 = Date.parse('2026-10-10T06:00:00Z');
const pts = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({
  lat: 47.98 + (from + i) * 0.0002, lng: 13.82, accuracy: 5, timestamp: new Date(T0 + (from + i) * 5000).toISOString(),
}));

/** Exactly what the version before this one left on disk: a 200-point chunk layout AND the even older single value. */
function oldRouteLayout(storage: ReturnType<typeof disk>, owner = 'mike') {
  const p = `${PENDING_PREFIX}:${owner}`;
  storage.data.set(p, JSON.stringify([{ taskId: 't', points: pts(3, 0) }]));
  storage.data.set(`${p}:a`, JSON.stringify({ taskId: 't', points: pts(200, 3) }));
  storage.data.set(`${p}:b`, JSON.stringify({ taskId: 't', points: pts(120, 203) }));
  storage.data.set(`${p}:index`, JSON.stringify([
    { id: 'a', n: 200, taskId: 't', oldest: T0 + 15_000, newest: T0 + 202 * 5000 },
    { id: 'b', n: 120, taskId: 't', oldest: T0 + 203 * 5000, newest: T0 + 322 * 5000 },
  ]));
}

function routeSetup(storage: ReturnType<typeof disk>, v: ReturnType<typeof vault>) {
  const sb = createSecureBuffer({ storage, vault: () => v, randomBytes: random });
  const store = (owner: string) => sb.storageFor(owner, 'route', (all) =>
    all.filter((k) => k === `${PENDING_PREFIX}:${owner}` || k.startsWith(`${PENDING_PREFIX}:${owner}:`)));
  let n = 0;
  const buf = createRouteBuffer(store, { maxPoints: 5000, maxAgeMs: 48 * 3600_000, now: () => T0 + 3600_000, newId: () => `n${n++}` });
  return { sb, buf };
}

const plaintextLeft = (storage: ReturnType<typeof disk>, prefix: string) =>
  [...storage.data.entries()].filter(([k, v]) => k.startsWith(prefix) && !v.startsWith(ENVELOPE)).map(([k]) => k);

describe('route points held across the update', () => {
  it('are all still there, are sealed in place on first touch, and go up once, in order', async () => {
    const storage = disk();
    const v = vault();
    oldRouteLayout(storage);
    storage.data.set(`${PENDING_PREFIX}:karim:index`, '[]');
    const { buf } = routeSetup(storage, v);

    expect(await buf.count('mike')).toBe(323);
    // Every one of mike's keys is ciphertext now — no coordinate readable; karim's is not mike's to seal.
    expect(plaintextLeft(storage, `${PENDING_PREFIX}:mike`)).toEqual([]);
    for (const [k, val] of storage.data) if (k.startsWith(`${PENDING_PREFIX}:mike`)) expect(val).not.toContain('47.98');
    expect(storage.data.get(`${PENDING_PREFIX}:karim:index`)).toBe('[]');

    const sent: PendingBurst[] = [];
    expect(await buf.drain('mike', async (b) => { sent.push(b); return []; }, 500)).toBe(true);
    const stamps = sent.flatMap((b) => b.points).map((p) => p.timestamp);
    expect(stamps).toEqual(pts(323).map((p) => p.timestamp));
    expect([...storage.data.keys()].filter((k) => k.startsWith(`${PENDING_PREFIX}:mike`))).toEqual([]);
  });

  it('a new burst after the update joins them, sealed; nothing is doubled', async () => {
    const storage = disk();
    const { buf } = routeSetup(storage, vault());
    oldRouteLayout(storage);
    await buf.append('mike', [{ taskId: 't', points: pts(5, 323) }]);
    expect(plaintextLeft(storage, PENDING_PREFIX)).toEqual([]);
    const all = (await buf.all('mike')).flatMap((b) => b.points).map((p) => p.timestamp);
    expect(all).toEqual(pts(328).map((p) => p.timestamp));
  });

  it('the migration runs once: a second process rewrites nothing it already sealed', async () => {
    const storage = disk();
    const v = vault();
    oldRouteLayout(storage);
    await routeSetup(storage, v).buf.count('mike');
    storage.writes.length = 0;
    const again = routeSetup(storage, v).buf;
    expect(await again.count('mike')).toBe(323);
    expect(storage.writes).toEqual([]);
  });

  it('⚠️ keychain locked at the first touch: the plaintext stays, nothing is lost, and it is sealed next time', async () => {
    const storage = disk();
    const v = vault();
    oldRouteLayout(storage);
    v.down(true);
    const locked = routeSetup(storage, v).buf;
    // A burst arriving now cannot be sealed — it is refused, and the held points are NOT written over.
    await locked.append('mike', [{ taskId: 't', points: pts(5, 323) }]);
    expect(plaintextLeft(storage, `${PENDING_PREFIX}:mike`).sort()).toEqual(
      [`${PENDING_PREFIX}:mike`, `${PENDING_PREFIX}:mike:a`, `${PENDING_PREFIX}:mike:b`, `${PENDING_PREFIX}:mike:index`].sort());
    v.down(false);
    const later = routeSetup(storage, v).buf;
    expect(await later.count('mike')).toBe(323);
    expect(plaintextLeft(storage, PENDING_PREFIX)).toEqual([]);
  });
});

describe('kept check-ins held across the update', () => {
  const at = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

  it('are sent after the update, and the list on disk is sealed', async () => {
    const storage = disk();
    const v = vault();
    const sb = createSecureBuffer({ storage, vault: () => v, randomBytes: random });
    const old: KeptCheckIn[] = [{ lat: 47.98, lng: 13.82, recordedAt: at(30) }, { lat: 47.99, lng: 13.83, recordedAt: at(20) }];
    storage.data.set(checkInBufferKey('mike'), JSON.stringify(old));
    const sent: KeptCheckIn[][] = [];
    let online = false;
    const buf = createCheckInBuffer({
      storage,
      storageFor: (owner) => sb.storageFor(owner, 'check-ins', (all) => all.filter((k) => k === checkInBufferKey(owner))),
      owner: async () => 'mike',
      send: async (p) => { if (!online) throw new Error('offline'); sent.push(p); },
      isUnreachable: () => true,
    });

    expect(await buf.count()).toBe(2);
    expect(storage.data.get(checkInBufferKey('mike'))!.startsWith(ENVELOPE)).toBe(true);

    await buf.keep({ lat: 48, lng: 13.9, recordedAt: at(10) });
    expect(await buf.flush()).toBe(false);
    expect(storage.data.get(checkInBufferKey('mike'))).not.toContain('47.98');

    online = true;
    expect(await buf.flush()).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.map((p) => p.lat)).toEqual([47.98, 47.99, 48]);
    expect(storage.data.has(checkInBufferKey('mike'))).toBe(false);
  });
});

describe('every per-person buffer outside the database is sealed', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  const SRC = path.resolve(__dirname, '../..');
  const code = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const STORES: Record<string, string> = {
    'services/background-route-tracking.ts': 'route points + the last point',
    'services/kept-check-ins.ts': 'kept GPS check-ins',
    'home/remember/store.ts': 'the remembered home cards',
    'offline/attendance/legacy-worklog-queue.ts': 'queued work-log notes and photo paths',
    'offline/routes/plan-route.ts': "the day's planned stops",
  };

  it.each(Object.entries(STORES))('%s (%s) writes only through its sealed store', (file) => {
    const src = code(file);
    expect(src).toMatch(/sealedStore\('/);
    expect(src).not.toMatch(/AsyncStorage\.(setItem|multiSet|mergeItem)\(/);
  });
});
