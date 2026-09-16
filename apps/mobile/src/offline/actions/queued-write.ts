import { useCallback } from 'react';
import { useOffline } from '../offline-context';
import type { SyncEngine } from '../sync-engine';
import type { ActionOutcome } from './outcome';

/**
 * Changing something that ALREADY EXISTS, with or without signal.
 *
 * The sibling of `useQueuedCreate`, and deliberately not the same hook: a
 * create names the record (the phone mints the id and the helper puts it where
 * the route reads it), while a change addresses one the server already knows.
 * There is nothing to name here — only a body, a route, and the question of
 * what it must arrive after.
 *
 * `run` takes the queued action and the API call the screen always made. On a
 * store binary without the offline layer (1.0.5 and older) there is no engine
 * and `direct` is what happens — so a screen needs ONE code path, not two, and
 * `queued-writes-guard.spec.ts` recognises the shape without being told about
 * each call site.
 */
export function useQueuedWrite() {
  const { engine } = useOffline();

  const run = useCallback(
    async (queued: (engine: SyncEngine) => Promise<ActionOutcome>, direct: () => Promise<unknown>): Promise<ActionOutcome> => {
      if (!engine) return { kind: 'done', response: await direct() };
      return queued(engine);
    },
    [engine],
  );

  return { run, engine };
}
