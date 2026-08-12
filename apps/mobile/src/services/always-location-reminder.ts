import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Cooldown so we remind at most once per window — a heads-up, never a nag.
const LAST_REMINDED_KEY = 'always_loc_reminded_at';
const COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12h

/**
 * Fire a local notification nudging the worker to switch location to "Always",
 * but only if: they're missing it (caller decides), notifications are permitted,
 * and we haven't reminded within the cooldown. This reaches them even when the
 * app is closed — the in-app banner only helps once they open the app. "Smart":
 * deduped by a persisted timestamp so it won't spam across screens or launches.
 */
export async function remindAlwaysLocationIfNeeded(strings: { title: string; body: string }): Promise<void> {
  try {
    // Respect the cooldown.
    const last = await AsyncStorage.getItem(LAST_REMINDED_KEY);
    if (last && Date.now() - Number(last) < COOLDOWN_MS) return;

    // Only if the OS lets us post notifications (don't prompt here — the push
    // hook already handles the permission ask on startup).
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: strings.title,
        body: strings.body,
        data: { type: 'attendance.enable_always_location' },
        ...(Platform.OS === 'android' ? { channelId: 'attendance' } : {}),
      },
      trigger: null, // deliver immediately
    });

    await AsyncStorage.setItem(LAST_REMINDED_KEY, String(Date.now()));
  } catch {
    // Best-effort — a failed reminder must never disrupt attendance.
  }
}

/**
 * Reset the cooldown once "Always" is granted, so if the worker ever regresses
 * to "While using" again they get reminded promptly rather than after 12h.
 */
export async function clearAlwaysLocationReminder(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_REMINDED_KEY);
  } catch {
    // ignore
  }
}
