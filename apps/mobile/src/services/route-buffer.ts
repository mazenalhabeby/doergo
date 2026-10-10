/**
 * Route points held without signal — in SMALL keys, appended, never rewritten whole.
 *
 * ⚠️ They were ONE AsyncStorage value per member: every burst that could not be
 * delivered read the whole list, parsed it, added a few points and wrote it all
 * back — up to 5,000 points, ~400 KB of JSON, every 30 seconds through a
 * tunnel or a dead zone, from a headless background task. The list is now
 * chunks of at most CHUNK_POINTS points plus a small index:
 *
 *   route_pending_bursts:{owner}:index   → [{ id, n, taskId, oldest, newest }]
 *   route_pending_bursts:{owner}:{id}    → { taskId, points }
 *
 * A burst tops up the LAST chunk while it has room and the same task (one
 * write of ≤ CHUNK_POINTS points + the index), or starts a new one. Sending
 * walks the chunks oldest first and deletes each as it lands. The index alone
 * answers "how many" and "how old", so trimming and ageing read no points.
 *
 * Why not the offline engine's SQLite: it is encrypted and opened per member
 * by the React tree; the route tracker runs as a headless task that may start
 * with no tree at all, and a second connection to that database is exactly the
 * failure the offline engine once died of. AsyncStorage needs no database
 * connection — and on the phone every value is SEALED (lib/secure-buffer.ts:
 * AES-256-GCM, a per-member key in SecureStore readable after first unlock).
 *
 * Every key starts `route_pending_bursts:` so sign-out's sweep removes them all.
 * The old single-value list (`route_pending_bursts:{owner}`) is read once and
 * folded in, so nothing held across the update is lost.
 */

export interface FlushPoint {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: string;
}

/** A burst of points waiting for a working connection. */
export interface PendingBurst {
  taskId?: string;
  points: FlushPoint[];
}

export interface KV {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
  removeItem(k: string): Promise<void>;
  multiRemove?(ks: string[]): Promise<void>;
}

interface IndexEntry {
  id: string;
  /** Points in the chunk. */
  n: number;
  taskId?: string;
  /** Epoch ms of the chunk's oldest and newest stamped point (NaN-free: null when none is stamped). */
  oldest: number | null;
  newest: number | null;
}

export const PENDING_PREFIX = 'route_pending_bursts';
/*
  ⚠️ 50, NOT 200, SINCE THE CHUNKS ARE SEALED. A top-up opens and re-seals the
  whole chunk, and AES-GCM in JavaScript on Hermes costs ~0.1 ms per point
  (measured on the Hermes VM: 200 points ≈ 17–22 ms each way, 50 ≈ 5–6 ms).
  Chunks of up to 200 written by an older version are still read as they are.
*/
export const CHUNK_POINTS = 50;

const legacyKey = (owner: string) => `${PENDING_PREFIX}:${owner}`;
const indexKey = (owner: string) => `${PENDING_PREFIX}:${owner}:index`;
const chunkKey = (owner: string, id: string) => `${PENDING_PREFIX}:${owner}:${id}`;

const stampOf = (p: FlushPoint) => {
  const t = p.timestamp ? Date.parse(p.timestamp) : NaN;
  return Number.isNaN(t) ? null : t;
};
function span(points: FlushPoint[]): { oldest: number | null; newest: number | null } {
  let oldest: number | null = null;
  let newest: number | null = null;
  for (const p of points) {
    const t = stampOf(p);
    if (t === null) continue;
    if (oldest === null || t < oldest) oldest = t;
    if (newest === null || t > newest) newest = t;
  }
  return { oldest, newest };
}

/**
 * `kv` is one store for everybody, or — on the phone — a SEALED store per
 * member (`secureStorage`, lib/secure-buffer.ts), so the points are encrypted
 * at rest and only the owner's key opens them.
 */
