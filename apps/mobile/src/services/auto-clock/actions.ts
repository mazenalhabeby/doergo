import { sessionStartedAt } from '@/lib/api/client';
import { mayActOnPush } from '@/lib/push-recipient';
import {
  requestExtraTimeFromPhone,
  skipAutoRestFromPhone,
  undoAutoClockInFromPhone,
} from '@/offline/attendance/shift-actions';
import { liveEngineFor } from '@/offline/live-engine';
import { AUTO_CLOCK_ACTIONS, autoClockNotifier, type AutoClockAction } from './notifications';

export type AutoClockActionResult =
  | 'undone'
  | 'undoQueued'
  | 'tooLate'
  /** Not undoable any more for another reason: the shift closed, or work is already recorded on it. */
  | 'cannotUndo'
  | 'restSkipped'
  | 'restSkipQueued'
  | 'extraSent'
  | 'extraQueued'
  /** No fixed shift and no daily limit: "Still working" just carries on — nothing to approve. */
  | 'carryOn'
  /** "Clock out" — the Clock screen opens, where the clock-out asks what it always asks. */
  | 'openClock'
  | 'notYours'
  | 'failed';

/**
 * Do what an automatic-clock button said. Never throws.
 *
 * Each goes through the outbox like the same tap on a screen, so it works with
 * no signal: an undo of a clock-in still held on the phone simply takes it back;
 * one already sent is queued and judged by the server on the tap's own time.
 *
 * ⚠️ `not-yours`: the notification was for whoever was signed in when it was
 * scheduled (`recipientId`) — a button pressed after somebody else signed in on
 * this phone does nothing for them.
 */
export async function runAutoClockAction(
  action: AutoClockAction,
  data: Record<string, unknown> | undefined,
  who: { userId: string | null; deliveredAt: number | null },
): Promise<AutoClockActionResult> {
  const started = await sessionStartedAt().catch(() => null);
  if (!mayActOnPush({ data, deliveredAt: who.deliveredAt, userId: who.userId, sessionStartedAt: started }))
    return 'notYours';
  if (action === AUTO_CLOCK_ACTIONS.clockOut) return 'openClock';
  const entryId = typeof data?.entryId === 'string' ? data.entryId : null;
  const engine = who.userId ? liveEngineFor(who.userId)?.engine : null;
  if (!entryId || !engine) return 'failed';
  try {
    if (action === AUTO_CLOCK_ACTIONS.undo) {
      const r = await undoAutoClockInFromPhone(engine, { entryId });
      if (r.kind === 'refused') {
        if (r.code !== 'AUTO_CLOCK_UNDO_NOT_ALLOWED') return 'failed';
        // NOT_AUTOMATIC / CLOSED / WORK_RECORDED / TOO_LATE — only the office can correct it now.
        return r.params?.why === 'TOO_LATE' ? 'tooLate' : 'cannotUndo';
      }
      await autoClockNotifier.cancel(entryId);
      return r.kind === 'queued' ? 'undoQueued' : 'undone';
    }
    if (action === AUTO_CLOCK_ACTIONS.skipRest) {
      const r = await skipAutoRestFromPhone(engine, { entryId });
      if (r.kind === 'refused') return 'failed';
      await autoClockNotifier.cancel(entryId, ['rest']);
      return r.kind === 'queued' ? 'restSkipQueued' : 'restSkipped';
    }
    if (action === AUTO_CLOCK_ACTIONS.stillWorking) {
      // A session with no shift, or past only the daily-hours marker: all of the time counts, there is no
      // planned end to extend — carrying on is the whole answer (clock review B2).
      if (data?.presence === true || data?.limit === true) {
        await autoClockNotifier.cancel(entryId, ['end']);
        return 'carryOn';
      }
      // Still here after a real shift end: the same "I'm working extra time" as the Clock screen — a leader decides.
      const r = await requestExtraTimeFromPhone(engine, { entryId });
      if (r.kind === 'refused') {
        // Nothing to ask here (no planned end, or the organization has no extra time): keep working; the time
        // after the end is decided with the day, as time outside the shift (A8).
        await autoClockNotifier.cancel(entryId, ['end']);
        return 'carryOn';
      }
      await autoClockNotifier.cancel(entryId, ['end']);
      return r.kind === 'queued' ? 'extraQueued' : 'extraSent';
    }
  } catch {
    return 'failed';
  }
  return 'failed';
}
