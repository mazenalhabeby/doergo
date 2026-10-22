import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/contexts/auth-context';
import { useSocketContext } from '@/contexts/socket-context';
import { SocketEvents } from '@/lib/socket';
import { tasksApi, type Task, type TasksListParams } from '@/lib/api';
import { useConnectivity, useOffline, useSyncStatus } from '@/offline/offline-context';
import { filterTasksLocally } from '@/offline/tasks/task-list-query';
import { overlayTask } from '@/offline/tasks/overlay';
import { periodParams, type Period } from './jobs-logic';
import { caught } from '@/lib/caught';

export type ListTask = Task & { pendingSync?: boolean };

/**
 * The Jobs tab's rows — the SAME data path the tab always had, lifted out of
 * the screen so the screen only draws.
 *
 *  - From the phone's copy whenever it can answer (`offline.records` →
 *    `overlayTask` with the member's unsent changes → `filterTasksLocally`),
 *    and a pull in the background brings it up to date; the copy re-reads
 *    itself when that lands (`records.onChange`) or the outbox moves.
 *  - History reaches further back than the phone keeps, so it asks the server
 *    while there is one. A phone that never pulled asks the server too.
 *  - Server: `tasksApi.list` with `limit: 100`, narrowed by the SERVER to the
 *    reader's own work in Mine (`assignedToMe`) — the list is paged, so
 *    narrowing here would narrow the page, not the work.
 *  - Sockets only without the engine: with it, `OfflineSocketPoke` pulls for
 *    the whole app and the copy's own change event re-reads this list.
 */
export function useJobsList(input: { period: Period; search: string; oversee: boolean; mineOnly: boolean }) {
  const { period, search, oversee, mineOnly } = input;
  const { user } = useAuth();
  const { t } = useTranslation();
  const offline = useOffline();
  const connectivity = useConnectivity();
  const { operations: outbox } = useSyncStatus();

  const [tasks, setTasks] = useState<ListTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** When the phone's copy was last brought up to date — shown while the list comes from it. */
  const [localUpdatedAt, setLocalUpdatedAt] = useState<number | null>(null);
  const [counts, setCounts] = useState<{ mine: number | null; all: number | null }>({ mine: null, all: null });

  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const initialFetchDoneRef = useRef(false);
  const fetchingRef = useRef(false);
  const lastFetchTimeRef = useRef(0);
  const lastParamsRef = useRef<TasksListParams | null>(null);

  /** The list from the phone's copy, with the member's unsent changes on top. */
  const readLocalTasks = useCallback(
    async (params: TasksListParams) => {
      if (!offline.records) return;
      lastParamsRef.current = params;
      void offline.records
        .cursor('tasks')
        .then((c) => setLocalUpdatedAt(c.lastPullAt))
        .catch(() => undefined);
      const rows = await offline.records.list<Task>('tasks');
      const ops = offline.engine?.operations() ?? [];
      const visible = filterTasksLocally(
        rows.map((r) => overlayTask(r.data, ops)),
        params,
        user?.id,
      );
      setTasks(visible as ListTask[]);
    },
    [offline.records, offline.engine, user?.id],
  );

  // The copy changed (a pull landed) or a queued change moved: re-read, no request.
  useEffect(() => {
    if (!offline.records) return;
    return offline.records.onChange((scope) => {
      if (scope === 'tasks' && lastParamsRef.current) void readLocalTasks(lastParamsRef.current);
    });
  }, [offline.records, readLocalTasks]);
  useEffect(() => {
    if (lastParamsRef.current) void readLocalTasks(lastParamsRef.current);
  }, [outbox, readLocalTasks]);

  const fetchTasks = useCallback(
    async (showRefresh = false) => {
      if (fetchingRef.current && !showRefresh) return;
      try {
        fetchingRef.current = true;
        lastFetchTimeRef.current = Date.now();
        if (showRefresh) setIsRefreshing(true);
        else setIsLoading(true);
        setError(null);

        const params: TasksListParams = {
          ...periodParams(period),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(oversee && mineOnly ? { assignedToMe: true } : {}),
          limit: 100,
        };

        if (offline.records && offline.engine) {
          const { lastPullAt } = await offline.records.cursor('tasks');
          const useLocal = lastPullAt !== null && (period !== 'history' || connectivity !== 'online');
          if (useLocal) {
            await readLocalTasks(params);
            if (connectivity === 'online') void offline.engine.pull('tasks').catch(() => undefined);
            return;
          }
        }

        const fetched = await tasksApi.list(params);
        setLocalUpdatedAt(null);
        setTasks((fetched || []) as ListTask[]);
      } catch (err: unknown) {
        if (caught(err).statusCode === 401 || caught(err).message?.includes('Session expired')) return;
        setError(err instanceof Error ? err.message : t('tasks.failedToLoad'));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        fetchingRef.current = false;
      }
    },
    [period, debouncedSearch, oversee, mineOnly, offline.records, offline.engine, connectivity, readLocalTasks, t],
  );

  /*
    The badges, from the server — both counts in ONE cached reply, because the
    list is paged and counting rows the app has not fetched is the only way a
    badge can be true. Asked only for somebody who has a scope to switch.
  */
  const refreshCounts = useCallback(async () => {
    if (!oversee) return;
    try {
      const c = await tasksApi.counts();
      setCounts({ mine: c?.mine ?? null, all: c?.all ?? null });
    } catch {
      // A badge that could not be fetched simply shows no number.
      setCounts({ mine: null, all: null });
    }
  }, [oversee]);

  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    void fetchTasks();
  }, [fetchTasks]);

  // Period, search or scope changed (after the first load).
  useEffect(() => {
    if (!initialFetchDoneRef.current) return;
    void fetchTasks();
  }, [period, debouncedSearch, mineOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // Counts follow the list: a decision made on one screen changes both numbers.
  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts, tasks.length]);

  // Back on the tab — throttled to one fetch per 30 s.
  useFocusEffect(
    useCallback(() => {
      if (!initialFetchDoneRef.current) return;
      if (Date.now() - lastFetchTimeRef.current < 30000) return;
      void fetchTasks();
    }, [fetchTasks]),
  );

  const { isConnected, subscribe } = useSocketContext();
  const socketDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isConnected || offline.engine) return;
    const debouncedFetch = () => {
      if (socketDebounceRef.current) clearTimeout(socketDebounceRef.current);
      socketDebounceRef.current = setTimeout(() => void fetchTasks(), 2000);
    };
    const unsubs = [
      subscribe(SocketEvents.TASK_ASSIGNED, debouncedFetch),
      subscribe(SocketEvents.TASK_STATUS_CHANGED, debouncedFetch),
      subscribe(SocketEvents.TASK_CREATED, debouncedFetch),
      subscribe(SocketEvents.TASK_UPDATED, debouncedFetch),
    ];
    return () => {
      unsubs.forEach((fn) => fn());
      if (socketDebounceRef.current) clearTimeout(socketDebounceRef.current);
    };
  }, [isConnected, subscribe, fetchTasks, offline.engine]);

  /** Pull to refresh means "sync now": send what waits, then bring the copy up to date. */
  const refresh = useCallback(async () => {
    if (offline.engine && connectivity === 'online') {
      setIsRefreshing(true);
      try {
        await offline.engine.syncAll();
      } finally {
        setIsRefreshing(false);
      }
    }
    return fetchTasks(true);
  }, [offline.engine, connectivity, fetchTasks]);

  return { tasks, isLoading, isRefreshing, error, localUpdatedAt, counts, fetchTasks, refresh };
}
