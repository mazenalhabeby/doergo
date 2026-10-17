import { BadRequestException } from '@nestjs/common';
import { computeCountedTime, toISODateString } from '@hbcfield/shared';
import type { ManualEntriesMessage } from '@hbcfield/shared/microservices';

/** The steps of `ManualEntriesService.addManualEntries` that need no database, in the order it runs them. */

/** The request as sent — the message contract's type. */
export type ManualEntriesInput = ManualEntriesMessage;

/** The dates and times are the shapes the dialog sends, and the range runs forwards. */
export function assertManualRangeShape(data: ManualEntriesInput): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(data.endDate)) {
    throw new BadRequestException('Invalid date range');
  }
  if (!/^\d{2}:\d{2}$/.test(data.startTime) || !/^\d{2}:\d{2}$/.test(data.endTime)) {
    throw new BadRequestException('Invalid time');
  }
  if (data.endDate < data.startDate) throw new BadRequestException('End date is before the start date');
}

const mins = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
};

/** Where the rest sits, as an offset from the clock-in, and how long it is. */
export function manualBreakPlacement(data: ManualEntriesInput): { breakOffsetMin: number; breakMin: number } {
  /*
    A rest cannot be longer than the shift it sits in.

    The shift is the same length every day of a back-fill, so this is answered
    once, here, rather than per entry — and it has to be answered at all: the
    break is placed inside the shift, and a rest that does not fit would run
    past the clock-out. The edit dialog refuses exactly this when a human types
    it; entering it as a number must not be the way around that.

    Equal is refused too. A shift that is entirely rest is not a shift.
  */
  const shiftStart = mins(data.startTime);
  let shiftEnd = mins(data.endTime);
  if (shiftEnd <= shiftStart) shiftEnd += 24 * 60; // overnight, as below

  /*
    Where the break sits, as an offset from the clock-in.

    Given times, that is what they say — and measuring from the clock-in is
    what lets a range of days each get the break at the same time of day, which
    is what a wall-clock time means. Given only a number of minutes — an older
    client — it is centred, which is what this service did before there was
    anywhere to say when the break was taken.
  */
  if (data.breakStart && data.breakEnd) {
    if (!/^\d{2}:\d{2}$/.test(data.breakStart) || !/^\d{2}:\d{2}$/.test(data.breakEnd)) {
      throw new BadRequestException('Invalid break time');
    }
    let bs = mins(data.breakStart);
    if (bs < shiftStart) bs += 24 * 60; // inside an overnight shift
    let be = mins(data.breakEnd);
    if (be <= bs) be += 24 * 60;
    if (bs < shiftStart || be > shiftEnd) {
      throw new BadRequestException('The break must sit inside the shift.');
    }
    return { breakOffsetMin: bs - shiftStart, breakMin: be - bs };
  }
  const breakMin = Math.max(0, Math.round(data.breakMinutes ?? 0));
  if (breakMin >= shiftEnd - shiftStart) {
    throw new BadRequestException(`A ${breakMin}-minute rest does not fit in a ${shiftEnd - shiftStart}-minute shift.`);
  }
  return { breakOffsetMin: Math.max(0, (shiftEnd - shiftStart - breakMin) / 2), breakMin };
}

