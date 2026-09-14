import { OfflineProvider } from '../../src/offline/offline-context';
import { OfflineSocketPoke } from '../../src/offline/components/offline-socket-poke';
import { useEffect, useCallback, useRef, useState } from 'react';
import { Stack, useRouter, useRootNavigationState, useSegments, Href } from 'expo-router';
import { AppState, AppStateStatus, Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { type NotificationResponse } from 'expo-notifications';
import { usePushNotifications } from '../../src/hooks/usePushNotifications';
import { notificationTarget, type NotificationTarget } from '../../src/lib/notification-route';
import { holds } from '../../src/lib/permissions';
import { SocketProvider, useSocketContext } from '../../src/contexts/socket-context';
import { LocationTrackingProvider } from '../../src/contexts/location-tracking-context';
import { DocumentRequirementsProvider } from '../../src/contexts/document-requirements-context';
import { useToast } from '../../src/contexts/toast-context';
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
// Runs once on app start and every 10 minutes — uses getLastKnownPositionAsync
// which returns the most recent GPS fix without activating the GPS radio.
function usePresencePing() {
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendPing = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      // getLastKnownPositionAsync = NO GPS activation, uses cached OS location
      const loc = await Location.getLastKnownPositionAsync();
      if (!loc) return;
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

    // Repeat every 10 minutes (was 4 — reduced to save battery/data)
    intervalRef.current = setInterval(sendPing, 10 * 60 * 1000);

    // Only ping on foreground resume, not continuously
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        sendPing();
        if (!intervalRef.current) {
          intervalRef.current = setInterval(sendPing, 10 * 60 * 1000);
        }
      } else {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    });

    return () => {
      sub.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
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
  const handleNotificationResponse = useCallback((response: NotificationResponse) => {
    const data = response.notification?.request?.content?.data as Record<string, unknown> | undefined;
    const target = notificationTarget(data, { managesIssues });
    if (target) setPendingTarget(target);
  }, [managesIssues]);

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

  // Re-register when app comes to foreground (in case token changed)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active' && isRegistered) {
        // Token might have changed, re-register
        registerForPushNotifications();
      }
    });

    return () => subscription.remove();
  }, [isRegistered, registerForPushNotifications]);

  // Log push registration errors
  useEffect(() => {
    if (pushError) {
      console.warn('[AppLayout] Push notification error:', pushError);
    }
  }, [pushError]);

  return (
    <OfflineProvider>
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
          animation: 'none',
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
        <Stack.Screen name="chat" options={{ headerShown: false }} />
        <Stack.Screen name="extra-time" options={{ headerShown: false }} />
        <Stack.Screen name="sync" options={{ headerShown: false }} />
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
        <Stack.Screen name="asset-contract" options={{ headerShown: false }} />
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
            presentation: 'transparentModal',
            headerShown: false,
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="profile/account"
          options={{
            title: t('navTitles.account'),
            presentation: 'transparentModal',
            headerShown: false,
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="profile/about"
          options={{
            title: t('navTitles.about'),
            presentation: 'transparentModal',
            headerShown: false,
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="profile/language"
          options={{
            presentation: 'transparentModal',
            headerShown: false,
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="profile/appearance"
          options={{
            presentation: 'transparentModal',
            headerShown: false,
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="profile/time-format"
          options={{
            presentation: 'transparentModal',
            headerShown: false,
            animation: 'slide_from_bottom',
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
