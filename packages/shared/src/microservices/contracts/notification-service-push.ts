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
/** The member's in-app inbox — notification-service owns `NotificationDelivery`. */
export const listNotifications = rpc<{ userId: string; limit?: number }>('list_notifications');
export const markNotificationsRead = rpc<{ userId: string; ids?: string[] }>('mark_notifications_read');
export const appUpdateNotice = rpc<{ version: string; dryRun?: boolean }>('app_update_notice');

/** A member deleting their account: notification erases their phones' push tokens. Idempotent. */
export const notificationEraseMember = rpc<{ userId: string }, { success: boolean; data?: { tokensRemoved: number } }>(
  'notification_erase_member',
);
