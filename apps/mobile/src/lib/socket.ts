/**
 * Socket.IO client for real-time updates (mobile)
 *
 * Mirrors the web app pattern from apps/web-app/src/lib/socket.ts
 * Connects to the notification service on port 4001.
 */

import Constants from 'expo-constants';
import { SocketEvents } from '@hbcfield/shared/client';

export { SocketEvents };

/**
 * Get the Socket.IO server URL dynamically (same host as API but port 4001)
 */
export function getSocketUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_SOCKET_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl;
  }

  // In production, derive socket URL from API URL (same host, /socket.io path via nginx)
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (apiUrl && apiUrl.includes('https://')) {
    // Production: use same origin (nginx proxies /socket.io/ to port 4001)
    const url = new URL(apiUrl);
    return `${url.protocol}//${url.host}`;
  }

  // In development, derive from Expo's dev server host
  const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    return `http://${host}:4001`;
  }

  return 'http://localhost:4001';
}
