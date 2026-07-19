import { useEffect, useCallback, useRef } from 'react';
import { Stack, useRouter, Href } from 'expo-router';
import { AppState, AppStateStatus, Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { getLastNotificationResponseAsync, type NotificationResponse } from 'expo-notifications';
import {
  usePushNotifications,
  getTaskIdFromNotification,
  getNotificationType,
} from '../../src/hooks/usePushNotifications';
import { SocketProvider, useSocketContext } from '../../src/contexts/socket-context';
import { LocationTrackingProvider } from '../../src/contexts/location-tracking-context';
import { useToast } from '../../src/contexts/toast-context';
import { useAuth } from '../../src/contexts/auth-context';
import { activeChat } from '../../src/lib/active-chat';
import { SocketEvents } from '@hbcfield/shared/client';
import { SubscriptionGate } from '../../src/components/SubscriptionGate';
import { useTheme } from '../../src/contexts/theme-context';
import { trackingApi } from '../../src/lib/api';
import { COLORS } from '../../src/lib/constants';
import { Role } from '@hbcfield/shared/client';

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

  // Handle notification tap - navigate to relevant screen
  const handleNotificationResponse = useCallback((response: NotificationResponse) => {
    const taskId = getTaskIdFromNotification(response);
    const type = getNotificationType(response);
    const data = response.notification?.request?.content?.data as Record<string, any> | undefined;

    console.log('[AppLayout] Notification tapped, type:', type, 'taskId:', taskId);

    // Overtime notifications
    if (type?.startsWith('overtime.')) {
      const overtimeId = data?.overtimeRequestId || 'active';
      router.push(`/overtime/${overtimeId}` as Href);
      return;
    }

    // Support: deep-link into the ticket thread.
    if (type === 'support' || data?.type === 'support') {
      const ticketId = data?.ticketId;
      router.push((ticketId ? `/support?ticketId=${ticketId}` : '/support') as Href);
      return;
    }

    // Chat: deep-link into the conversation.
    if (type === 'chat' || data?.type === 'chat') {
      const conversationId = data?.conversationId;
      router.push((conversationId ? `/chat?conversationId=${conversationId}` : '/chat') as Href);
      return;
    }

    if (taskId) {
      // Navigate to task detail
      router.push(`/task/${taskId}` as Href);
    }
  }, [router]);

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

  // Cold start: if the app was launched by tapping a push while killed, the
  // in-session response listener never fires — read the launching response once
  // and route to the same destination so the deep link isn't lost.
  const coldStartHandled = useRef(false);
  useEffect(() => {
    if (coldStartHandled.current) return;
    coldStartHandled.current = true;
    let active = true;
    getLastNotificationResponseAsync()
      .then((response) => {
        if (active && response) handleNotificationResponse(response);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [handleNotificationResponse]);

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
    <SocketProvider>
    <GlobalChatNotifier />
    <LocationTrackingProvider>
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
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
        <Stack.Screen name="support" options={{ headerShown: false }} />
        <Stack.Screen name="chat" options={{ headerShown: false }} />
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
      </Stack>
      <SubscriptionGate />
      </View>
    </LocationTrackingProvider>
    </SocketProvider>
  );
}
