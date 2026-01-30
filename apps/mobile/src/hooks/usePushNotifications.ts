import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { pushApi } from '../lib/api';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface PushNotificationState {
  expoPushToken: string | null;
  isRegistered: boolean;
  permissionStatus: 'undetermined' | 'granted' | 'denied';
  error: string | null;
}

interface NotificationData {
  type?: string;
  taskId?: string;
  [key: string]: any;
}

interface UsePushNotificationsOptions {
  // Called when a notification is received while app is in foreground
  onNotificationReceived?: (notification: Notifications.Notification) => void;
  // Called when user taps on a notification
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void;
}

export function usePushNotifications(options: UsePushNotificationsOptions = {}) {
  const [state, setState] = useState<PushNotificationState>({
    expoPushToken: null,
    isRegistered: false,
    permissionStatus: 'undetermined',
    error: null,
  });

  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const currentTokenRef = useRef<string | null>(null);

  // Get the project ID for Expo push token
  const getProjectId = useCallback(() => {
    // Try to get projectId from Expo config
    return (
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId
    );
  }, []);

  // Request permissions and get push token
  const registerForPushNotifications = useCallback(async () => {
    try {
      // Check if we're on a physical device (required for push notifications)
      if (!Device.isDevice) {
        console.log('[Push] Not a physical device - push notifications disabled');
        setState((prev) => ({
          ...prev,
          error: 'Push notifications require a physical device',
        }));
        return null;
      }

      // Check existing permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request permissions if not already granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      setState((prev) => ({
        ...prev,
        permissionStatus: finalStatus === 'granted' ? 'granted' : 'denied',
      }));

      if (finalStatus !== 'granted') {
        console.log('[Push] Permission not granted');
        setState((prev) => ({
          ...prev,
          error: 'Push notification permission denied',
        }));
        return null;
      }

      // Get the Expo push token
      const projectId = getProjectId();
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      const token = tokenData.data;
      console.log('[Push] Got Expo push token:', token.substring(0, 30) + '...');

      // Determine platform
      const platform = Platform.OS as 'ios' | 'android';

      // Register token with backend
      try {
        await pushApi.registerToken({
          token,
          platform,
          deviceId: Device.deviceName ?? undefined,
        });
        console.log('[Push] Token registered with backend');

        currentTokenRef.current = token;
        setState((prev) => ({
          ...prev,
          expoPushToken: token,
          isRegistered: true,
          error: null,
        }));

        return token;
      } catch (apiError) {
        console.error('[Push] Failed to register token with backend:', apiError);
        setState((prev) => ({
          ...prev,
          expoPushToken: token,
          isRegistered: false,
          error: 'Failed to register push token with server',
        }));
        return token;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to register for push notifications';
      console.error('[Push] Registration error:', message);
      setState((prev) => ({ ...prev, error: message }));
      return null;
    }
  }, [getProjectId]);

  // Unregister push token (call on logout)
  const unregisterPushToken = useCallback(async () => {
    const token = currentTokenRef.current;
    if (!token) {
      console.log('[Push] No token to unregister');
      return;
    }

    try {
      await pushApi.removeToken(token);
      console.log('[Push] Token unregistered from backend');
    } catch (error) {
      console.error('[Push] Failed to unregister token:', error);
    }

    currentTokenRef.current = null;
    setState((prev) => ({
      ...prev,
      expoPushToken: null,
      isRegistered: false,
    }));
  }, []);

  // Setup notification listeners
  useEffect(() => {
    // Listener for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('[Push] Notification received:', notification.request.content.title);
        options.onNotificationReceived?.(notification);
      }
    );

    // Listener for when user taps on notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('[Push] Notification tapped:', response.notification.request.content.title);
        const data = response.notification.request.content.data as NotificationData;
        console.log('[Push] Notification data:', data);
        options.onNotificationResponse?.(response);
      }
    );

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [options.onNotificationReceived, options.onNotificationResponse]);

  // Android notification channel setup
  useEffect(() => {
    if (Platform.OS === 'android') {
      // Default channel for general notifications
      Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB', // Primary brand color
      });

      // Task notifications channel
      Notifications.setNotificationChannelAsync('tasks', {
        name: 'Tasks',
        description: 'Task assignments and status updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB',
      });

      // Attendance notifications channel
      Notifications.setNotificationChannelAsync('attendance', {
        name: 'Attendance',
        description: 'Clock in/out and break reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#16A34A', // Green
      });
    }
  }, []);

  return {
    ...state,
    registerForPushNotifications,
    unregisterPushToken,
  };
}

// Helper function to extract task ID from notification
export function getTaskIdFromNotification(
  notification: Notifications.Notification | Notifications.NotificationResponse
): string | null {
  const data = 'notification' in notification
    ? (notification.notification.request.content.data as NotificationData)
    : (notification.request.content.data as NotificationData);

  return data?.taskId ?? null;
}

// Helper function to get notification type
export function getNotificationType(
  notification: Notifications.Notification | Notifications.NotificationResponse
): string | null {
  const data = 'notification' in notification
    ? (notification.notification.request.content.data as NotificationData)
    : (notification.request.content.data as NotificationData);

  return data?.type ?? null;
}
