import { useCallback, useEffect, useRef, useState } from 'react';
import { tasksApi } from '../../lib/api/tasks';
import type { Task } from '../../lib/api/types';
import { connectivity } from '../connectivity';
import { useOffline, useSyncStatus } from '../offline-context';
import type { OutboxOp } from '../outbox/types';
import type { RecordRow } from '../db/records-store';
import { listFailureIsFatal } from './list-failure';
import { overlayTask } from './overlay';

/**
 * ⚠️ A PULL THIS RECENT IS NOT WORTH ANOTHER.
 *
 * Every pull's last page carries the whole scope's membership (`scopeIds` —
 * 138 ids, ~4 KB, for an admin) whether anything changed or not, and the home
 * used to pull on every focus AND once a minute AND twice per trigger (My work
 * and Today's route each read this hook). A job created elsewhere reaches the
 * phone through the socket poke (`socket-poke.ts`) in seconds, so a focus that
 * lands inside this window re-reads the phone's copy and asks nothing.
 * Pull-to-refresh on the home is explicit and pulls regardless.
 */
export const HOME_PULL_GAP_MS = 30_000;

/**
 * What the rows on screen ARE, as one string — so a pull that brought nothing
 * new does not hand every card a new array.
 *
 * ⚠️ A NEW ARRAY IS A NEW EVERYTHING. `tasks` feeds every `useMemo` in My work
 * and Today's route; an identical list with a fresh identity re-sorted the
 * week, re-derived the day's stops and redrew the route's SVG on every pull,
 * including the empty ones. The tasks scope is written only by pulls, and every
 * server-side change moves `updatedAt`, so id + both timestamps + status is the
 * whole of what can differ; the queued operations about these rows are the rest.
 */
export function homeTasksSignature(rows: readonly RecordRow<Task>[], ops: readonly OutboxOp[]): string {
  const ids = new Set<string>();
  const parts: string[] = [];
  for (const r of rows) {
    ids.add(r.id);
    const d = r.data as unknown as { updatedAt?: string | null; status?: string };
    parts.push(`${r.id}:${r.serverUpdatedAt ?? ''}:${d?.updatedAt ?? ''}:${d?.status ?? ''}`);
  }
  for (const o of ops) if (o.entityId && ids.has(o.entityId)) parts.push(`${o.id}:${o.state}`);
  return parts.join('|');
}

/**
 * The home screens' task list — from the phone's copy whenever it has one,
 * from the server otherwise.
 *
 * Every home variant fetched `tasksApi.list()` directly and had no fallback,
 * so with no signal the ONE unguarded call on the screen threw and the whole
 * dashboard became "Request timed out" with a retry button that could not
 * succeed. Everything else on those screens already degrades quietly (the
 * shift comes from `useShift`, the rest is `.catch(() => [])`), so this was
 * the only thing standing between a member in a basement and their day.
 *
 * Deliberately the same reader as the Tasks tab: the phone's rows with the
 * member's unsent changes laid on top, re-read when a pull lands or the queue
 * moves, and a pull kicked off in the background while there is a connection.
 * Two screens showing the same jobs must not disagree about them.
 */
interface HomeTasks {
  tasks: Task[];
  /**
   * When the phone's copy was last brought up to date, for `FreshnessLabel` —
   * null while the list came straight from the server.
   */
  updatedAt: number | null;
  /**
   * A list is on screen — from the phone or the server, empty or not.
   *
   * ⚠️ NOT `tasks.length > 0`. An empty copy is an answer ("nothing
   * scheduled"); no copy yet is not, and a card that cannot tell them apart
   * says "Nothing scheduled today" to somebody whose jobs are still opening.
   */
  loaded: boolean;
  /**
   * Load the list. Falls back to the phone rather than failing; anything that
   * is not a missing network (a 401, a refusal) still throws, so the screens
   * keep handling those exactly as they did.
   *
   * Resolves to `loaded` — ⚠️ false when nothing answered but the phone's
   * database is still opening: the copy is on its way, and "loaded" now would
   * be a claim about a list nobody has read.
   */
  load: () => Promise<boolean>;
}