export function createRouteBuffer(store: KV | ((owner: string) => KV), opts: {
  maxPoints: number;
  maxAgeMs: number;
  now?: () => number;
  newId?: () => string;
}) {
  const now = opts.now ?? (() => Date.now());
  const kvOf = (owner: string): KV => (typeof store === 'function' ? store(owner) : store);
  let seq = 0;
  const newId = opts.newId ?? (() => `${now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`);

  async function readIndex(owner: string): Promise<IndexEntry[]> {
    try {
      const raw = await kvOf(owner).getItem(indexKey(owner));
      const parsed = raw ? (JSON.parse(raw) as IndexEntry[]) : [];
      return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.id === 'string' && e.n > 0) : [];
    } catch {
      return [];
    }
  }

  async function writeIndex(owner: string, index: IndexEntry[]): Promise<void> {
    if (index.length) await kvOf(owner).setItem(indexKey(owner), JSON.stringify(index));
    else await kvOf(owner).removeItem(indexKey(owner));
  }

  async function readChunk(owner: string, id: string): Promise<PendingBurst | null> {
    try {
      const raw = await kvOf(owner).getItem(chunkKey(owner, id));
      const parsed = raw ? (JSON.parse(raw) as PendingBurst) : null;
      return parsed && Array.isArray(parsed.points) ? parsed : null;
    } catch {
      return null;
    }
  }

  async function removeKeys(owner: string, keys: string[]): Promise<void> {
    if (!keys.length) return;
    const kv = kvOf(owner);
    if (kv.multiRemove) await kv.multiRemove(keys);
    else for (const k of keys) await kv.removeItem(k);
  }

  /** Drop chunks past the age limit and, past the ceiling, the OLDEST points — from the index, reading at most one chunk. */
  async function trim(owner: string, index: IndexEntry[]): Promise<IndexEntry[]> {
    const cutoff = now() - opts.maxAgeMs;
    const dead: string[] = [];
    let kept = index.filter((e) => {
      const old = e.newest !== null && e.newest < cutoff;
      if (old) dead.push(e.id);
      return !old;
    });
    let total = kept.reduce((n, e) => n + e.n, 0);
    while (total > opts.maxPoints && kept.length) {
      const first = kept[0]!;
      const excess = total - opts.maxPoints;
      if (first.n <= excess) {
        dead.push(first.id);
        total -= first.n;
        kept = kept.slice(1);
      } else {
        const chunk = await readChunk(owner, first.id);
        const points = (chunk?.points ?? []).slice(excess);
        await kvOf(owner).setItem(chunkKey(owner, first.id), JSON.stringify({ taskId: first.taskId, points }));
        kept = [{ ...first, n: points.length, ...span(points) }, ...kept.slice(1)];
        total -= excess;
      }
    }
    await removeKeys(owner, dead.map((id) => chunkKey(owner, id)));
    return kept;
  }

  /** The old single-value list, folded into chunks once. */
  async function migrateLegacy(owner: string, index: IndexEntry[]): Promise<IndexEntry[]> {
    let raw: string | null = null;
    try { raw = await kvOf(owner).getItem(legacyKey(owner)); } catch { return index; }
    if (raw === null) return index;
    let bursts: PendingBurst[] = [];
    try {
      const parsed = JSON.parse(raw) as PendingBurst[];
      bursts = Array.isArray(parsed) ? parsed.filter((b) => b?.points?.length) : [];
    } catch { /* unreadable — dropped */ }
    // Held before the update = older than anything chunked since: they go first.
    const before = await appendTo(owner, [], bursts);
    await kvOf(owner).removeItem(legacyKey(owner));
    return [...before, ...index];
  }

  /** Append bursts to an index (writing chunks), topping up the last chunk while it has room. */
  async function appendTo(owner: string, index: IndexEntry[], bursts: PendingBurst[]): Promise<IndexEntry[]> {
    const next = index.slice();
    for (const burst of bursts) {
      let points = burst.points.filter(Boolean);
      while (points.length) {
        const last = next[next.length - 1];
        if (last && last.taskId === burst.taskId && last.n < CHUNK_POINTS) {
          const room = CHUNK_POINTS - last.n;
          const add = points.slice(0, room);
          const chunk = await readChunk(owner, last.id);
          const merged = [...(chunk?.points ?? []), ...add];
          await kvOf(owner).setItem(chunkKey(owner, last.id), JSON.stringify({ taskId: burst.taskId, points: merged }));
          next[next.length - 1] = { ...last, n: merged.length, ...span(merged) };
          points = points.slice(room);
        } else {
          const add = points.slice(0, CHUNK_POINTS);
          const id = newId();
          await kvOf(owner).setItem(chunkKey(owner, id), JSON.stringify({ taskId: burst.taskId, points: add }));
          next.push({ id, n: add.length, taskId: burst.taskId, ...span(add) });
          points = points.slice(CHUNK_POINTS);
        }
      }
    }
    return next;
  }

  return {
    /** Hold bursts that could not be delivered. Never throws. */
    async append(owner: string, bursts: PendingBurst[]): Promise<void> {
      if (!bursts.some((b) => b.points.length)) return;
      try {
        let index = await migrateLegacy(owner, await readIndex(owner));
        index = await appendTo(owner, index, bursts);
        await writeIndex(owner, await trim(owner, index));
      } catch (err) {
        console.warn('[Route] Could not persist pending points:', err);
      }
    },

    /**
     * Send what is held, oldest first, chunk by chunk. `send` returns the
     * points still undelivered; the first chunk that comes back non-empty
     * stops the walk (the connection is down) and keeps the rest. Returns
     * whether EVERYTHING held was delivered.
     */
    async drain(owner: string, send: (burst: PendingBurst) => Promise<FlushPoint[]>, batchPoints = 500): Promise<boolean> {
      let index: IndexEntry[];
      try {
        index = await trim(owner, await migrateLegacy(owner, await readIndex(owner)));
      } catch {
        return false;
      }
      const cutoff = now() - opts.maxAgeMs;
      while (index.length) {
        // One request carries consecutive chunks of the same task, up to a batch — a long dead zone is a few requests, not one per chunk.
        const taskId = index[0]!.taskId;
        const group: IndexEntry[] = [];
        let size = 0;
        for (const e of index) {
          if (e.taskId !== taskId || (group.length && size + e.n > batchPoints)) break;
          group.push(e);
          size += e.n;
        }
        const points: FlushPoint[] = [];
        for (const e of group) {
          const chunk = await readChunk(owner, e.id);
          // A point past the age limit is not sent; one with no stamp is.
          for (const p of chunk?.points ?? []) { const t = stampOf(p); if (t === null || t >= cutoff) points.push(p); }
        }
        const left = points.length ? await send({ taskId, points }) : [];
        await removeKeys(owner, group.map((e) => chunkKey(owner, e.id)));
        index = index.slice(group.length);
        if (left.length) {
          // The undelivered tail goes back in front, in chunks, and the walk stops: the connection is down.
          const back = await appendTo(owner, [], [{ taskId, points: left }]);
          index = [...back, ...index];
          await writeIndex(owner, index);
          return false;
        }
        await writeIndex(owner, index);
      }
      return true;
    },

    /** How many points are held (index only). */
    async count(owner: string): Promise<number> {
      const index = await readIndex(owner);
      let legacy = 0;
      try {
        const raw = await kvOf(owner).getItem(legacyKey(owner));
        if (raw) legacy = (JSON.parse(raw) as PendingBurst[]).reduce((n, b) => n + (b?.points?.length ?? 0), 0);
      } catch { /* none */ }
      return index.reduce((n, e) => n + e.n, 0) + legacy;
    },

    /** Every held point, in order — for tests and diagnostics. */
    async all(owner: string): Promise<PendingBurst[]> {
      const index = await readIndex(owner);
      const out: PendingBurst[] = [];
      for (const e of index) {
        const c = await readChunk(owner, e.id);
        if (c?.points.length) out.push({ taskId: e.taskId, points: c.points });
      }
      return out;
    },
  };
}
