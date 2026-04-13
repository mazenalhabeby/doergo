import { useEffect, useCallback, useRef } from 'react';
import { Stack, useRouter, Href } from 'expo-router';
import { AppState, AppStateStatus } from 'react-native';
import type { NotificationResponse } from 'expo-notifications';
import {
  usePushNotifications,
  getTaskIdFromNotification,
  getNotificationType,
} from '../../src/hooks/usePushNotifications';
import { SocketProvider } from '../../src/contexts/socket-context';
import { LocationTrackingProvider } from '../../src/contexts/location-tracking-context';
import { useTheme } from '../../src/contexts/theme-context';
import { COLORS } from '../../src/lib/constants';

export default function AppLayout() {
  const router = useRouter();
  const { colors } = useTheme();
  const hasRegistered = useRef(false);

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
          options={{ title: 'Notifications' }}
        />
        <Stack.Screen
          name="profile/account"
          options={{ title: 'Account' }}
        />
        <Stack.Screen
          name="profile/about"
          options={{ title: 'About' }}
        />
      </Stack>
    </LocationTrackingProvider>
    </SocketProvider>
  );
}
