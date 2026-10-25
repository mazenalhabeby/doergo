import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '@hbcfield/shared';
import type { ShiftCloser } from '../clock-out/shift-closer.service';
import type { ClosableEntry } from '../clock-out/clock-out-helpers';

/** What the close itself works out — never taken from the edit (it would race or contradict the close). */
const CLOSE_OWNED = [
  'status',
  'clockOutAt',
  'reminderState',
  'nextRemindAt',
  'nextBreakRemindAt',
  'breakMinutes',
  'unpaidBreakMinutes',
  'countedStartAt',
  'countedEndAt',
  'paidMinutes',
] as const;

/**
 * The office closing a shift that is still running, by typing its clock-out (clock review B9).
 *
 * It wrote the row directly: no claim (a member's own clock-out arriving at the same moment could both win), no
 * automatic rest, open excursions left escalating, no clock-out event. Now it is THE close every other way a shift
 * ends goes through (`ShiftCloser.closeEntry`), carrying the office's own fields (who edited, why, the corrected
 * clock-in, labels, the approval). A shift the member closed meanwhile is a conflict — the office sees the real time.
 */
export async function closeByOffice<T extends Prisma.TimeEntryInclude>(
  closer: ShiftCloser,
  prisma: PrismaService,
  entry: ClosableEntry & { clockInAt: Date },
  edit: Prisma.TimeEntryUncheckedUpdateInput,
  opts: { at: Date; toleranceMin?: number; include: T },
) {
  const fields = { ...edit } as Record<string, unknown>;
  for (const key of CLOSE_OWNED) delete fields[key];
  const closed = await closer.closeEntry(entry, {
    at: opts.at,
    from: 'OPEN',
    toleranceMin: opts.toleranceMin,
    labels: { closedHow: 'OFFICE' },
    fields: fields as Prisma.TimeEntryUpdateManyMutationInput,
    pause: { reason: 'OFFICE_CLOSE', sinceClockIn: false },
    announce: true,
    readBack: false,
  });
  if (!closed) {
    throw new ConflictException({
      code: 'ENTRY_ALREADY_CLOSED',
      message: 'This shift was clocked out meanwhile — open it again to see the real time.',
    });
  }
  return prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id }, include: opts.include });
}