export function useHomeTasks(): HomeTasks {
  const offline = useOffline();
  const { operations } = useSyncStatus();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Whether what is on screen came from the phone — a server list must not be
  // silently swapped for an older local one when the queue happens to move.
  const fromPhone = useRef(false);
  // The server has answered at least once: it is fresher than anything the
  // phone holds, so the copy arriving late must not overwrite it.
  const fromServer = useRef(false);
  // Anything at all has been rendered, from either source.
  const shown = useRef(false);
  // What is on screen, as `homeTasksSignature` — see there.
  const shownSig = useRef<string | null>(null);
  // When the server last answered the fallback — see HOME_PULL_GAP_MS.
  const serverAt = useRef(0);

  /** The phone's copy, or null when it has none; its `lastPullAt` when it does. */
  const readLocal = useCallback(async (): Promise<number | null> => {
    const records = offline.records;
    if (!records) return null;
    // A phone that has never pulled has nothing to show; its first load still
    // comes from the server.
    const { lastPullAt } = await records.cursor('tasks');
    if (lastPullAt === null) return null;
    const rows = await records.list<Task>('tasks');
    const ops = offline.engine?.operations() ?? [];
    const sig = homeTasksSignature(rows, ops);
    if (sig !== shownSig.current) {
      shownSig.current = sig;
      setTasks(rows.map((r) => overlayTask(r.data, ops)) as Task[]);
    }
    setUpdatedAt(lastPullAt);
    fromPhone.current = true;
    shown.current = true;
    setLoaded(true);
    return lastPullAt;
  }, [offline.records, offline.engine]);

  /*
    ⚠️ `load` IS STABLE ACROSS CONNECTIVITY, AND THAT IS A FIX. It used to list
    `connectivity` and `offline.starting` among its dependencies, so every
    change of signal — and the database finishing opening — gave it a new
    identity, and every focus effect keyed on it (My work's, Today's route's)
    ran again: a reconnect became two more pulls on top of the provider's own
    `syncAll`, racing its flush. The signal is read when `load` runs; the
    reconnect itself is the provider's (flush, THEN pull), and this hook hears
    the pull land through `onChange` below.
  */
  const starting = useRef(offline.starting);
  starting.current = offline.starting;
  const load = useCallback(async () => {
    const pulledAt = await readLocal();
    if (pulledAt !== null) {
      const stale = Date.now() - pulledAt >= HOME_PULL_GAP_MS;
      if (stale && connectivity.state === 'online') void offline.engine?.pull('tasks').catch(() => undefined);
      return true;
    }
    /*
      ⚠️ THE SAME GAP FOR THE SERVER PATH. With offline mode off there is no
      copy and every load is two list requests of up to 500 jobs each — on
      every focus and every resume. An answer this recent is the answer.
    */
    if (fromServer.current && Date.now() - serverAt.current < HOME_PULL_GAP_MS) return true;
    try {
      /*
        ⚠️ NO REQUEST WHEN THERE IS NO NETWORK. NetInfo says nothing can reach
        the server, so the two list requests below could only fail (after a
        retry) — the answer is the same "unreachable", without spending them.
      */
      if (connectivity.state === 'offline') throw Object.assign(new Error('offline'), { statusCode: 0 });
      const fetched = await serverFallback();
      fromPhone.current = false;
      fromServer.current = true;
      serverAt.current = Date.now();
      shown.current = true;
      shownSig.current = null;
      setUpdatedAt(null);
      setTasks(fetched || []);
      setLoaded(true);
      return true;
    } catch (err) {
      // Whether this is worth the whole screen is one rule, stated once.
      if (!listFailureIsFatal(err, { shown: shown.current, databaseStarting: starting.current })) return shown.current;
      throw err;
    }
  }, [readLocal, offline.engine]);

  /*
    The database opens asynchronously, so a cold start reaches `load()` before
    `offline.records` exists, takes the server path, and nothing ever sends it
    back: the home's initial fetch is guarded by a ref, and the re-read below
    only fires once something has been read from the phone. Read the copy the
    moment it arrives — unless the server already answered, which is fresher.
  */
  useEffect(() => {
    if (!offline.records || fromPhone.current || fromServer.current) return;
    void readLocal();
  }, [offline.records, readLocal]);

  // The copy changed (a pull landed) or a queued change moved: re-read, no request.
  useEffect(() => {
    if (!offline.records) return;
    return offline.records.onChange((scope) => {
      if (scope === 'tasks' && fromPhone.current) void readLocal();
    });
  }, [offline.records, readLocal]);

  useEffect(() => {
    if (fromPhone.current) void readLocal();
  }, [operations, readLocal]);

  return { tasks, updatedAt, loaded, load };
}

/**
 * What the home reads from the SERVER when the phone has no copy yet
 * (offline mode off, or a cold start before the first pull).
 *
 * ⚠️ NOT `tasksApi.list()` bare: that is page 1 — 20 of an organization's
 * hundreds for anyone who oversees the work — so My work and Today's route
 * counted a page, not the day. Two narrow questions instead, merged:
 *   • the caller's own work, whatever its date (carried-over and undated jobs);
 *   • this week, Monday to Sunday — what the week strip can select, including
 *     a supervisor's team rows (the server narrows it to what they may see).
 * Both capped at the server's maximum page.
 */
async function serverFallback(): Promise<Task[]> {
  const monday = startOfWeekMonday(new Date());
  const nextMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
  const [mine, week] = await Promise.all([
    tasksApi.list({ assignedToMe: true, limit: 500 }),
    tasksApi.list({ startDate: monday.toISOString(), endDate: new Date(nextMonday.getTime() - 1).toISOString(), limit: 500 }),
  ]);
  const byId = new Map<string, Task>();
  for (const t of [...(mine || []), ...(week || [])]) byId.set(t.id, t);
  return [...byId.values()];
}

/** Local Monday 00:00 — calendar arithmetic, so a DST week is still seven days. */
function startOfWeekMonday(d: Date): Date {
  const back = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
}
