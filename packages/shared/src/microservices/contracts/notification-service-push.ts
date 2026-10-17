/** Message contracts for notification-service `push` handlers (types only — the wire is the cmd string). */
import { rpc } from '../contract';

export const registerPushToken = rpc<{
  userId: string;
  token: string;
  platform: string;
  deviceId?: string;
  locale?: string;
}>('register_push_token');
export const removePushToken = rpc<{ token: string; userId?: string }>('remove_push_token');
export const appUpdateNotice = rpc<{ version: string; dryRun?: boolean }>('app_update_notice');
