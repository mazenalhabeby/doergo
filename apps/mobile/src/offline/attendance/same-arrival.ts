import { STILL_MINE } from '../actions/outcome';
import { openOpFor } from '../outbox/open-ops';
import type { OutboxOp } from '../outbox/types';
import type { SyncEngine } from '../sync-engine';

type ClockInBody = { id?: string; locationId?: string; trigger?: string };

/**
 * The member taps "Clock in" at a workspace whose automatic arrival is still on
 * the phone: that is the SAME arrival, never a second shift.
 *
 * - The automatic clock-in has not reached the server yet → it is the shift;
 *   nothing new is filed.
 * - It reached the server, but an automatic departure for it is still on the
 *   phone → they are back before it went: the departure is taken back and the
 *   shift runs on.
 *
 * Anything else (the departure already reached the server, a tap at another
 * workspace) is a new clock-in, as before. 13 Oct: an automatic clock-in and a
 * tap, both offline, became an 11-second entry and a second real one.
 *
 * Returns the existing entry's id, or null when the tap is a new arrival.
 */
export async function sameArrival(
  engine: SyncEngine,
  locationId: string | undefined,
): Promise<{ entryId: string; reachedServer: boolean; response?: unknown } | null> {
  if (!locationId) return null;
  const ops: readonly OutboxOp[] = engine.operations();
  const auto = [...ops].reverse().find((o) => {
    if (o.op !== 'attendance.clockIn' || !(STILL_MINE.has(o.state) || o.state === 'done')) return false;
    const b = (o.payload.body ?? {}) as ClockInBody;
    return b.trigger === 'AUTO' && b.locationId === locationId;
  });
  const entryId = (auto?.payload.body as ClockInBody | undefined)?.id;
  if (!auto || !entryId) return null;

  const departure = openOpFor(ops, 'attendance.clockOut', (b) => b.entryId === entryId);
  if (STILL_MINE.has(auto.state)) {
    if (!departure) return { entryId, reachedServer: false };
    return (departure.payload.body as { trigger?: string }).trigger === 'AUTO' &&
      (await engine.cancelPending(departure.id))
      ? { entryId, reachedServer: false }
      : null;
  }
  // The clock-in reached the server: only a still-unsent automatic departure can be taken back.
  if (
    departure &&
    (departure.payload.body as { trigger?: string }).trigger === 'AUTO' &&
    (await engine.cancelPending(departure.id))
  ) {
    return { entryId, reachedServer: true, response: auto.response };
  }
  return null;
}
