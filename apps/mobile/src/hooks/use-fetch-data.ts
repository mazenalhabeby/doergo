import { useState, useCallback, useRef } from 'react';
import { caught } from '../lib/caught';

interface UseFetchDataOptions<T> {
  /** Function that performs the API call(s) and returns data */
  fetcher: () => Promise<T>;
  /** Initial data value (default: undefined) */
  initialData?: T;
  /**
   * Drop a call while another is in flight (default true). Screens whose
   * focus/live refresh and pull-to-refresh each ask the server set it false:
   * every trigger is a request, as it was before they used this hook.
   */
  dedupe?: boolean;
  /** A 401 is left to the auth context: no error, data untouched (default true). */
  ignore401?: boolean;
  /**
   * Called on a failure (after the error state is set). Return a value to show
   * as the data — e.g. `(cur) => cur ?? []` so a first failure is an empty list
   * rather than an endless loading line; return undefined to leave it.
   */
  onError?: (err: unknown, current: T | undefined) => T | undefined;
}

interface UseFetchDataResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  /** Call to load data (initial load or retry). Sets isLoading=true. */
  fetchData: () => Promise<void>;
  /** Call on pull-to-refresh. Sets isRefreshing=true instead of isLoading. */
  refresh: () => Promise<void>;
  /** Manually set data (e.g. after a mutation) */
  setData: React.Dispatch<React.SetStateAction<T | undefined>>;
}

/**
 * Generic data-fetching hook that encapsulates the common
 * loading → data | error pattern used across screens.
 *
 * Handles:
 * - Loading / refreshing / error states
 * - Fetch deduplication via ref (unless `dedupe: false`)
 * - 401 errors (silently ignored — auth context handles redirect; unless `ignore401: false`)
 */
export function useFetchData<T>({
  fetcher,
  initialData,
  dedupe = true,
  ignore401 = true,
  onError,
}: UseFetchDataOptions<T>): UseFetchDataResult<T> {
  const [data, setData] = useState<T | undefined>(initialData);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);
  const latestOnError = useRef(onError);
  latestOnError.current = onError;
  // The data as last rendered — what `onError` sees. Not an updater: a toast inside one runs twice.
  const dataRef = useRef(data);
  dataRef.current = data;

  const load = useCallback(
    async (showRefresh: boolean) => {
      if (dedupe && fetchingRef.current) return;
      fetchingRef.current = true;

      try {
        if (showRefresh) setIsRefreshing(true);
        else setIsLoading(true);
        setError(null);

        const result = await fetcher();
        setData(result);
      } catch (err: unknown) {
        // 401 = session expired; auth context handles redirect
        if (ignore401 && (caught(err).statusCode === 401 || caught(err).message?.includes('Session expired'))) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to load data');
        const next = latestOnError.current?.(err, dataRef.current);
        if (next !== undefined) setData(next);
      } finally {
        if (dedupe) {
          setIsLoading(false);
          setIsRefreshing(false);
        } else if (showRefresh) {
          // Several may be in flight: each clears only the flag it set, so a
          // focus load finishing first does not stop a pull's spinner.
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
        fetchingRef.current = false;
      }
    },
    [fetcher, dedupe, ignore401],
  );

  const fetchData = useCallback(() => load(false), [load]);
  const refresh = useCallback(() => load(true), [load]);

  return { data, isLoading, isRefreshing, error, fetchData, refresh, setData };
}
