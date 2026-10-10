/**
 * WHERE THE APP TALKS TO — the one resolver for the API and the socket.
 *
 * The API client and the socket each had their own copy of this, and they
 * disagreed: the socket accepted any `EXPO_PUBLIC_API_URL` that merely
 * CONTAINED "https://", the client accepted any non-empty value at all. A
 * release build pointed at `http://…` by a stray `.env` would have sent every
 * bearer token in the clear.
 *
 * ⚠️ A RELEASE BUILD NEVER TALKS PLAIN HTTP. Outside `__DEV__` anything that is
 * not `https:` is refused and the shipped address is used instead — the same
 * final fallback that already protects an OTA whose env was not inlined.
 * Development keeps `http://` (the local API, the LAN dev host) on purpose.
 *
 * Pure: the environment is passed in, so the rule is tested without a phone.
 */

export const RELEASE_API_URL = 'https://hbcfield.com/api/v1';
export const RELEASE_ORIGIN = 'https://hbcfield.com';

export interface UrlEnvironment {
  /** `EXPO_PUBLIC_API_URL`, as inlined into the bundle. */
  apiUrl?: string | null;
  /** `EXPO_PUBLIC_SOCKET_URL`. */
  socketUrl?: string | null;
  /** Expo's dev-server host ("192.168.1.20:8081") — only present in development. */
  debuggerHost?: string | null;
  /** `__DEV__`. */
  dev: boolean;
}

/** Is this an absolute URL the given build may use? Release: https only. */
export function isAllowedUrl(url: string, dev: boolean): boolean {
  const m = /^([a-z][a-z0-9+.-]*):\/\/[^/\s]+/i.exec(url.trim());
  if (!m) return false;
  const scheme = m[1]!.toLowerCase();
  return scheme === 'https' || (dev && scheme === 'http');
}

function originOf(url: string): string | null {
  const m = /^([a-z][a-z0-9+.-]*:\/\/[^/?#\s]+)/i.exec(url.trim());
  return m ? m[1]! : null;
}

export function resolveApiUrl(env: UrlEnvironment): string {
  const explicit = env.apiUrl?.trim();
  if (explicit) {
    if (isAllowedUrl(explicit, env.dev)) return explicit;
    // A release build handed an http:// address: never use it.
    if (!env.dev) return RELEASE_API_URL;
  }
  if (env.dev && env.debuggerHost) {
    // "192.168.178.26:8081" → the API on port 4000 of the same machine.
    return `http://${env.debuggerHost.split(':')[0]}:4000/api/v1`;
  }
  // No env and no dev host: a shipped app must hit the real API, never localhost.
  return env.dev ? 'http://localhost:4000/api/v1' : RELEASE_API_URL;
}

export function resolveSocketUrl(env: UrlEnvironment): string {
  const explicit = env.socketUrl?.trim();
  if (explicit && isAllowedUrl(explicit, env.dev)) return explicit;
  // Production: the API's own origin — nginx proxies /socket.io/ to the notification service.
  const api = env.apiUrl?.trim();
  if (api && isAllowedUrl(api, false)) return originOf(api) ?? RELEASE_ORIGIN;
  if (env.dev && env.debuggerHost) return `http://${env.debuggerHost.split(':')[0]}:4001`;
  if (env.dev && api && isAllowedUrl(api, true)) {
    // A local http API: the socket is the notification service beside it.
    const origin = originOf(api);
    if (origin) return origin.replace(/:\d+$/, '') + ':4001';
  }
  return env.dev ? 'http://localhost:4001' : RELEASE_ORIGIN;
}
