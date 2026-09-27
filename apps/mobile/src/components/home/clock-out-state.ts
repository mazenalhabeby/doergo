/**
 * THE SHIFT AS A RECEIPT — decided once, before anything is drawn.
 *
 * A shift ends in a record, so the sheet is set like one: the day to scale, the
 * times as a receipt, one jade button. Everything the sheet needs is arithmetic
 * over figures the CARD already holds, which is why nothing here fetches and
 * nothing here is async — §11.4.
 *
 * ⚠️ FOUR FACES AND ONLY THESE. A fifth would be a variance nobody named, and
 * this sheet is pressed every single day by people who are already leaving.
 */
export type ClockOutFace =
  /** ① On time — or no roster to be early or late against. */
  | 'onTime'
  /** ② Early — there is a target and they are under it. */
  | 'early'
  /** ③ Late — there is a target and they are past it. */
  | 'late';

export interface ClockOutShift {
  workspace: string | null;
  clockInAt: Date;
  /**
   * ⚠️ FROZEN AT OPEN, NEVER `new Date()` IN A RENDER — rule 4. A sheet left
   * sitting on a table must not silently bill more minutes than the receipt
   * showed, and the member is signing off the figure they can see.
   */
  clockOutAt: Date;
  /** Rests that do not count. Subtracted, and shown as a notch in the day. */
  restMinutes: number;
  /** What the card's hero said. ⚠️ Never called "paid". */
  countedMinutes: number;
  /**
   * The rostered length of the shift.
   *
   * ⚠️ NULL ON `NONE`, AND THAT IS WHY ② AND ③ CANNOT HAPPEN THERE. Nothing is
   * promised, so there is nothing to be early or late against — a target
   * invented here would put "short of your shift" on somebody who never had
   * one.
   */
  targetMinutes: number | null;
  /** The rostered end, for ③'s `Shift ended 15:00`. */
  shiftEndAt: Date | null;
  /** Metres from the workspace when the clock-out happened, when known. */
  awayMetres?: number | null;
  /** Who would approve extra time, when the server has said. */
  approver?: string | null;
  /** The moment of the clock-out (tests pass it; the sheet reads the clock). */
  now?: Date;
}

export interface ClockOutView {
  face: ClockOutFace;
  /** Minutes short of the roster. Positive only on ②. */
  shortBy: number;
  /** Minutes past the roster. Positive only on ③. */
  overBy: number;
  /**
   * ④ — outside the zone. NOT a face of its own: it is a fact about WHERE the
   * clock-out happened and it can be true of any of the three. The sheet shows
   * a strip and flags the row; ⚠️ it never changes the button, because this is
   * RECORDED, NEVER REFUSED.
   */
  away: { metres: number } | null;
  /** The day, as flex weights. Always sums to something drawable. */
  bar: { worked: number; rest: number; over: number; short: number };
}

/** Beyond this many metres the clock-out is worth flagging on the receipt. */
export const AWAY_METRES = 200;

export function readClockOut(shift: ClockOutShift): ClockOutView {
  const counted = Math.max(0, shift.countedMinutes);
  const rest = Math.max(0, shift.restMinutes);
  const target = shift.targetMinutes && shift.targetMinutes > 0 ? shift.targetMinutes : null;

  /*
    ⚠️ ONE MINUTE EITHER SIDE IS NOT A VARIANCE. Without a tolerance the sheet
    would call a shift "early" for finishing 40 seconds before the hour, which
    turns a daily act into a daily apology.
  */
  const TOLERANCE = 1;
  /*
    ⚠️ PAST THE ROSTERED END IS OVERTIME, WHATEVER THE TOTAL. Judged by duration
    alone, somebody who arrived 2h late and stayed 44 minutes past the end read
    "short" (513 of 600) and was never asked about the extra time — the time
    the approval exists for. The END decides; the total decides only when
    nobody is past it.
  */
  const now = shift.now ?? (shift.clockOutAt ? new Date(shift.clockOutAt) : new Date());
  const pastEnd = shift.shiftEndAt ? Math.floor((now.getTime() - shift.shiftEndAt.getTime()) / 60_000) : 0;
  const overBy = pastEnd > TOLERANCE ? pastEnd : target && counted > target + TOLERANCE ? counted - target : 0;
  const shortBy = overBy === 0 && target && counted < target - TOLERANCE ? target - counted : 0;
  const face: ClockOutFace = overBy > 0 ? 'late' : shortBy > 0 ? 'early' : 'onTime';

  const metres = shift.awayMetres ?? null;
  const away = metres !== null && metres >= AWAY_METRES ? { metres } : null;

  /*
    The day, to scale. Worked, the rest as a notch, anything past the roster
    hatched, and the shortfall as empty track — so the SHAPE of the shift is
    read before any figure is.
  */
  const worked = Math.max(1, counted - overBy);
  return {
    face,
    shortBy,
    overBy,
    away,
    bar: { worked, rest, over: overBy, short: shortBy },
  };
}
