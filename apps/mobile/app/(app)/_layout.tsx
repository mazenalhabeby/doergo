import { useEffect, useCallback, useRef } from 'react';
import { Stack, useRouter, Href } from 'expo-router';
import { AppState, AppStateStatus, Platform, View } from 'react-native';
import * as Location from 'expo-location';
import type { NotificationResponse } from 'expo-notifications';
import {
  usePushNotifications,
  getTaskIdFromNotification,
  getNotificationType,
} from '../../src/hooks/usePushNotifications';
import { SocketProvider } from '../../src/contexts/socket-context';
import { LocationTrackingProvider } from '../../src/contexts/location-tracking-context';
import { useAuth } from '../../src/contexts/auth-context';
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
    if (user?.role !== Role.TECHNICIAN) return;

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

export default function AppLayout() {
  const router = useRouter();
  const { colors } = useTheme();
  const hasRegistered = useRef(false);

  // Keep technician presence alive for online status
  usePresencePing();

  // Handle notification tap - navigate to relevant screen
  const handleNotificationResponse = useCallback((response: NotificationResponse) => {
    const taskId = getTaskIdFromNotification(response);
    const type = getNotificationType(response);

    console.log('[AppLayout] Notification tapped, type:', type, 'taskId:', taskId);

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
            title: 'Task Details',
            presentation: 'transparentModal',
            headerShown: false,
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="profile/notifications"
          options={{
            title: 'Notifications',
            presentation: 'transparentModal',
            headerShown: false,
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="profile/account"
          options={{
            title: 'Account',
            presentation: 'transparentModal',
            headerShown: false,
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="profile/about"
          options={{
            title: 'About',
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
      </View>
    </LocationTrackingProvider>
    </SocketProvider>
  );
}
