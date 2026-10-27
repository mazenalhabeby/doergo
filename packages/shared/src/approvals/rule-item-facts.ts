/**
 * Facts the newer approval-rule kinds are judged on, worked out ONCE for the approve path (the gate) and
 * for the reader (the "nobody answers" sweep and the rules page) — so a rule cannot see a decision one way
 * at the moment of approving and another way in its numbers.
 */

type When = Date | string | null | undefined;

const ms = (v: When) => (v == null ? null : new Date(v).getTime());

/**
 * Hours changed by hand: how far an entry's times were moved from what was clocked, in whole minutes. The
 * originals are kept on the FIRST edit, so this is the whole change, however many edits. An entry still open
 * when it was first edited has no original clock-out: only its start counts.
 */
export function handChangedMinutes(e: {
  isEdited?: boolean | null;
  originalClockIn?: When;
  originalClockOut?: When;
  clockInAt: When;
  clockOutAt?: When;
}): number {
  if (!e.isEdited) return 0;
  const diff = (now: When, was: When) => {
    const a = ms(now);
    const b = ms(was);
    return a == null || b == null ? 0 : Math.abs(a - b);
  };
  return Math.round((diff(e.clockInAt, e.originalClockIn) + diff(e.clockOutAt, e.originalClockOut)) / 60_000);
}

/** A client request is urgent when its priority is. */
export const isUrgentPriority = (priority: string | null | undefined) => priority === 'URGENT';
