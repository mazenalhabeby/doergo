import { ConflictException } from '@nestjs/common';
import { ATTENDANCE_FLAG_REASONS, OPEN_SHIFT_CLOSE } from '@hbcfield/shared';
import type { PrismaService } from '@hbcfield/shared';

/**
 * The member's own clock-out replacing a temporary close (the open-shift sweep's guess).
 *
 * Their tap wins — usually it is the phone that had no signal, sending the real time now. But it is
 * still a claim about a moment, and two claims are impossible or need a person:
 *
 *  - LATER THAN THEIR NEXT SHIFT BEGAN. They clocked in again since; a clock-out after that clock-in
 *    would make the two shifts overlap and count the same hours twice. Refused.
 *  - FAR PAST THE GUESS (> 12 h). "I left at 08:00 the next morning" on a shift closed at 18:00 may be
 *    true, but it moves fourteen hours without anybody looking. It counts — and waits for a leader.
 */
export function judgeProvisionalReplacement(input: {
  provisionalAt: Date | null;
  at: Date;
  nextClockInAt: Date | null;
}): string[] {
  if (input.nextClockInAt && input.at.getTime() > input.nextClockInAt.getTime()) {
    throw new ConflictException({
      message: 'This clock-out is later than your next shift began',
      code: 'CLOCK_OUT_AFTER_NEXT_SHIFT',
      params: { nextClockInAt: input.nextClockInAt.toISOString() },
    });
  }
  const movedMs = input.provisionalAt ? input.at.getTime() - input.provisionalAt.getTime() : 0;
  return movedMs > OPEN_SHIFT_CLOSE.REPLACED_REVIEW_AFTER_HOURS * 3_600_000
    ? [ATTENDANCE_FLAG_REASONS.CLOCK_OUT_LONG_AFTER_CLOSE]
    : [];
}

/** The member's first clock-in after this shift's — the moment a replacing clock-out may not pass. */
export async function nextClockInAfter(
  prisma: Pick<PrismaService, 'timeEntry'>,
  entry: { id: string; userId: string; clockInAt: Date },
): Promise<Date | null> {
  const next = await prisma.timeEntry.findFirst({
    // A rejected entry is not a shift that happened.
    where: {
      userId: entry.userId,
      id: { not: entry.id },
      clockInAt: { gt: entry.clockInAt },
      approvalStatus: { not: 'REJECTED' },
    },
    orderBy: { clockInAt: 'asc' },
    select: { clockInAt: true },
  });
  return next?.clockInAt ?? null;
}