/** The days to fill: weekday-filtered for a range; the single day is always included. */
export function manualTargetDates(data: ManualEntriesInput): string[] {
  const single = data.startDate === data.endDate;
  const weekdays = single ? null : data.weekdays?.length ? data.weekdays : [1, 2, 3, 4, 5];

  // Cap the span so an accidental multi-year range can't mass-insert. One
  // backfill covers at most a year (weekday filtering trims it further).
  const cur = new Date(`${data.startDate}T12:00:00Z`);
  const endD = new Date(`${data.endDate}T12:00:00Z`);
  const spanDays = Math.round((endD.getTime() - cur.getTime()) / 86_400_000) + 1;
  if (spanDays > 366) {
    throw new BadRequestException('Date range too large — back-fill at most one year at a time');
  }

  const dates: string[] = [];
  while (cur <= endD) {
    if (single || (weekdays && weekdays.includes(cur.getUTCDay()))) {
      dates.push(toISODateString(cur));
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  if (!dates.length) throw new BadRequestException('No matching days in the selected range');
  return dates;
}

/** One day's entry, approved and geofence-exempt. Refuses a shift that has not ended yet. */
export function manualEntryRow(
  data: ManualEntriesInput,
  ctx: {
    ymd: string;
    clockIn: Date;
    clockOut: Date;
    now: Date;
    tz: string;
    loc: { lat: number | null; lng: number | null };
    breakMin: number;
    reason: string;
  },
) {
  const { ymd, clockIn, loc, breakMin, now } = ctx;
  let clockOut = ctx.clockOut;
  if (clockOut <= clockIn) clockOut = new Date(clockOut.getTime() + 24 * 3600_000); // overnight
  /*
    Never a shift that has not happened yet.

    A clock-in is judged against the end of the member's last shift, and a
    tap earlier than that is refused as out of order. A hand-entered shift
    ending next Monday therefore refused every real clock-in until Monday
    evening: the phone showed the member clocked in, the server had nothing,
    and they could neither clock out nor clock in again. Refused here, before
    anything is written, naming the day.
  */
  if (clockOut.getTime() > now.getTime()) {
    throw new BadRequestException({
      code: 'MANUAL_ENTRY_IN_FUTURE',
      message: `A shift can only be added once it has ended — ${ymd} ${data.endTime} is still to come.`,
    });
  }
  /*
    GROSS minutes. The break is stored beside it, never inside it.

    This subtracted `breakMin` here, which made a manually added entry mean
    something different from a clocked one: the clock-out path stores raw
    wall time and `workedMinutes()` nets the break at the point of display.
    Subtracting twice took an hour off every back-filled shift — a 18:00 to
    06:00 night with an hour's break read as ten hours instead of eleven —
    and left nothing to show as a break, because it had been folded away.
  */
  const totalMinutes = Math.max(0, Math.round((clockOut.getTime() - clockIn.getTime()) / 60000));
  /*
    Counted time on a hand-entered shift.

    No shift was resolved for it — nobody clocked in, so nothing stamped an
    expectation — which means there is nothing to clamp to and the counted
    window IS the entered window, net of the break. Written here rather than
    left null so a back-dated day carries the same three columns as a real
    one and the timesheet does not have to ask which kind it is looking at.
  */
  const counted = computeCountedTime({ clockInAt: clockIn, clockOutAt: clockOut, unpaidBreakMinutes: breakMin });

  return {
    userId: data.userId,
    organizationId: data.organizationId,
    locationId: data.locationId,
    status: 'CLOCKED_OUT',
    timezone: ctx.tz,
    clockInAt: clockIn,
    clockInLat: loc.lat ?? 0,
    clockInLng: loc.lng ?? 0,
    clockInWithinGeofence: true,
    clockOutAt: clockOut,
    clockOutLat: loc.lat ?? 0,
    clockOutLng: loc.lng ?? 0,
    clockOutWithinGeofence: true,
    isRemote: false,
    totalMinutes,
    breakMinutes: breakMin,
    // The break row below is unpaid (isPaid defaults to false), so the
    // unpaid total is the same minutes. Left at its default 0, the entry
    // claimed a break that reduced nothing: any later recount (an edit,
    // an approval) and the report's hours-in-shift read the shift an hour
    // long — 12h for a 06:00–18:00 day with an hour's lunch.
    unpaidBreakMinutes: breakMin,
    countedStartAt: counted.countedStartAt,
    countedEndAt: counted.countedEndAt,
    paidMinutes: counted.paidMinutes,
    notes: data.notes?.trim() || null,
    flagReasons: [],
    approvalStatus: 'APPROVED',
    approvedById: data.editorId,
    approvedAt: now,
    approvalNotes: 'Added by admin',
    isEdited: true,
    editedById: data.editorId,
    editedAt: now,
    editReason: ctx.reason,
  };
}

export type ManualEntryRow = ReturnType<typeof manualEntryRow>;
