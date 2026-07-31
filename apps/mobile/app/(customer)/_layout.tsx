import { useCallback, useEffect, useRef } from 'react';
import { Stack, useRouter, type Href } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getLastNotificationResponseAsync, type NotificationResponse } from 'expo-notifications';
import { usePushNotifications, getTaskIdFromNotification } from '../../src/hooks/usePushNotifications';
import { useTheme } from '../../src/contexts/theme-context';
import { SocketProvider } from '../../src/contexts/socket-context';

// The rest of the mobile app doesn't use react-query, so the customer portal
// owns its own QueryClient here. Sensible defaults: config/units change rarely
// (60s stale), requests refresh via pull-to-refresh; no refetch storms on tab
// switches.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Customer-portal stack. Sits parallel to (app); the root nav guard sends
// role=CUSTOMER users here and never lets them into the staff app.
export default function CustomerLayout() {
  const { colors } = useTheme();
  const router = useRouter();

  // A tapped push about a request → open that request (never a staff route).
  const handleNotificationResponse = useCallback(
    (response: NotificationResponse) => {
      const taskId = getTaskIdFromNotification(response);
      if (taskId) router.push(`/(customer)/request/${taskId}` as Href);
    },
    [router],
  );

  // Register this device so the customer gets per-request status pushes
  // (delivered per-userId to task.createdById by the notification service).
  const { registerForPushNotifications } = usePushNotifications({
    onNotificationResponse: handleNotificationResponse,
  });

  const registered = useRef(false);
  useEffect(() => {
    if (registered.current) return;
    registered.current = true;
    registerForPushNotifications();
  }, [registerForPushNotifications]);

  // Cold start: app launched by tapping a push while killed.
  const coldStart = useRef(false);
  useEffect(() => {
    if (coldStart.current) return;
    coldStart.current = true;
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

  return (
    <QueryClientProvider client={queryClient}>
      {/* Confined socket: the server only joins customers to user:{id}, so this
          just powers live request-status updates on the detail screen. */}
      <SocketProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="report" options={{ presentation: 'modal' }} />
          <Stack.Screen name="request/[id]" />
          <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
          <Stack.Screen name="change-password" options={{ presentation: 'modal' }} />
        </Stack>
      </SocketProvider>
    </QueryClientProvider>
  );
}
