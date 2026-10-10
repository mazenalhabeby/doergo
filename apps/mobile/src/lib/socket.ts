/**
 * Socket.IO client for real-time updates (mobile)
 *
 * Mirrors the web app pattern from apps/web-app/src/lib/socket.ts
 * Connects to the notification service on port 4001.
 */

import { SocketEvents } from '@hbcfield/shared/client';
import { resolveSocketUrl } from './api/base-url';
import { urlEnvironment } from './api/url-environment';

export { SocketEvents };

/**
 * The Socket.IO server's address — same host as the API (nginx proxies
 * /socket.io/ in production), port 4001 in development.
 *
 * ⚠️ ONE resolver with the API client (`base-url.ts`): a release build only
 * ever connects over https, whatever the env says. (Sec audit H10.)
 */
export function getSocketUrl(): string {
  return resolveSocketUrl(urlEnvironment());
}
