/**
 * Photos only on Wi-Fi, and the offline image cache.
 */
import { SyncEngine, type SyncTransport, type RecordsSink } from '../sync-engine';
import { MemoryOutboxStore } from '../outbox/memory-store';
import { FileUploadPreparer } from '../files/upload-preparer';
import { MemoryFileRegistry } from '../files/sqlite-file-registry';
import { ConnectivityMonitor } from '../connectivity';
import type { OutboxOp } from '../outbox/types';

// An in-memory stand-in for expo-file-system's File/Directory.
jest.mock('expo-file-system', () => {
  const files = new Map<string, { size: number; mtime: number }>();
  let clock = 0;
  const join = (...parts: any[]) => parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  class File {
    uri: string;
    constructor(...parts: any[]) { this.uri = join(...parts); }
    get exists() { return files.has(this.uri); }
    get size() { return files.get(this.uri)?.size ?? null; }
    get modificationTime() { return files.get(this.uri)?.mtime ?? null; }
    delete() { files.delete(this.uri); }
    static __put(uri: string, size: number) { files.set(uri, { size, mtime: ++clock }); }
  }
  class Directory {
    uri: string;
    constructor(...parts: any[]) { this.uri = join(...parts); }
    get exists() { return true; }
    create() {}
    list() { return [...files.keys()].filter((k) => k.startsWith(this.uri + '/')).map((k) => new File(k)); }
    delete() { for (const k of [...files.keys()]) if (k.startsWith(this.uri + '/')) files.delete(k); }
  }
  return { File, Directory, Paths: { cache: { uri: 'cache' }, document: { uri: 'doc' } }, __files: files };
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('expo-file-system');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MediaCache, MEDIA_CACHE_MAX_BYTES } = require('../files/media-cache') as typeof import('../files/media-cache');

describe('photos only on Wi-Fi', () => {
  it('holds a photo on mobile data without counting a failed attempt, and sends it once on Wi-Fi', async () => {
    let unmetered = false;
    const registry = new MemoryFileRegistry();
    await registry.add({ id: 'p1', path: 'file:///doc/p1.jpg', kind: 'photo', mime: 'image/jpeg', bytes: 900, state: 'kept', createdAt: 0 });
    const puts: string[] = [];
    const sent: OutboxOp[] = [];
    let t = 1_000_000;
    const transport: SyncTransport = {
      async push(ops) {
        sent.push(...ops);
        return { ok: true, results: ops.map((o) => ({ id: o.id, status: 'applied' as const })) };
      },
      async pull() { throw new Error('unused'); },
    };
    const records: RecordsSink = { async applyPull() {}, async cursor() { return { cursor: null, lastPullAt: null }; } };
    const e = new SyncEngine({
      userId: 'u1', organizationId: 'o1', store: new MemoryOutboxStore(), transport, records, now: () => t, newId: () => 'op-1',
      preparer: new FileUploadPreparer({
        files: registry, disk: { async remove() {} },
        uploader: { async presign() { return { uploadUrl: 'u', fileKey: 'k' }; }, async put(url) { puts.push(url); } },
        mayUpload: () => unmetered,
      }),
    });
    await e.start();
    await e.enqueue({ op: 'task.attachment', lane: 'task:t1', entityId: 't1', payload: { params: { taskId: 't1' }, body: { id: 'p1', fileName: 'p.jpg', fileType: 'image/jpeg' } } });
    await e.flush();

    expect(e.operations()[0]).toMatchObject({ state: 'retry', attempts: 0, lastError: { code: 'WAITING_FOR_WIFI' } });
    expect(puts).toHaveLength(0);
    expect(sent).toHaveLength(0);

    unmetered = true;
    t += 5 * 60_000 + 1;
    await e.flush();
    expect(puts).toHaveLength(1);
    expect(e.operations()[0]!.state).toBe('done');
  });

  it('knows Wi-Fi from mobile data, and tells only when that changes', () => {
    const m = new ConnectivityMonitor();
    const seen: boolean[] = [];
    m.subscribeKind((u) => seen.push(u));
    m.setUnmetered(true);
    m.setUnmetered(true);
    m.setUnmetered(false);
    expect(seen).toEqual([true, false]);
    expect(m.unmetered).toBe(false);
  });
});

describe('MediaCache', () => {
  beforeEach(() => fs.__files.clear());

  it('fetches only what it does not keep, keyed by attachment id, in batches the server accepts', async () => {
    fs.File.__put('cache/media/u_u1/a1.img', 10);
    const asked: string[][] = [];
    const cache = MediaCache.forMember('u1', {
      links: async (ids) => {
        asked.push(ids);
        return ids.map((id) => ({ id, url: `https://signed/${id}?sig=${Math.random()}`, mimeType: 'image/jpeg' }));
      },
      download: async (_url, dest) => fs.File.__put(dest.uri, 1000),
    });
    const ids = ['a1', ...Array.from({ length: 150 }, (_, i) => `b${i}`)];
    const fetched = await cache.prefetch(ids);
    expect(fetched).toBe(150);
    expect(asked.map((b) => b.length)).toEqual([100, 50]);
    expect(asked.flat()).not.toContain('a1');
    expect(cache.uriFor('b7')).toBe('cache/media/u_u1/b7.img');
    expect(cache.uriFor('missing')).toBeNull();
  });

  it('stops when told to (Wi-Fi gone), and trims the oldest photos past the cap', async () => {
    let calls = 0;
    const cache = MediaCache.forMember('u1', {
      links: async (ids) => ids.map((id) => ({ id, url: 'u', mimeType: 'image/jpeg' })),
      download: async (_url, dest) => {
        calls++;
        fs.File.__put(dest.uri, MEDIA_CACHE_MAX_BYTES / 2);
      },
    });
    await cache.prefetch(['x1', 'x2', 'x3', 'x4'], () => calls < 3);
    expect(calls).toBe(3);
    // Three halves of the cap: the oldest goes.
    expect(cache.uriFor('x1')).toBeNull();
    expect(cache.uriFor('x3')).not.toBeNull();
    expect(cache.sizeBytes()).toBeLessThanOrEqual(MEDIA_CACHE_MAX_BYTES);
  });
});
