import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * This device's Expo push registration, as the phone remembers it.
 *
 * Its own module because two places need the token and neither should have to
 * load the other: `usePushNotifications` (a React hook that pulls in
 * expo-notifications) writes it, and `authApi.logout` — plain, hook-free —
 * reads it to send with the sign-out.
 */
const PUSH_TOKEN_CACHE_KEY = 'hbcfield_push_token_registered';

export async function storedPushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_CACHE_KEY);
  } catch {
    return null;
  }
}

export async function rememberPushToken(token: string): Promise<void> {
  await AsyncStorage.setItem(PUSH_TOKEN_CACHE_KEY, token).catch(() => undefined);
}

/**
 * Forget this device's registration.
 *
 * ⚠️ Call this only when the server has actually been told, or when the token
 * is being replaced. Forgetting it after a FAILED removal is what orphaned
 * rows permanently: the row stays on the server, bound to a member who has
 * signed out, and the phone can no longer name the token that would remove it
 * — so the notifications simply never stop.
 */
export async function forgetPushToken(): Promise<void> {
  await AsyncStorage.removeItem(PUSH_TOKEN_CACHE_KEY).catch(() => undefined);
}
