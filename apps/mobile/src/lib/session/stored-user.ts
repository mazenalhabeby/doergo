import * as SecureStore from 'expo-secure-store';
import type { User } from '../api/types';

/**
 * The signed-in member as last told by the server, kept for a cold start.
 *
 * One home for the key, so the session's end (`end-session.ts`) and the auth
 * context can never disagree about where it lives — the auth-failure path used
 * to be the only exit that knew to delete it, and it deleted nothing else.
 */
export const USER_KEY = 'hbcfield_user';

export async function loadStoredUser(): Promise<User | null> {
  try {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export async function saveStoredUser(user: User): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function clearStoredUser(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_KEY).catch(() => undefined);
}
