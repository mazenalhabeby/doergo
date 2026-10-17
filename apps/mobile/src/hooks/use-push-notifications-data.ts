import { useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import {
  forgetPushToken,
  rememberPushToken,
  storedPushToken,
  storedRegistration,
} from '../lib/push-token-store';
import { pushApi } from '../lib/api';
import { getPreferredLanguage } from '../i18n';

export interface PushNotificationState {
  expoPushToken: string | null;
  isRegistered: boolean;
  permissionStatus: 'undetermined' | 'granted' | 'denied';
  error: string | null;
}

export interface UsePushNotificationsOptions {
  // Called when a notification is received while app is in foreground
  onNotificationReceived?: (notification: Notifications.Notification) => void;
  // Called when user taps on a notification
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void;
}

/** usePushNotifications's state and handlers — everything before its markup, moved here unchanged. */
export function usePushNotificationsData(options: UsePushNotificationsOptions = {}) {
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

      // Determine platform
      const platform = Platform.OS as 'ios' | 'android';

      // Skip registration if neither the token nor the language changed (avoid
      // a redundant API call). The language is part of the key because the
      // server writes pushes in it: a member who switched to German while
      // offline is re-registered on the next launch instead of staying English.
      const locale = await getPreferredLanguage();
      const registration = `${token}|${locale}`;
      const cachedToken = await storedRegistration();
      if (cachedToken === registration && currentTokenRef.current === token) {
        setState((prev) => ({
          ...prev,
          expoPushToken: token,
          isRegistered: true,
          error: null,
        }));
        return token;
      }

      // Register token with backend
      try {
        await pushApi.registerToken({
          token,
          platform,
          deviceId: Device.deviceName ?? undefined,
          locale,
        });

        currentTokenRef.current = token;
        await rememberPushToken(registration);
        setState((prev) => ({
          ...prev,
          expoPushToken: token,
          isRegistered: true,
          error: null,
        }));

        return token;
      } catch {
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
      setState((prev) => ({ ...prev, error: message }));
      return null;
    }
  }, [getProjectId]);

  // Unregister push token (call on logout)
  const unregisterPushToken = useCallback(async () => {
    // Read the token from AsyncStorage, NOT the per-hook ref. Registration
    // happens in the layout's hook instance while logout calls this from a fresh
    // instance (profile/auth-context) where the ref is always null — so the
    // removeToken call never fired and a shared device kept receiving the
    // previous user's push. (Sec audit H11.)
    const token = currentTokenRef.current || (await storedPushToken());
    if (!token) {
      return;
    }

    try {
      await pushApi.removeToken(token);
    } catch {
      /*
        ⚠️ KEEP the cached token when the removal failed.

        It used to be cleared either way, so a removal that did not land left
        the row on the server bound to a member who had signed out — and the
        phone, having forgotten the token, could never name it again. The
        notifications had no way of stopping. Held instead, so the next
        sign-out (which sends it with `/auth/logout`) can still clear it.
      */
      return;
    }

    currentTokenRef.current = null;
    await forgetPushToken();
    setState((prev) => ({
      ...prev,
      expoPushToken: null,
      isRegistered: false,
    }));
  }, []);

  return { state, notificationListener, responseListener, registerForPushNotifications, unregisterPushToken };
}
