import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { setNotificationSuppressor } from '../lib/notification-suppression';
import { notificationTime, reminderAnswered } from './attendance/answered-reminders';
import { useAuth } from '../contexts/auth-context';
import { observeResponses } from '../lib/api/client';
import { setResponseCache } from '../lib/api/response-cache';
import { noteServerTime } from './clock';
import type { Connectivity } from './connectivity';
import type { RecordsStore } from './db/records-store';
import type { MediaCache } from './files/media-cache';
import type { OfflineFiles } from './files/offline-files';
import type { OfflinePreferencesStore } from './preferences';
import { flushPendingRoute } from '../services/background-route-tracking';
import { flushKeptCheckIns } from '../services/kept-check-ins';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { avatarApi } from '../lib/api/auth';
import { isUnreachable } from './actions/unreachable';
import { createPendingAvatar, type PendingAvatar } from './profile/pending-avatar';
import { offlineCapableBuild } from './native';
import { connectivity, createOfflineRuntime } from './runtime';
import { reportTelemetry } from './telemetry';
import { registerBackgroundSync } from './background-sync';
import type { SyncEngine, SyncSnapshot } from './sync-engine';
import type { OutboxOp } from './outbox/types';

export { connectivity };
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
}

const UNAVAILABLE: OfflineValue = { available: false, engine: null, records: null, files: null, media: null, preferences: null, running: null, avatar: null };
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

  /*
    Switched on per organization. Off, the screens use the plain online paths
    exactly as before — but the engine still starts, because a phone may hold
    work queued while it was on, and switching offline mode off must never
    throw that away. It sends what it has and queues nothing new.
  */
  const offlineMode = user?.offlineMode === true;

  useEffect(() => {
    if (!user?.id || !user.organizationId || !offlineCapableBuild()) {
      setValue(UNAVAILABLE);
      return;
    }
    let cancelled = false;
    let engine: SyncEngine | null = null;
    const unsubscribers: (() => void)[] = [];

    (async () => {
      const runtime = await createOfflineRuntime({ userId: user.id, organizationId: user.organizationId! });
      if (!runtime) return;
      const { records, files, media, preferences } = runtime;
      engine = runtime.engine;
      if (cancelled) {
        engine.stop();
        return;
      }
      const live = engine;
      if (!offlineMode) {
        // Drain only: send what was queued while it was on, offer nothing new.
        if (live.hasUnsent()) {
          unsubscribers.push(connectivity.subscribe((state) => void (state === 'online' && live.flush())));
          void live.flush();
        }
        setValue({ ...UNAVAILABLE, running: live });
        return;
      }

      const avatar = createPendingAvatar(user.id, {
        storage: AsyncStorage,
        upload: (uri, fileName, mime) => avatarApi.upload(uri, fileName, mime),
        remove: () => avatarApi.remove(),
        forgetFile: (id) => files.forget(id),
        isUnreachable,
      });
      setValue({ available: true, engine: live, records, files, media, preferences, running: live, avatar });
      void avatar.flush();
      // Syncs itself now and then with the app closed — best effort, never relied on.
      void registerBackgroundSync({ userId: user.id, organizationId: user.organizationId! });
      setResponseCache({
        get: async (key) => (await records.get<{ body: unknown }>('http', key))?.data.body,
        put: (key, body) => records.upsert('http', { id: key, body } as never),
      });
      unsubscribers.push(() => setResponseCache(null));

      /*
        On Wi-Fi, keep the photos of the tasks on this phone for offline viewing.
        Never on mobile data — a crew's data plans are not ours to spend — and
        it stops the moment the Wi-Fi does.
      */
      const fillMediaCache = async () => {
        void reportTelemetry(live, files);
        if (!connectivity.unmetered || cancelled) return;
        const rows = await records.list<{ id: string; mimeType?: string | null; fileType?: string }>('attachments').catch(() => []);
        const images = rows.filter((r) => r.data.mimeType?.startsWith('image/') || r.data.fileType === 'IMAGE').map((r) => r.id);
        await media.prefetch(images, () => connectivity.unmetered && !cancelled);
      };

      // Triggers: coming back online syncs everything; returning to the app
      // sends what waits. Pull-to-refresh calls syncAll itself.
      unsubscribers.push(
        connectivity.subscribe((state) => {
          if (state !== 'online') return;
          void live.syncAll().then(fillMediaCache);
          void flushPendingRoute();
          void flushKeptCheckIns();
          void avatar.flush();
        }),
        // Wi-Fi arriving: photos held for it go now, and the image cache fills.
        connectivity.subscribeKind((unmetered) => {
          if (!unmetered) return;
          void live.flush();
          void fillMediaCache();
        }),
        preferences.subscribe(() => void live.flush()),
      );
      /*
        A reminder the phone has already answered. The server pushed it because
        the clock-in never arrived — it is in the outbox. Hidden when it lands
        while the app is open, and cleared from the tray on returning to the app
        and whenever the queue changes (a tap that answers one already shown).
      */
      setNotificationSuppressor((data, at) => reminderAnswered(data, at, live.operations()));
      unsubscribers.push(() => setNotificationSuppressor(null));
      const clearAnsweredReminders = async () => {
        const shown = await Notifications.getPresentedNotificationsAsync().catch(() => []);
        const ops = live.operations();
        for (const n of shown) {
          const data = n.request.content.data as Record<string, unknown> | undefined;
          if (reminderAnswered(data, notificationTime(n.date), ops)) {
            await Notifications.dismissNotificationAsync(n.request.identifier).catch(() => undefined);
          }
        }
      };
      unsubscribers.push(live.subscribe(() => void clearAnsweredReminders()));
      void clearAnsweredReminders();

      const appState = AppState.addEventListener('change', (s) => {
        if (s !== 'active') return;
        void live.flush();
        void flushPendingRoute();
        void flushKeptCheckIns();
        void avatar.flush();
        void clearAnsweredReminders();
      });
      unsubscribers.push(() => appState.remove());
      void live.syncAll().then(fillMediaCache);
    })().catch((err) => {
      console.warn('[offline] could not start:', err);
      if (!cancelled) setValue(UNAVAILABLE);
    });

    return () => {
      cancelled = true;
      unsubscribers.forEach((u) => u());
      engine?.stop();
    };
  }, [user?.id, user?.organizationId, offlineMode]);

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
