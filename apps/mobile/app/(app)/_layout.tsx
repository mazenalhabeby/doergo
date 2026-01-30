import { useEffect, useCallback, useRef } from 'react';
import { Stack, useRouter, Href } from 'expo-router';
import { AppState, AppStateStatus } from 'react-native';
import type { NotificationResponse } from 'expo-notifications';
import {
  usePushNotifications,
  getTaskIdFromNotification,
  getNotificationType,
} from '../../src/hooks/usePushNotifications';

const PRIMARY_COLOR = '#2563EB';

export default function AppLayout() {
  const router = useRouter();
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
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: 'white',
        },
        headerTitleStyle: {
          fontWeight: '600',
          color: '#1e293b',
        },
        headerTintColor: PRIMARY_COLOR,
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
          presentation: 'modal',
        }}
      />
    </Stack>
  );
}
