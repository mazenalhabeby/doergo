import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { forgetPushToken, rememberPushToken, storedPushToken, storedRegistration } from '../lib/push-token-store';
import { pushApi, getAccessToken } from '../lib/api';
import i18n, { getPreferredLanguage } from '../i18n';
import { isNotificationSuppressed } from '../lib/notification-suppression';
import { PUSH_CHANNELS, RETIRED_PUSH_CHANNELS } from '@hbcfield/shared/client';
import { CALENDAR_ACTIONS, CALENDAR_INVITE_CATEGORY, CALENDAR_REMINDER_CATEGORY } from '../lib/calendar-push-actions';
import { registerAutoClockCategories } from '../services/auto-clock/notifications';

/** The crew push's category and its one button (notification-service sends `category: 'crew_join'`). */
export const CREW_JOIN_CATEGORY = 'crew_join';
export const CREW_JOIN_ACTION = 'crew_join';


// Configure how notifications appear when the app is in the foreground.
// ⚠️ Without this handler a notification that arrives while the app is OPEN is
// not shown at all — no banner, no sound. push-foreground-handler.spec.ts pins it.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // Already answered on this phone (a clock-in waiting to send, say): show nothing.
    // Nobody signed in: show nothing either — a signed-out phone is not anyone's inbox.
    const signedIn = !!(await getAccessToken().catch(() => null));
    const show = signedIn && !isNotificationSuppressed(
      notification.request.content.data as Record<string, unknown> | undefined,
      Date.now(),
    );
    return {
      shouldShowAlert: show,
      shouldPlaySound: show,
      shouldSetBadge: show,
      shouldShowBanner: show,
      shouldShowList: show,
    };
  },
});

/** A tap older than this, found at launch, is history rather than an instruction. */
const LAUNCH_TAP_MAX_AGE_MS = 30 * 60 * 1000;

