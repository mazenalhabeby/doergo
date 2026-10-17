import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { RecordsStore } from "./db/records-store";
import type { MediaCache } from "./files/media-cache";
import type { OfflineFiles } from "./files/offline-files";
import type { OfflinePreferencesStore } from "./preferences";
import { type PendingAvatar } from "./profile/pending-avatar";
import { newest } from "./freshness";
import type { SyncEngine, SyncSnapshot } from "./sync-engine";
import type { OutboxOp } from "./outbox/types";

/** What screens read from the offline provider — moved here unchanged from offline-context.tsx. */
export interface OfflineValue {
  /** This build carries the offline layer and the member is signed in. */
  available: boolean;
  /**
   * The member's database is still opening.
   *
   * Told apart from "there will never be one" because a screen that reaches
   * for the phone's copy on a cold start arrives BEFORE it exists — and with
   * no way to distinguish the two, it either waits forever on a build that has
   * no offline layer, or gives up a moment too early on one that does.
   */
  starting: boolean;
  engine: SyncEngine | null;
  records: RecordsStore | null;
  /** Photos and signatures held on this phone until they are sent. */
  files: OfflineFiles | null;
  /** Photos already on the server, kept for viewing offline. */
  media: MediaCache | null;
  /** The member's own sync choices (photos only on Wi-Fi). */
  preferences: OfflinePreferencesStore | null;
  /**
   * The engine that is RUNNING, whether or not screens may queue into it.
   * With offline mode switched off it still sends what was queued before, so
   * the sign-out guard and the sync status must read this one, not `engine`.
   */
  running: SyncEngine | null;
  /** A new profile photo (or its removal) waiting for signal. */
  avatar: PendingAvatar | null;
  /**
   * Why there is no engine, when there is none.
   *
   * `build` — this binary has no offline parts; only a store update adds them.
   * `failed` — it has them and the member's database would not open.
   *
   * They are told apart because the answer to each is opposite, and the Sync
   * screen said "update the app" for both. A member on the newest build, whose
   * database failed, was sent to a store that offers them nothing — and it
   * hides the only case anyone can act on from here.
   */
  unavailableReason: 'build' | 'failed' | 'no-org' | null;
  /**
   * WHICH parts are missing, or what the failure said — the one line that turns
   * "it does not work on my phone" into something actionable without a cable.
   */
  unavailableDetail: string | null;
}

export const UNAVAILABLE: OfflineValue = {
  available: false, starting: false, engine: null, records: null, files: null, media: null,
  preferences: null, running: null, avatar: null, unavailableReason: null, unavailableDetail: null,
};

export const OfflineContext = createContext<OfflineValue>(UNAVAILABLE);

export const EMPTY_SNAPSHOT: SyncSnapshot = { waiting: 0, attention: 0, pushing: false, pulling: false, lastSuccessAt: null };

export const EMPTY_OPS: readonly OutboxOp[] = [];

export function useOffline(): OfflineValue {
  return useContext(OfflineContext);
}

/**
 * When this phone last brought its copy up to date: the engine's last success
 * this session, or — after a restart, before anything has synced — the last
 * pull recorded in the database. Null when it never has.
 */
export function useLastSyncedAt(): number | null {
  const { records } = useOffline();
  const { snapshot } = useSyncStatus();
  const [pulledAt, setPulledAt] = useState<number | null>(null);
  useEffect(() => {
    if (!records) {
      setPulledAt(null);
      return;
    }
    let active = true;
    const read = () =>
      void Promise.all([records.cursor('tasks'), records.cursor('spaces')])
        .then(([tasks, spaces]) => active && setPulledAt(newest(tasks.lastPullAt, spaces.lastPullAt)))
        .catch(() => undefined);
    read();
    /*
      ⚠️ ONLY THE TWO SCOPES IT READS. Every kept GET writes the `http` scope,
      so listening to all of them ran two cursor queries per response — the
      home's own reads among them — for a figure none of those can move.
    */
    const off = records.onChange((scope) => { if (scope === 'tasks' || scope === 'spaces') read(); });
    return () => {
      active = false;
      off();
    };
  }, [records]);
  return newest(snapshot.lastSuccessAt, pulledAt);
}

/** The queue's counts and every operation, live. */
export function useSyncStatus(): { snapshot: SyncSnapshot; operations: readonly OutboxOp[] } {
  const { running: engine } = useOffline();
  const [state, setState] = useState<{ snapshot: SyncSnapshot; operations: readonly OutboxOp[] }>(() => ({
    snapshot: engine?.snapshot() ?? EMPTY_SNAPSHOT,
    operations: engine?.operations() ?? EMPTY_OPS,
  }));
  useEffect(() => {
    if (!engine) {
      setState({ snapshot: EMPTY_SNAPSHOT, operations: EMPTY_OPS });
      return;
    }
    setState({ snapshot: engine.snapshot(), operations: engine.operations() });
    return engine.subscribe((snapshot, operations) => setState({ snapshot, operations }));
  }, [engine]);
  return state;
}

/** What is still on its way for one record — the "waiting to send" chip reads this. */
export function usePendingFor(entityId: string | undefined): { waiting: number; attention: number } {
  const { operations } = useSyncStatus();
  return useMemo(() => {
    if (!entityId) return { waiting: 0, attention: 0 };
    let waiting = 0;
    let attention = 0;
    for (const o of operations) {
      if (o.entityId !== entityId) continue;
      if (o.state === 'conflict' || o.state === 'failed') attention++;
      else if (o.state !== 'done' && o.state !== 'discarded') waiting++;
    }
    return { waiting, attention };
  }, [operations, entityId]);
}
