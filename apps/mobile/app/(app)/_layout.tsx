import { OfflineProvider } from '../../src/offline/offline-context';
import { RefusedShiftNotifier } from '../../src/offline/attendance/refused-shift-notifier';
import { OfflineSocketPoke } from '../../src/offline/components/offline-socket-poke';
import { useEffect, useCallback, useRef, useState } from 'react';
import { Stack, useRouter, useRootNavigationState, useSegments, Href } from 'expo-router';
import { View } from 'react-native';
import { onAppResume, onAppStateChange, useAppResume } from '../../src/lib/app-resume';
import { useTranslation } from 'react-i18next';
import { getFix } from '../../src/lib/location-fix';
import { type NotificationResponse } from 'expo-notifications';
import { crewJoinTarget, notificationTarget, type NotificationTarget } from '../../src/lib/notification-route';
import { CREW_JOIN_ACTION, usePushNotifications } from '../../src/hooks/usePushNotifications';
import { isCalendarAction, runCalendarAction } from '../../src/lib/calendar-push-actions';
import { armCrewJoin } from '../../src/lib/join-intent';
import { mayActOnPush } from '../../src/lib/push-recipient';
import { sessionStartedAt } from '../../src/lib/api/client';
import { holds } from '../../src/lib/permissions';
import { SocketProvider, useSocketContext } from '../../src/contexts/socket-context';
import { LocationTrackingProvider } from '../../src/contexts/location-tracking-context';
import { DocumentRequirementsProvider } from '../../src/contexts/document-requirements-context';
import { useToast } from '../../src/island/island-context';
import { showUpdatePageNow } from '../../src/components/update-page';
import { useAuth } from '../../src/contexts/auth-context';
import { activeChat } from '../../src/lib/active-chat';
import { SocketEvents } from '@hbcfield/shared/client';
import { SubscriptionGate } from '../../src/components/SubscriptionGate';
import { TourProvider } from '../../src/components/tour';
import { useTheme } from '../../src/contexts/theme-context';
import { trackingApi } from '../../src/lib/api';
import { COLORS } from '../../src/lib/constants';
import { Role } from '@hbcfield/shared/client';
import { MediaAccessHost } from '../../src/permissions/media-access-host';

// Send a lightweight presence ping using CACHED location (no fresh GPS).
// Runs once on app start and every 10 minutes — getFix({ purpose: 'cached' })
// which returns the most recent GPS fix without activating the GPS radio.
function usePresencePing() {
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendPing = useCallback(async () => {
    try {
      // The OS's cached position only — the GPS radio is never switched on.
      const loc = await getFix({ purpose: 'cached' });
      await trackingApi.updateLocation({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? undefined,
      });
    } catch {
      // Silently ignore — presence is best-effort
    }
  }, []);

  useEffect(() => {
    if (user?.role !== Role.EMPLOYEE) return;

    // Initial ping with cached location
    sendPing();

    // Repeat every 10 minutes (was 4 — reduced to save battery/data), only in front.
    const startTimer = () => {
      if (!intervalRef.current) intervalRef.current = setInterval(sendPing, 10 * 60 * 1000);
    };
    const stopTimer = () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
    startTimer();

    // The timer follows the app exactly; the catch-up ping rides the app's ONE
    // throttled resume (lib/app-resume) with everything else that refreshes.
    const offState = onAppStateChange((state) => (state === 'active' ? startTimer() : stopTimer()));
    const offResume = onAppResume(() => void sendPing());

    return () => {
      offState();
      offResume();
      stopTimer();
    };
  }, [user?.role, sendPing]);
}

/**
 * Global in-app chat notifier — lives inside SocketProvider so it receives
 * CHAT_MESSAGE on every screen (not just the chat screen). Shows a toast for
 * messages from others, unless you're already viewing that conversation. This is
 * the in-app path; push (via Expo) covers the app-closed case on real builds.
 */
function GlobalChatNotifier() {
  const { subscribe, isAuthenticated } = useSocketContext();
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    if (!isAuthenticated) return;
    return subscribe(SocketEvents.CHAT_MESSAGE, (d: any) => {
      const m = d?.message;
      if (!m || !m.senderId || m.senderId === user?.id) return;
      if (d.conversationId && d.conversationId === activeChat.conversationId) return; // already reading it
      const name = m.sender ? `${m.sender.firstName} ${m.sender.lastName}`.trim() : t('chat.title', 'Messages');
      toast.info(name, (m.body || '').slice(0, 80));
    });
  }, [isAuthenticated, subscribe, user?.id, toast, t]);

  return null;
}

