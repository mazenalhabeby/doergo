import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../contexts/auth-context';
import { observeResponses } from '../lib/api/client';
import { noteServerTime } from './clock';
import { ConnectivityMonitor, type Connectivity } from './connectivity';
import { openOfflineDatabase } from './db/database';
import { RecordsStore } from './db/records-store';
import { SqliteOutboxStore } from './db/sqlite-outbox-store';
import { httpObjectUploader, httpSyncTransport } from './http-transport';
import { DeviceFileDisk } from './files/device-file-disk';
import { OfflineFiles } from './files/offline-files';
import { SqliteFileRegistry } from './files/sqlite-file-registry';
import { FileUploadPreparer } from './files/upload-preparer';
import { uuidv7 } from './ids';
import { offlineCapableBuild } from './native';
import { SyncEngine, type SyncSnapshot } from './sync-engine';
import type { OutboxOp } from './outbox/types';

/**
 * One connectivity monitor for the whole app, fed by every request — not only
 * the offline path — so "limited" is noticed on whatever screen fails first.
 */
export const connectivity = new ConnectivityMonitor();
let observing = false;
function observeOnce() {
  if (observing) return;
  observing = true;
  connectivity.start();
  observeResponses((o) => {
    if (o.kind === 'response') {
      noteServerTime(o.serverTime);
      connectivity.reportRequest(true);
    } else {
      connectivity.reportRequest(false);
    }
  });
}

interface OfflineValue {
  /** This build carries the offline layer and the member is signed in. */
  available: boolean;
  engine: SyncEngine | null;
  records: RecordsStore | null;
  /** Photos and signatures held on this phone until they are sent. */
  files: OfflineFiles | null;
}

const UNAVAILABLE: OfflineValue = { available: false, engine: null, records: null, files: null };
const OfflineContext = createContext<OfflineValue>(UNAVAILABLE);

const EMPTY_SNAPSHOT: SyncSnapshot = { waiting: 0, attention: 0, pushing: false, pulling: false, lastSuccessAt: null };
const EMPTY_OPS: readonly OutboxOp[] = [];

/**
 * Opens the member's offline database and runs their sync engine.
 *
 * One engine per signed-in member; switching member stops the old one before
 * the new one opens a different database.
 */
export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [value, setValue] = useState<OfflineValue>(UNAVAILABLE);

  useEffect(() => {
    observeOnce();
  }, []);

  useEffect(() => {
    if (!user?.id || !user.organizationId || !offlineCapableBuild()) {
      setValue(UNAVAILABLE);
      return;
    }
    let cancelled = false;
    let engine: SyncEngine | null = null;
    const unsubscribers: (() => void)[] = [];

    (async () => {
      const dbPromise = openOfflineDatabase(user.id);
      if (!dbPromise) return;
      const db = await dbPromise;
      if (cancelled) return;
      const records = new RecordsStore(db);
      const registry = new SqliteFileRegistry(db);
      const disk = DeviceFileDisk.forMember(user.id);
      const files = new OfflineFiles({ registry, disk });
      engine = new SyncEngine({
        userId: user.id,
        organizationId: user.organizationId!,
        store: new SqliteOutboxStore(db),
        transport: httpSyncTransport,
        records,
        preparer: new FileUploadPreparer({ files: registry, disk, uploader: httpObjectUploader }),
        newId: () => uuidv7(),
      });
      await engine.start();
      if (cancelled) {
        engine.stop();
        return;
      }
      const live = engine;
      setValue({ available: true, engine: live, records, files });

      // Triggers: coming back online syncs everything; returning to the app
      // sends what waits. Pull-to-refresh calls syncAll itself.
      unsubscribers.push(
        connectivity.subscribe((state) => {
          if (state === 'online') void live.syncAll();
        }),
      );
      const appState = AppState.addEventListener('change', (s) => {
        if (s === 'active') void live.flush();
      });
      unsubscribers.push(() => appState.remove());
      void live.syncAll();
    })().catch((err) => {
      console.warn('[offline] could not start:', err);
      if (!cancelled) setValue(UNAVAILABLE);
    });

    return () => {
      cancelled = true;
      unsubscribers.forEach((u) => u());
      engine?.stop();
    };
  }, [user?.id, user?.organizationId]);

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineValue {
  return useContext(OfflineContext);
}

/** Online, offline or limited — re-renders on change. */
export function useConnectivity(): Connectivity {
  return useSyncExternalStore(
    (cb) => connectivity.subscribe(cb),
    () => connectivity.state,
    () => connectivity.state,
  );
}

/** The queue's counts and every operation, live. */
export function useSyncStatus(): { snapshot: SyncSnapshot; operations: readonly OutboxOp[] } {
  const { engine } = useOffline();
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
