import Constants from 'expo-constants';
import type { UrlEnvironment } from './base-url';

/**
 * What this build was given — read in ONE place for the API client and the
 * socket. The rules that turn it into an address are `base-url.ts`.
 *
 * ⚠️ `process.env.EXPO_PUBLIC_*` must stay written out literally: Expo inlines
 * them by text at bundle time, and a computed lookup is left `undefined`.
 */
export function urlEnvironment(): UrlEnvironment {
  return {
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL,
    debuggerHost: Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost,
    dev: typeof __DEV__ !== 'undefined' && !!__DEV__,
  };
}