/*
  Taps already acted on, by notification id. One tap can arrive twice — at
  launch through getLastNotificationResponse and, on Android, through the
  listener as well — and it navigates once.
*/
const handledTaps = new Set<string>();
function isNewTap(response: Notifications.NotificationResponse): boolean {
  const id = response.notification.request.identifier;
  if (handledTaps.has(id)) return false;
  handledTaps.add(id);
  return true;
}

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

  // Setup notification listeners
  useEffect(() => {
    // Listener for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        options.onNotificationReceived?.(notification);
      }
    );

    // Listener for when user taps on notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const handler = options.onNotificationResponse;
        if (handler && isNewTap(response)) handler(response);
      }
    );

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [options.onNotificationReceived, options.onNotificationResponse]);

  /*
    The tap that LAUNCHED the app.

    ⚠️ This is why every notification used to open Home. With the app closed,
    the tap is delivered while the splash screen and sign-in are still running —
    before any screen that listens exists — so the listener above never hears
    it, and the start-up redirect lands on Home. Asked for once the listening
    screen is up, it is still there to act on.
  */
  const onResponse = options.onNotificationResponse;
  useEffect(() => {
    if (!onResponse) return;
    let response: Notifications.NotificationResponse | null = null;
    try {
      response = Notifications.getLastNotificationResponse();
    } catch {
      return; // a build without the native call
    }
    if (!response) return;
    // Milliseconds on Android; some iOS versions report seconds.
    const { date } = response.notification;
    const sent = date < 1e12 ? date * 1000 : date;
    if (Date.now() - sent > LAUNCH_TAP_MAX_AGE_MS || !isNewTap(response)) return;
    // Consumed: a remount after sign-out/in must not replay it.
    try {
      Notifications.clearLastNotificationResponse();
    } catch {
      /* the in-memory set still stops a replay this session */
    }
    onResponse(response);
  }, [onResponse]);

  /*
    The crew push's button — "I'm with them" (shared tasks/crew.ts). A category
    is the JS API on both platforms (no native change, OTA-safe). Opening the app
    is what joins: the job page asks the server with the leader's start.
  */
  useEffect(() => {
    /*
      ⚠️ ONE AT A TIME. iOS keeps the categories as ONE set, and each call reads
      it and writes it back — started together they overwrite each other and the
      losers' buttons vanish without an error. The automatic clock's Undo did.
    */
    const open = { opensAppToForeground: true };
    void (async () => {
      await Notifications.setNotificationCategoryAsync(CREW_JOIN_CATEGORY, [
        { identifier: CREW_JOIN_ACTION, buttonTitle: i18n.t('job.crew.pushJoin'), options: open },
      ]).catch(() => undefined);
      // The calendar's buttons (src/lib/calendar-push-actions.ts): a reminder's Done / +10 min, an invitation's answer.
      await Notifications.setNotificationCategoryAsync(CALENDAR_REMINDER_CATEGORY, [
        { identifier: CALENDAR_ACTIONS.done, buttonTitle: i18n.t('calendar.push.done'), options: open },
        { identifier: CALENDAR_ACTIONS.snooze, buttonTitle: i18n.t('calendar.push.snooze'), options: open },
      ]).catch(() => undefined);
      await Notifications.setNotificationCategoryAsync(CALENDAR_INVITE_CATEGORY, [
        { identifier: CALENDAR_ACTIONS.accept, buttonTitle: i18n.t('calendar.push.accept'), options: open },
        { identifier: CALENDAR_ACTIONS.maybe, buttonTitle: i18n.t('calendar.push.maybe'), options: open },
        { identifier: CALENDAR_ACTIONS.decline, buttonTitle: i18n.t('calendar.push.decline'), options: { ...open, isDestructive: true } },
      ]).catch(() => undefined);
      // The automatic clock's buttons (src/services/auto-clock/notifications.ts): Undo, Still working, Clock out.
      await registerAutoClockCategories();
    })();
  }, []);

  // Android notification channel setup
  useEffect(() => {
    if (Platform.OS === 'android') {
      // Default channel for general notifications
      Notifications.setNotificationChannelAsync(PUSH_CHANNELS.DEFAULT, {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#059669', // Primary brand color
      });

      // Task notifications channel
      Notifications.setNotificationChannelAsync(PUSH_CHANNELS.TASKS, {
        name: 'Tasks',
        description: 'Task assignments and status updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#059669',
      });

      /*
        Attendance — the channel that has to be able to interrupt.

        ⚠️ It is `attendance_v2`, and the id matters. Android hands a channel to
        the USER at creation: importance, sound and vibration are theirs from
        then on, and calling this again with a higher importance is silently
        ignored. The original `attendance` channel was registered at
        IMPORTANCE_DEFAULT — it makes a sound and then sits in the shade, never
        appearing over what the member is looking at. On every phone that has
        ever run this app it is still DEFAULT and always will be.

        So: a new id at HIGH, and the old one deleted below, or the member ends
        up with two "Attendance" switches in their settings and one of them does
        nothing. A rest falling due and a shift ending are time-bound — worth
        interrupting for, or not worth sending.
      */
      Notifications.setNotificationChannelAsync(PUSH_CHANNELS.ATTENDANCE, {
        name: 'Attendance',
        description: 'Shift, rest and clock reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#16A34A', // Green
      });

      // Retire channels replaced by a version bump. Deleting is safe when the
      // channel was never created; it is the only way to remove a dead switch
      // from the member's notification settings.
      for (const retired of RETIRED_PUSH_CHANNELS) {
        Notifications.deleteNotificationChannelAsync(retired).catch(() => {
          // Never created on this device — nothing to remove.
        });
      }
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

/**
 * Remove this device's push registration from the server — a plain (non-hook)
 * helper so logout paths that don't render usePushNotifications (e.g. the
 * auth-context session teardown) can still unregister. Reads the cached token
 * from AsyncStorage; best-effort (a dead session can't authenticate the removal).
 * (Sec audit H11.)
 */
export async function purgePushTokenRegistration(): Promise<void> {
  const token = await storedPushToken();
  if (!token) return;
  try {
    await pushApi.removeToken(token);
  } catch {
    /*
      ⚠️ KEEP it. See the note in `unregisterPushToken` — forgetting a token
      whose removal failed is what left members receiving their own
      notifications on a phone they had signed out of, with nothing on either
      side able to name the row that would stop it.

      Since `/auth/logout` now carries the token itself, this helper is a
      fallback rather than the mechanism, and holding on costs nothing.
    */
    return;
  }
  await forgetPushToken();
}
