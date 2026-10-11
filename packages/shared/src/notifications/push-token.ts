/**
 * The Expo push token alone, from whatever a phone remembered about it.
 *
 * ⚠️ Since 2026-09-15 the phone remembers its registration as `token|language`,
 * so a language change re-registers it. Every sign-out then sent that whole
 * string as the token to remove; the server stores the bare token, matched
 * nothing, and the phone went on receiving the signed-out member's
 * notifications. Phone and server both read the token through this, so an app
 * that has not updated yet is still understood.
 */
export function barePushToken(value: string | null | undefined): string | null {
  const token = value?.split('|')[0]?.trim();
  return token ? token : null;
}