export default function AppLayout() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const hasRegistered = useRef(false);

  // Keep technician presence alive for online status
  usePresencePing();

  /*
    A tapped notification opens the screen it is about — the table is
    src/lib/notification-route.ts. Home only when the table says so, or for a
    type it does not know and that names no task.
  */
  const { user } = useAuth();
  const managesIssues = holds(user, 'canViewAllTasks');
  const [pendingTarget, setPendingTarget] = useState<NotificationTarget | null>(null);
  const calendarToast = useToast();
  const handleNotificationResponse = useCallback((response: NotificationResponse) => {
    const data = response.notification?.request?.content?.data as Record<string, unknown> | undefined;
    // "A new version is ready": open the full-page update, even after "Later".
    if (data?.type === 'app_update') { showUpdatePageNow(); return; }
    const deliveredAt = response.notification?.date ?? null;
    // A calendar button (Done, +10 min, Accept …) does its one thing and stays where the member is.
    if (isCalendarAction(response.actionIdentifier)) {
      void runCalendarAction(response.actionIdentifier, data, { userId: user?.id ?? null, deliveredAt }).then((r) => {
        if (r === 'not-yours') calendarToast.warning(t('calendar.pushNotYours'));
        else if (r === 'failed') calendarToast.error(t('common.error', 'Error'), t('calendar.offline', 'Needs a connection to load your calendar.'));
        else calendarToast.success(r === 'snoozed' ? t('calendar.snoozed', 'Reminding you again in 10 minutes') : r === 'answered' ? t('calendar.answered', 'Answer sent') : t('calendar.done', 'Done'));
      });
      return;
    }
    if (response.actionIdentifier === CREW_JOIN_ACTION) {
      /*
        "I'm with him": the job opens, and joins — the join is handed over in
        memory, never in the URL (`lib/join-intent.ts`). Only for the member
        the push was for; anybody else just sees the job.
      */
      const target = crewJoinTarget(data);
      const taskId = typeof data?.taskId === 'string' ? data.taskId : null;
      void sessionStartedAt().then((started) => {
        if (taskId && mayActOnPush({ data, deliveredAt, userId: user?.id ?? null, sessionStartedAt: started })) armCrewJoin(taskId);
        if (target) setPendingTarget(target);
      });
      return;
    }
    const target = notificationTarget(data, { managesIssues });
    if (target) setPendingTarget(target);
  }, [managesIssues, calendarToast, t, user?.id]);

  /*
    Navigate once the app has SETTLED, not the moment the tap is known.

    On a launch from a notification the tap is known while start-up is still
    moving the app around — the sign-in check, the redirect into the app, a
    token refresh. A push made in the middle of that is replaced by the next
    redirect, and the member lands on Home. So the target waits until the
    navigator exists and the app has stayed inside (app) for a moment; any
    further move restarts the wait.
  */
  const rootNavKey = useRootNavigationState()?.key;
  const topSegment = useSegments()[0] as string | undefined;
  useEffect(() => {
    if (!pendingTarget || !rootNavKey || topSegment !== '(app)') return;
    const timer = setTimeout(() => {
      setPendingTarget(null);
      router.push(pendingTarget as Href);
    }, 300);
    return () => clearTimeout(timer);
  }, [pendingTarget, rootNavKey, topSegment, router]);

  const {
    registerForPushNotifications,
    isRegistered,
    error: pushError,
  } = usePushNotifications({
    onNotificationResponse: handleNotificationResponse,
  });

  // Register for push notifications when authenticated (only once)
  useEffect(() => {
    if (!hasRegistered.current) {
      hasRegistered.current = true;
      registerForPushNotifications();
    }
  }, [registerForPushNotifications]);

  // Re-register when app comes to foreground (in case token changed) — on the app's one throttled resume.
  useAppResume(() => { registerForPushNotifications(); }, isRegistered);

  // Log push registration errors
  useEffect(() => {
    if (pushError) {
      console.warn('[AppLayout] Push notification error:', pushError);
    }
  }, [pushError]);

  return (
    <OfflineProvider>
    <RefusedShiftNotifier />
    <SocketProvider>
    <GlobalChatNotifier />
    <OfflineSocketPoke />
    <LocationTrackingProvider>
      <DocumentRequirementsProvider>
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <TourProvider>
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.header,
          },
          headerTitleStyle: {
            fontWeight: '600',
            color: colors.textPrimary,
          },
          headerTintColor: COLORS.primary,
          contentStyle: { backgroundColor: colors.surface },
          /*
            Pushed screens SLIDE. This was `'none'`, so every push — a task, a
            document, a client — replaced the screen in a single frame with
            nothing to say a new thing had arrived on top of the old one, and
            nothing to say the back gesture would take it away again.

            ⚠️ `slide_from_right` and not something of our own. It is the
            platform's own push on both iOS and Android, so the back SWIPE
            tracks it — a custom animation here would leave the gesture
            dragging one thing while the screen does another. The character
            belongs in the tab pill, which nothing else owns.

            The modals below keep `slide_from_bottom`: a sheet comes up, a page
            comes across, and the difference is how you know which one you are
            looking at before you read it.
          */
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="task/[id]"
          options={{
            title: t('navTitles.taskDetails'),
            presentation: 'transparentModal',
            headerShown: false,
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen name="route-planner" options={{ headerShown: false }} />
        <Stack.Screen name="customers" options={{ headerShown: false }} />
        <Stack.Screen name="customer/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="support" options={{ headerShown: false }} />
        <Stack.Screen name="extra-time" options={{ headerShown: false }} />
        <Stack.Screen name="sync" options={{ headerShown: false }} />
        <Stack.Screen name="calendar-new" options={{ headerShown: false }} />
        {/* ⚠️ EVERY route under app/(app) must appear in this list.

            A screen that is not registered inherits the stack's default header,
            and expo-router titles that bar with the ROUTE NAME. So a screen
            drawing its own header shows two — the native "documents" bar above
            "My documents" — and a full-bleed screen like the card scanner gets
            a black "scan-card" bar over the camera, which also shortens the
            viewfinder the frame geometry is measured against.

            It fails silently and only on the screen you did not open, which is
            why `screen-registration.spec.ts` fails the build instead. */}
        <Stack.Screen name="documents" options={{ headerShown: false }} />
        <Stack.Screen name="sign-document" options={{ headerShown: false }} />
        <Stack.Screen name="scan-card" options={{ headerShown: false }} />
        <Stack.Screen name="my-assets" options={{ headerShown: false }} />
        {/* Full-bleed camera, like the card scanner — an inherited header both
            covers the viewfinder and titles it "asset-expense". */}
        <Stack.Screen name="asset-expense" options={{ headerShown: false }} />
        <Stack.Screen name="asset-log" options={{ headerShown: false }} />
        {/* Clients from the phone's address book — draws its own header. */}
        <Stack.Screen name="import-contacts" options={{ headerShown: false }} />
        <Stack.Screen name="send-document" options={{ headerShown: false }} />
        <Stack.Screen name="overtime/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="overtime/sign/[id]" options={{ headerShown: false }} />
        {/* A nested stack. It draws the header for every page inside it, so the
            outer one must be off or every Manage page carries two bars — the
            inner one titled "Members", the outer one titled "manage". */}
        <Stack.Screen name="manage" options={{ headerShown: false }} />
        <Stack.Screen
          name="profile/notifications"
          options={{
            title: t('navTitles.notifications'),
            headerShown: false,
          }}
        />
        <Stack.Screen name="profile/password" options={{ headerShown: false }} />
        <Stack.Screen
          name="profile/account"
          options={{
            title: t('navTitles.account'),
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="profile/about"
          options={{
            title: t('navTitles.about'),
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="profile/language"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="profile/appearance"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="profile/time-format"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
      {/* One permission sheet for every image picker in the app. Mounted here
          so seven call sites share it without seven copies. */}
      <MediaAccessHost />
      <SubscriptionGate />
      </TourProvider>
      </View>
      </DocumentRequirementsProvider>
    </LocationTrackingProvider>
    </SocketProvider>
    </OfflineProvider>
  );
}
