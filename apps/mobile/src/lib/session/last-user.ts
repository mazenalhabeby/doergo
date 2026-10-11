import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Who signed in on this phone most recently — by password OR fingerprint.
 *
 * ⚠️ Why the login screen needs it. The fingerprint key belongs to ONE account
 * (whoever enrolled it). When a colleague later signs in on the same phone with
 * their password and their session ends, the login screen used to throw the
 * fingerprint prompt up at once — and the OS sheet covers the screen that names
 * whose account it opens. One touch and they were inside the FIRST person's
 * account. The prompt now opens by itself only when the key's owner is also the
 * last person who used the phone; otherwise the password form comes first, with
 * the fingerprint one tap away and clearly labelled.
 *
 * Not a secret (an id and an email the member typed), so plain storage. It is
 * deliberately NOT cleared on sign-out: it answers "who was here last".
 */
const LAST_USER_KEY = 'hbcfield_last_signed_in_user';

export interface LastUser {
  userId: string;
  email: string;
}

export async function loadLastUser(): Promise<LastUser | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_USER_KEY);
    return raw ? (JSON.parse(raw) as LastUser) : null;
  } catch {
    return null;
  }
}

export async function saveLastUser(user: LastUser): Promise<void> {
  await AsyncStorage.setItem(LAST_USER_KEY, JSON.stringify(user)).catch(() => undefined);
}

/**
 * Should the login screen open the fingerprint prompt by itself?
 * Only for the key's owner, and only when nobody else has used the phone since.
 */
export function shouldAutoPromptFor(ownerUserId: string | null | undefined, last: LastUser | null): boolean {
  if (!ownerUserId) return false;
  return !last || last.userId === ownerUserId;
}
