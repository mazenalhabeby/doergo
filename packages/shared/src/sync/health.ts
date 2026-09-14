/**
 * What a phone's last report about its queue means, in one word.
 *
 * One rule, read by the Prometheus alert and by the office's "Phone sync" tab,
 * so the page and the alert can never disagree about who is stuck.
 */

/** Work unsent this long is stuck. */
export const SYNC_STUCK_AFTER_MS = 24 * 60 * 60 * 1000;
/** A phone silent this long is not heard from — off, uninstalled, or on an app without offline work. */
export const SYNC_SILENT_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export type SyncHealthState = 'silent' | 'stuck' | 'needs_member' | 'sending' | 'up_to_date';

export interface SyncHealthFacts {
  waiting: number;
  attention: number;
  oldestWaitingAt: number | null;
  /** When the server received the report (epoch ms). */
  receivedAt: number;
}

/**
 * In order of what somebody should do about it: a phone not heard from tells
 * nothing else reliably; work not reaching the server outranks work waiting on
 * the member, because only the first can be lost with the phone.
 */
export function syncHealthState(r: SyncHealthFacts, now: number): SyncHealthState {
  if (now - r.receivedAt >= SYNC_SILENT_AFTER_MS) return 'silent';
  if (r.waiting > 0 && r.oldestWaitingAt !== null && now - r.oldestWaitingAt >= SYNC_STUCK_AFTER_MS) return 'stuck';
  if (r.attention > 0) return 'needs_member';
  if (r.waiting > 0) return 'sending';
  return 'up_to_date';
}
