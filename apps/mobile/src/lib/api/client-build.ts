import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { resolveApiUrl } from './base-url';
import { urlEnvironment } from './url-environment';

/** Where the API is, and which build is asking — moved here unchanged from client.ts. */
/**
 * The API's address. ⚠️ A release build only ever gets an https address — see
 * `base-url.ts`, shared with the socket so the two can never disagree again.
 */
export function getApiUrl(): string {
  return resolveApiUrl(urlEnvironment());
}

/*
  Which build this is, sent on every request.

  The server had no way to know what anybody was running. When a crash took out
  every Play Store user, "who is affected" and "who still needs to update" could
  not be asked at all, so the only available response was to notify everybody.

  Two headers rather than a parsed user-agent: this is a fact the app knows
  about itself, and guessing it from a string other libraries also write is how
  it silently stops being true.
*/
export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';

export const APP_PLATFORM: string = Platform.OS === 'ios' ? 'ios' : 'android';

/**
 * Resolve a media path (e.g. an uploaded avatar `/uploads/avatars/…`) to an
 * absolute URL. React Native's <Image> can't load relative URIs, so uploaded
 * avatars render blank without this. Absolute URLs (http/https, data:) pass
 * through unchanged. The origin is the API host without the `/api/v1` prefix,
 * since static uploads are served from the host root.
 */
export function resolveMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:')) return url;
  const origin = getApiUrl().replace(/\/api\/v\d+\/?$/, '');
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}
