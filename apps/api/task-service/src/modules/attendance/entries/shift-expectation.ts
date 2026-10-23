import { PrismaService, SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN } from '@hbcfield/shared';
import type { CountedTimeService } from '../core/counted-time.service';

/** Duration of a shift window in minutes from its "HH:MM" start/end strings. */
function shiftDurationMinutes(startTime: string, endTime: string, crossesMidnight: boolean): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let dur = eh * 60 + em - (sh * 60 + sm);
  if (crossesMidnight || dur <= 0) dur += 24 * 60; // overnight window
  return dur;
}

/**
 * The expected start and the tolerance an edit re-reads the flags against.
 *
 * ⚠️ The start is the PERSISTED `expectedClockInAt` — stamped at clock-in by
 * the shift resolver for a rota shift AND for the legacy weekly schedule. This
 * used to be derived from the bound shift's length, which needs a `shiftId`,
 * so every legacy-schedule entry lost its LATE_ARRIVAL on its first edit. The
 * derivation survives only for rows older than the persisted column.
 *
 * One shift read at most: the tolerance rides on the same row.
 */
export async function shiftExpectation(
  prisma: PrismaService,
  countedTime: CountedTimeService,
  entry: { shiftId: string | null; expectedClockInAt: Date | null; expectedClockOutAt: Date | null },
): Promise<{ expectedStart: Date | null; toleranceMin: number }> {
  if (entry.expectedClockInAt || !entry.shiftId || !entry.expectedClockOutAt) {
    return {
      expectedStart: entry.expectedClockInAt ?? null,
      toleranceMin: await countedTime.toleranceFor(entry.shiftId),
    };
  }
  const shift = await prisma.shift.findUnique({
    where: { id: entry.shiftId },
    select: { startLocal: true, endLocal: true, crossesMidnight: true, flagToleranceMin: true },
  });
  if (!shift) return { expectedStart: null, toleranceMin: SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN };
  const dur = shiftDurationMinutes(shift.startLocal, shift.endLocal, shift.crossesMidnight);
  return {
    expectedStart: new Date(entry.expectedClockOutAt.getTime() - dur * 60_000),
    toleranceMin: shift.flagToleranceMin ?? SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
  };
}
