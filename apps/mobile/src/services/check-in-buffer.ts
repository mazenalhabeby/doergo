/**
 * Location check-ins kept while the phone has no signal.
 *
 * During a shift the phone reports where it is every so often, and the server
 * uses it to notice somebody leaving the site. Without signal those reports
 * used to be dropped — so a trip out and back at a site with no coverage left
 * no trace, and the first report after reconnecting was judged with nothing
 * before it. Now a report that cannot reach the server is kept here, with the
 * moment it was taken, and the kept ones go first, together, the next time
 * anything gets through (the server replays them as periods — see
 * heartbeat-replay.ts on the server).
 *
 * Built on injected storage and sending, so the rules are tested without a
 * phone.
 *
 * ⚠️ KEYED BY THE MEMBER WHOSE SESSION IT IS. A check-in is where somebody was.
 * One device-wide list meant member A's dead-zone check-ins were sent — with
 * B's token — the moment B signed in on the same phone, and filed as B's
 * movements. Each member has their own list now, only the session's owner is
 * ever read or sent, and the end of a session forgets them all (`forgetAll`).
 */

export interface KeptCheckIn {
  lat: number;
  lng: number;
  accuracy?: number;
  /** When the fix was taken (ISO 8601). */
  recordedAt: string;
}

interface CheckInBufferDeps {
  storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
    getAllKeys?(): Promise<readonly string[]>;
    multiRemove?(keys: readonly string[]): Promise<void>;
  };
  /** Whose session this is (the token's `sub`); null = nobody, and nothing is kept or sent. */
  owner(): Promise<string | null>;
  send(points: KeptCheckIn[]): Promise<void>;
  /** True for "no network"; anything else is the server refusing, and retrying will not help. */
  isUnreachable(err: unknown): boolean;
  now?: () => number;
}

/** The old device-wide list — never read again, only removed. */
export const CHECK_IN_BUFFER_KEY = 'attendance_kept_check_ins_v1';
/** One member's list. */
export const checkInBufferKey = (userId: string) => `${CHECK_IN_BUFFER_KEY}:${userId}`;
/** A day of check-ins at the slowest cadence, with room; the oldest go first. */
export const MAX_KEPT = 300;
/** Older than a day, a check-in describes no shift anybody is still reviewing live. */
export const MAX_KEPT_AGE_MS = 24 * 60 * 60 * 1000;

export function createCheckInBuffer(deps: CheckInBufferDeps) {
  const now = deps.now ?? Date.now;
  let flushing: Promise<boolean> | null = null;

  async function load(owner: string): Promise<KeptCheckIn[]> {
    try {
      const raw = await deps.storage.getItem(checkInBufferKey(owner));
      const parsed = raw ? (JSON.parse(raw) as KeptCheckIn[]) : [];
      const cutoff = now() - MAX_KEPT_AGE_MS;
      return Array.isArray(parsed)
        ? parsed.filter((p) => typeof p?.lat === 'number' && typeof p?.lng === 'number' && Date.parse(p.recordedAt) >= cutoff)
        : [];
    } catch {
      return [];
    }
  }

  async function save(owner: string, points: KeptCheckIn[]): Promise<void> {
    try {
      if (points.length === 0) await deps.storage.removeItem(checkInBufferKey(owner));
      else await deps.storage.setItem(checkInBufferKey(owner), JSON.stringify(points.slice(-MAX_KEPT)));
    } catch {
      /* the next check-in tries again */
    }
  }

  return {
    /** Keep one check-in that could not be sent. */
    async keep(point: KeptCheckIn): Promise<void> {
      const owner = await deps.owner().catch(() => null);
      // Nobody signed in: a check-in with nobody to send it as is not kept.
      if (!owner) return;
      const points = await load(owner);
      points.push(point);
      await save(owner, points);
    },

    /**
     * Send what is kept. True when nothing is left waiting — the caller then
     * sends its live check-in, which the server judges after the history.
     */
    flush(): Promise<boolean> {
      if (flushing) return flushing;
      flushing = (async () => {
        const owner = await deps.owner().catch(() => null);
        if (!owner) return true;
        const points = await load(owner);
        if (points.length === 0) return true;
        try {
          await deps.send(points);
          await save(owner, []);
          return true;
        } catch (err) {
          if (deps.isUnreachable(err)) {
            await save(owner, points);
            return false;
          }
          // Refused (an older server without the route, a shift already closed):
          // these points will never be accepted, and keeping them would block the rest.
          await save(owner, []);
          return true;
        }
      })().finally(() => {
        flushing = null;
      });
      return flushing;
    },

    async count(): Promise<number> {
      const owner = await deps.owner().catch(() => null);
      return owner ? (await load(owner)).length : 0;
    },

    /** The end of a session: every member's kept check-ins, and the old shared list, go. */
    async forgetAll(): Promise<void> {
      try {
        const all = (await deps.storage.getAllKeys?.()) ?? [];
        const drop = [CHECK_IN_BUFFER_KEY, ...all.filter((k) => k.startsWith(`${CHECK_IN_BUFFER_KEY}:`))];
        if (deps.storage.multiRemove) await deps.storage.multiRemove(drop);
        else for (const k of drop) await deps.storage.removeItem(k);
      } catch {
        /* best effort — the next session reads only its own key anyway */
      }
    },
  };
}
