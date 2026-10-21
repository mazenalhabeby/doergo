/**
 * Single facts about a member that other services learn and auth-service stores — auth owns `User`
 * (docs/data-ownership.md, group F). Each is one column; auth checks the value before writing it.
 */
import { rpc } from '../contract';

/** notification-service: these members have an open socket now (connect + the heartbeat). */
export const usersMarkActive = rpc<
  { userIds: string[]; withPresence?: boolean },
  { success: boolean; presence?: Record<string, string | null> }
>('users_mark_active');
/** notification-service: this member's last socket closed and they are not on the clock. */
export const userMarkInactive = rpc<{ userId: string }, { success: boolean }>('user_mark_inactive');
/** notification-service: the language this member's app reports (a supported code only). */
export const userSetLocale = rpc<{ userId: string; locale: string }, { success: boolean }>('user_set_locale');
/** task-service: the member agreed to (or withdrew from) the automatic clock. ISO time or null. */
export const userSetAutoClockConsent = rpc<{ userId: string; consentAt: string | null }, { success: boolean }>(
  'user_set_auto_clock_consent',
);
