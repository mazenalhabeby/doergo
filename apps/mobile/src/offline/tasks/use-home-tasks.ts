import { useCallback, useEffect, useRef, useState } from 'react';
import { tasksApi } from '../../lib/api/tasks';
import type { Task } from '../../lib/api/types';
import { useConnectivity, useOffline, useSyncStatus } from '../offline-context';
import { overlayTask } from './overlay';

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
export interface HomeTasks {
  tasks: Task[];
  /**
   * When the phone's copy was last brought up to date, for `FreshnessLabel` —
   * null while the list came straight from the server.
   */
  updatedAt: number | null;
  /**
   * Load the list. Falls back to the phone rather than failing; anything that
   * is not a missing network (a 401, a refusal) still throws, so the screens
   * keep handling those exactly as they did.
   */
  load: () => Promise<void>;
}

export function useHomeTasks(): HomeTasks {
  const offline = useOffline();
  const connectivity = useConnectivity();
  const { operations } = useSyncStatus();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  // Whether what is on screen came from the phone — a server list must not be
  // silently swapped for an older local one when the queue happens to move.
  const fromPhone = useRef(false);

  const readLocal = useCallback(async () => {
    const records = offline.records;
    if (!records) return false;
    // A phone that has never pulled has nothing to show; its first load still
    // comes from the server.
    const { lastPullAt } = await records.cursor('tasks');
    if (lastPullAt === null) return false;
    const rows = await records.list<Task>('tasks');
    const ops = offline.engine?.operations() ?? [];
    setTasks(rows.map((r) => overlayTask(r.data, ops)) as Task[]);
    setUpdatedAt(lastPullAt);
    fromPhone.current = true;
    return true;
  }, [offline.records, offline.engine]);

  const load = useCallback(async () => {
    if (await readLocal()) {
      if (connectivity === 'online') void offline.engine?.pull('tasks').catch(() => undefined);
      return;
    }
    const fetched = await tasksApi.list();
    fromPhone.current = false;
    setUpdatedAt(null);
    setTasks(fetched || []);
  }, [readLocal, connectivity, offline.engine]);

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

  return { tasks, updatedAt, load };
}
