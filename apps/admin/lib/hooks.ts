'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, isAbort } from './api/client';

/**
 * Busy / error / reload for an action — the one copy of a try/finally that
 * used to be written per panel.
 *
 *   const { busy, run } = useAction(onError);
 *   run('suspend:' + id, () => orgsApi.suspend(id), reload);
 *
 * `busy` is the key of the action in flight (so one row's button spins, not
 * all of them). Failures go to `onError` as a sentence; the returned promise
 * resolves to the action's result, or undefined when it failed.
 */
export function useAction(onError: (message: string) => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(key: string, action: () => Promise<T>, after?: () => unknown): Promise<T | undefined> => {
      setBusy(key);
      try {
        const result = await action();
        await after?.();
        return result;
      } catch (e) {
        if (!isAbort(e)) onError(errorMessage(e));
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [onError],
  );
  return { busy, run };
}

/** `value`, settled for `ms` — the org search waits for the operator to stop typing. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/**
 * Run `load(signal)` whenever `deps` change, aborting the previous run — a
 * slower answer to an older search can never overwrite a newer one.
 */
export function useAbortableEffect(load: (signal: AbortSignal) => Promise<void>, deps: unknown[]) {
  const ref = useRef(load);
  ref.current = load;
  useEffect(() => {
    const ctrl = new AbortController();
    ref.current(ctrl.signal).catch(() => undefined);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
