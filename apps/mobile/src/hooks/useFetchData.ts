import { useState, useCallback, useRef } from 'react';

interface UseFetchDataOptions<T> {
  /** Function that performs the API call(s) and returns data */
  fetcher: () => Promise<T>;
  /** Initial data value (default: undefined) */
  initialData?: T;
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
 * - Fetch deduplication via ref
 * - 401 errors (silently ignored — auth context handles redirect)
 */
export function useFetchData<T>({
  fetcher,
  initialData,
}: UseFetchDataOptions<T>): UseFetchDataResult<T> {
  const [data, setData] = useState<T | undefined>(initialData);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const load = useCallback(
    async (showRefresh: boolean) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      try {
        if (showRefresh) setIsRefreshing(true);
        else setIsLoading(true);
        setError(null);

        const result = await fetcher();
        setData(result);
      } catch (err: any) {
        // 401 = session expired; auth context handles redirect
        if (err?.statusCode === 401 || err?.message?.includes('Session expired')) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        fetchingRef.current = false;
      }
    },
    [fetcher],
  );

  const fetchData = useCallback(() => load(false), [load]);
  const refresh = useCallback(() => load(true), [load]);

  return { data, isLoading, isRefreshing, error, fetchData, refresh, setData };
}
