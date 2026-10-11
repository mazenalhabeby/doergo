import type { RecordsStore } from './db/records-store';
import type { SyncEngine } from './sync-engine';

/*
  THE ENGINE THE APP IS RUNNING, for code that runs outside the React tree.

  A geofence or heartbeat task fires in the app's own JS context whenever the
  app is alive (open, or suspended in the background). Building a second
  runtime there would put a second engine on the same queue — two flushes, two
  caches, one database — so such code asks here first, and only builds its own
  (`createOfflineRuntime`) when the app is not running at all.
*/
interface Live {
  userId: string;
  engine: SyncEngine;
  records: RecordsStore;
}

let live: Live | null = null;

/** The provider registers its engine; returns the unregister. */
export function registerLiveEngine(userId: string, engine: SyncEngine, records: RecordsStore): () => void {
  const mine: Live = { userId, engine, records };
  live = mine;
  return () => {
    if (live === mine) live = null;
  };
}

/** The running engine of this member, if the app has one open. */
export function liveEngineFor(userId: string): Live | null {
  return live && live.userId === userId ? live : null;
}
