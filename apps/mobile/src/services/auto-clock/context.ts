import { sessionOwnerId } from '../../lib/api/client';
import { evidenceFix, getFix } from '../../lib/location-fix';
import { overlayShift } from '../../offline/attendance/shift-overlay';
import { loadShift } from '../../offline/attendance/load-shift';
import { liveEngineFor } from '../../offline/live-engine';
import { createOfflineRuntime } from '../../offline/runtime';
import type { RecordsStore } from '../../offline/db/records-store';
import type { SyncEngine } from '../../offline/sync-engine';
import { autoClockNotifier } from './notifications';
import { DEPARTURE_RELEVANT_MS, onRegionEvent, reevaluate, type AutoClockDeps } from './runner';
import { autoClockStore, type AutoClockState } from './store';

/**
 * Run automatic-clock work for whoever is signed in on this phone — from the
 * app, or from a task the OS woke with the app closed.
 *
 * ⚠️ ONLY THE TOKENS' OWNER. The member is the one the stored session belongs
 * to (`sessionOwnerId`), and their sealed store and outbox are the ones opened;
 * a phone handed to somebody else never files a step for the last person.
 *
 * The engine is the app's own when it is running (`live-engine.ts`); with the
 * app closed a runtime is built by the same factory the background sync uses,
 * and stopped again when the work is done.
 */
export async function withAutoClock(
  work: (deps: AutoClockDeps) => Promise<void>,
  opts: {
    worthIt?: (state: AutoClockState) => boolean;
    /** A runtime the caller already opened (the background sync) — used instead of opening another. */
    using?: { engine: SyncEngine; records: RecordsStore | null };
  } = {},
): Promise<void> {
  const userId = await sessionOwnerId().catch(() => null);
  if (!userId) return;
  const state = await autoClockStore.load(userId);
  if (!state.plan?.consentAt || !state.organizationId) return;
  if (opts.worthIt && !opts.worthIt(state)) return;

  const live = opts.using ?? liveEngineFor(userId);
  const runtime = live ? null : await createOfflineRuntime({ userId, organizationId: state.organizationId }).catch(() => null);
  const engine = live?.engine ?? runtime?.engine;
  const records = live?.records ?? runtime?.records ?? null;
  if (!engine) return;
  try {
    await work({
      userId,
      engine,
      store: autoClockStore,
      notifier: autoClockNotifier,
      now: () => new Date(),
      fix: async () => {
        try {
          return evidenceFix(await getFix({ purpose: 'evidence', orLastKnown: true }));
        } catch {
          return null;
        }
      },
      // The server when it answers, the phone's copy when not — with everything still queued laid over it.
      shift: async () => overlayShift(await loadShift(records, userId), engine.operations()).status,
    });
  } finally {
    if (runtime) await runtime.engine.stop();
  }
}

/** The geofence task: a workspace's area was entered or left. */
export function handleAutoRegionEvent(kind: 'enter' | 'exit', spaceId: string, at: Date): Promise<void> {
  return withAutoClock((deps) => onRegionEvent(deps, kind, spaceId, at)).catch(() => undefined);
}

/**
 * Any other wake — the heartbeat, a background sync, the app returning. Cheap
 * when there is nothing to do: the sealed store is read and nothing is opened
 * unless a visit is in progress or a step is waiting.
 */
export function autoClockWake(opts: { checkShift?: boolean; using?: { engine: SyncEngine; records: RecordsStore | null } } = {}): Promise<void> {
  return withAutoClock((deps) => reevaluate(deps, { checkShift: opts.checkShift }), {
    using: opts.using,
    worthIt: (s) =>
      Object.values(s.places).some(
        (p) => p.inside || p.inOp || p.outOp || (p.exitedAt !== undefined && Date.now() - p.exitedAt < DEPARTURE_RELEVANT_MS),
      ),
  }).catch(() => undefined);
}
