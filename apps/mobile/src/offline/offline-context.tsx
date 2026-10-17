import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { onAppResume } from '../lib/app-resume';
import * as Notifications from 'expo-notifications';
import { setNotificationSuppressor } from '../lib/notification-suppression';
import { notificationTime, reminderAnswered } from './attendance/answered-reminders';
import { useAuth } from '../contexts/auth-context';
import { observeResponses } from '../lib/api/client';
import { setResponseCache } from '../lib/api/response-cache';
import { noteServerTime } from './clock';
import type { Connectivity } from './connectivity';
import { flushPendingRoute } from '../services/background-route-tracking';
import { flushKeptCheckIns } from '../services/kept-check-ins';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { avatarApi } from '../lib/api/auth';
import { isUnreachable } from './actions/unreachable';
import { createPendingAvatar } from './profile/pending-avatar';
import { databaseFailureText } from './db/database';
import { missingOfflineParts } from './native';
import { connectivity, createOfflineRuntime } from './runtime';
import { registerLiveEngine } from './live-engine';
import { reportTelemetry } from './telemetry';
import { registerBackgroundSync } from './background-sync';
import { onSessionEnd, registerUnsentProbe } from '../lib/session/session-registry';
import type { SyncEngine, SyncSnapshot } from './sync-engine';
import { type OfflineValue, UNAVAILABLE, OfflineContext } from "./offline-hooks";
export { useOffline, useLastSyncedAt, useSyncStatus, usePendingFor } from "./offline-hooks";

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

/**
 * Opens the member's offline database and runs their sync engine.
 *
 * One engine per signed-in member; switching member stops the old one before
 * the new one opens a different database.
 */
export function OfflineProvider({ children, variant = 'staff' }: {
  children: React.ReactNode;
  /**
   * `portal`: a client of the customer portal. The same engine and database,
   * and none of the field work — no pulls, no background sync, no photo cache,
   * no location check-ins, no telemetry. A client writes a request somewhere
   * without signal and reads what they already saw; that is all it needs.
   */
  variant?: 'staff' | 'portal';
}) {
  const { user } = useAuth();
  const [value, setValue] = useState<OfflineValue>({ ...UNAVAILABLE, starting: true });

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
    /*
      No organization = nothing to sync with, and it is NOT a reason to send
      somebody to the app store. Rare (an account mid-onboarding), and without
      its own answer it reads as the missing-parts case on a perfectly good
      build — which is an afternoon of looking in the wrong place.
    */
    if (!user?.id || !user.organizationId) {
      setValue(
        user?.id
          ? { ...UNAVAILABLE, unavailableReason: 'no-org', unavailableDetail: 'no organization on this account' }
          : UNAVAILABLE,
      );
      return;
    }
    const missing = missingOfflineParts();
    if (missing.length > 0) {
      setValue({ ...UNAVAILABLE, unavailableReason: 'build', unavailableDetail: missing.join(', ') });
      return;
    }
    // Everything below is asynchronous, and screens read `starting` to know
    // whether the copy they want is still on its way.
    setValue((v) => (v.starting ? v : { ...UNAVAILABLE, starting: true }));
    let cancelled = false;
    let engine: SyncEngine | null = null;
    const unsubscribers: (() => void)[] = [];

    (async () => {
      const runtime = await createOfflineRuntime({ userId: user.id, organizationId: user.organizationId! });
      // The parts are here and the database did not open — never "update the app".
      if (!runtime) {
        if (!cancelled) setValue({ ...UNAVAILABLE, unavailableReason: 'failed', unavailableDetail: 'database did not open' });
        return;
      }
      const { records, files, media, preferences } = runtime;
      engine = runtime.engine;
      if (cancelled) {
        engine.stop();
        return;
      }
      const live = engine;
      // Background tasks firing in this JS context use this engine rather than open a second one.
      unsubscribers.push(registerLiveEngine(user.id, live, records));
      // The end of a session asks this before deciding whether the phone's copy may go.
      unsubscribers.push(registerUnsentProbe(user.id, () => live.hasUnsent()));
      // …and stops the engine before the database under it is closed and deleted.
      unsubscribers.push(onSessionEnd('offline-engine', () => live.stop()));
      if (!offlineMode) {
        // Drain only: send what was queued while it was on, offer nothing new.
        if (live.hasUnsent()) {
          unsubscribers.push(connectivity.subscribe((state) => void (state === 'online' && live.flush())));
          void live.flush();
        }
        setValue({ ...UNAVAILABLE, running: live });
        return;
      }

      if (variant === 'portal') {
        setValue({ ...UNAVAILABLE, available: true, engine: live, records, files, running: live });
        setResponseCache({
          get: async (key) => (await records.get<{ body: unknown }>('http', key))?.data.body,
          put: (key, body) => records.upsert('http', { id: key, body } as never),
        });
        unsubscribers.push(() => setResponseCache(null));
        unsubscribers.push(connectivity.subscribe((state) => void (state === 'online' && live.flush())));
        unsubscribers.push(onAppResume(() => void live.flush()));
        void live.flush();
        return;
      }

      const avatar = createPendingAvatar(user.id, {
        storage: AsyncStorage,
        upload: (uri, fileName, mime) => avatarApi.upload(uri, fileName, mime),
        remove: () => avatarApi.remove(),
        forgetFile: (id) => files.forget(id),
        isUnreachable,
      });
      setValue({
        available: true,
        starting: false,
        engine: live,
        records,
        files,
        media,
        preferences,
        running: live,
        avatar,
        unavailableReason: null,
        unavailableDetail: null,
      });
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

      // The app's one throttled resume (lib/app-resume); reconnecting flushes on its own.
      const offResume = onAppResume(() => {
        void live.flush();
        void flushPendingRoute();
        void flushKeptCheckIns();
        void avatar.flush();
        void clearAnsweredReminders();
      });
      unsubscribers.push(offResume);
      void live.syncAll().then(fillMediaCache);
    })().catch((err) => {
      console.warn('[offline] could not start:', err);
      if (!cancelled) setValue({ ...UNAVAILABLE, unavailableReason: 'failed', unavailableDetail: databaseFailureText(err).slice(0, 400) });
    });

    return () => {
      cancelled = true;
      unsubscribers.forEach((u) => u());
      engine?.stop();
    };
  }, [user?.id, user?.organizationId, offlineMode, variant]);

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

/** Online, offline or limited — re-renders on change. */
export function useConnectivity(): Connectivity {
  return useSyncExternalStore(
    (cb) => connectivity.subscribe(cb),
    () => connectivity.state,
    () => connectivity.state,
  );
}
