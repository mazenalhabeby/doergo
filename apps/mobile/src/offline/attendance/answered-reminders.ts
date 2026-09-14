import type { SyncOperationName } from '@hbcfield/shared/client';
import type { OutboxOp } from '../outbox/types';

/**
 * Which reminder a queued action has already answered.
 *
 * "You haven't clocked in" is answered by a clock-in the phone is holding;
 * "Still clocked in?" by a clock-out; "time for your rest" by starting one.
 * Only an action taken within the reminder's window counts — yesterday's
 * clock-in does not answer this morning's reminder.
 */
const ANSWERED_BY: Record<string, readonly SyncOperationName[]> = {
  noshow_reminder: ['attendance.clockIn'],
  // "Still clocked in?" — answered by leaving, or by saying they are staying.
  shift_reminder: ['attendance.clockOut', 'attendance.extraTime'],
  break_due: ['attendance.breakStart'],
  break_over: ['attendance.breakEnd'],
};

/** How far before the reminder an action still answers it. A shift and a half. */
const WINDOW_MS = 12 * 60 * 60 * 1000;

/** Refused or thrown away: that action did not happen, so the reminder stands. */
const NOT_ANSWERING = new Set<OutboxOp['state']>(['failed', 'conflict', 'discarded']);

export function reminderAnswered(
  data: Record<string, unknown> | undefined,
  notifiedAt: number,
  ops: readonly Pick<OutboxOp, 'op' | 'state' | 'createdAt'>[],
): boolean {
  const type = typeof data?.type === 'string' ? data.type : null;
  const answering = type ? ANSWERED_BY[type] : undefined;
  if (!answering) return false;
  return ops.some(
    (o) => answering.includes(o.op) && !NOT_ANSWERING.has(o.state) && o.createdAt >= notifiedAt - WINDOW_MS,
  );
}

/** Notification dates: milliseconds on Android, seconds on some iOS versions. */
export function notificationTime(date: number): number {
  return date < 1e12 ? date * 1000 : date;
}
