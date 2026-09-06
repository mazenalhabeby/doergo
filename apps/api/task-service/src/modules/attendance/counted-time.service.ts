import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { computeCountedTime, SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN } from '@hbcfield/shared';

/** The row shape the calculation needs — nothing more, so any caller can supply it. */
export interface CountableEntry {
  clockInAt: Date;
  expectedClockInAt?: Date | null;
  expectedClockOutAt?: Date | null;
  /** Every break, paid or not — what the screen shows. */
  breakMinutes?: number | null;
  /** The ones that do not count as work — what payroll subtracts. */
  unpaidBreakMinutes?: number | null;
  shiftId?: string | null;
}

export interface CountedColumns {
  countedStartAt: Date;
  countedEndAt: Date | null;
  paidMinutes: number | null;
}

/**
 * What a session is worth, for every path that can change it.
 *
 * Four separate places close or alter a time entry — the normal clock-out, a
 * self-reported forgotten one, an administrator adding or editing an entry by
 * hand, and a break being added or removed afterwards. All four move the paid
 * figure, and three of them are in different services.
 *
 * The arithmetic itself is not here: it lives in `computeCountedTime` in
 * packages/shared, pure and tested on its own. This is the thin seam that reads
 * the row, supplies the tolerance, and writes the answer back — so that "the
 * hours on this entry" has one implementation rather than four opinions.
 */
@Injectable()
export class CountedTimeService {
  private readonly logger = new Logger(CountedTimeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The per-shift tolerance, or the default when no shift is bound. */
  async toleranceFor(shiftId?: string | null): Promise<number> {
    if (!shiftId) return SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN;
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      select: { flagToleranceMin: true },
    });
    return shift?.flagToleranceMin ?? SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN;
  }

  /**
   * The three counted columns for an entry being closed.
   *
   * Pass `knownToleranceMin` when the caller already looked it up — the
   * clock-out path needs it for the flags anyway, and asking the database twice
   * for the same integer on the hottest write in the product is a waste.
   */
  async columnsFor(
    entry: CountableEntry,
    clockOutAt: Date,
    knownToleranceMin?: number,
  ): Promise<CountedColumns> {
    const toleranceMin = knownToleranceMin ?? (await this.toleranceFor(entry.shiftId ?? null));
    const { countedStartAt, countedEndAt, paidMinutes } = computeCountedTime({
      clockInAt: entry.clockInAt,
      clockOutAt,
      expectedStartAt: entry.expectedClockInAt ?? null,
      expectedEndAt: entry.expectedClockOutAt ?? null,
      toleranceMin,
      /*
        Only the unpaid minutes come off.

        The fallback to the gross total is what every entry closed before paid
        rests existed means: back then every break was unpaid, which is exactly
        what the reports assumed by subtracting `breakMinutes` wholesale. So an
        old row keeps reporting the number it always did.
      */
      unpaidBreakMinutes: entry.unpaidBreakMinutes ?? entry.breakMinutes ?? 0,
    });
    return { countedStartAt, countedEndAt, paidMinutes };
  }

  /**
   * Recompute a CLOSED entry in place, after something changed underneath it.
   *
   * A break added, removed or ended changes `breakMinutes`, which changes the
   * paid figure. Without this the two disagree the moment anybody touches a
   * break on a finished day — and the disagreement is invisible, because both
   * numbers look plausible on their own.
   *
   * ⚠️ Takes the ROW, not an id. Every caller is already holding the entry it
   * just wrote, so reading it back would add two queries to the hottest write in
   * attendance to learn what the caller could simply pass. Give it the values as
   * they now stand — including the break total just recomputed, which is not yet
   * what the database holds if you are inside the same transaction.
   *
   * Quiet on an open entry: there is no paid figure until there is a clock-out,
   * and inventing one mid-shift would put a number on screen that moves every
   * time somebody takes a rest.
   */
  async recomputeClosed(
    entry: CountableEntry & { id: string; clockOutAt?: Date | null },
    tx?: PrismaWriter,
  ): Promise<void> {
    if (!entry.clockOutAt) return;
    const counted = await this.columnsFor(entry, entry.clockOutAt);
    await (tx ?? this.prisma).timeEntry.update({ where: { id: entry.id }, data: counted });
    this.logger.debug(
      `Recounted entry ${entry.id}: paid=${counted.paidMinutes}m (breaks ${entry.breakMinutes ?? 0}m)`,
    );
  }
}

/**
 * The one method a transaction and the root client both have. Typed narrowly on
 * purpose: the alternative is threading Prisma's transaction generic through
 * four services to save this declaration.
 */
type PrismaWriter = {
  timeEntry: { update: (args: any) => Promise<any> };
};
