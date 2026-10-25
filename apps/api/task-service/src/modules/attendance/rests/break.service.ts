import { Injectable, BadRequestException, ConflictException, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService, personNameOf } from '@hbcfield/shared';
import { CountedTimeService } from '../core/counted-time.service';
import { personName, success, TimeEntryStatus, SERVICE_NAMES } from '@hbcfield/shared';
import type { OccurrenceEvidence } from '@hbcfield/shared';
import { judgeOccurrence } from '../../../common/occurrence.util';
import { SAME_TAP_MS } from '../core/attendance-occurrence';
import { parseBreakPlan, nextBreakRemindAt as nextRestAt, breakTotals } from '@hbcfield/shared';
import { BreakStartService } from './break-start.service';
import { restColumnsAtBreakEnd } from './label-rests';
import { emitEvent, breakEndedEvent } from '@hbcfield/shared/microservices';

@Injectable()
export class BreakService {
  private readonly logger = new Logger(BreakService.name);

  constructor(
    private readonly prisma: PrismaService,
    // A break changes breakMinutes, and paid time is computed from it.
    private readonly countedTime: CountedTimeService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    private readonly starter: BreakStartService,
  ) {}

  /** Start a break during the current shift (BreakStartService). */
  startBreak(...args: Parameters<BreakStartService['startBreak']>) {
    return this.starter.startBreak(...args);
  }

  async endBreak(data: {
    userId: string;
    organizationId: string;
    notes?: string;
    /** The break this ends, named by a phone that started it offline. */
    breakId?: string;
    /** When the tap happened, for a break ended offline. */
    evidence?: OccurrenceEvidence;
  }) {
    this.logger.log(`End break: user=${data.userId}`);

    /*
      A named break that is already over: the same tap sent twice gets the same
      answer; one ended some other way is a conflict, never overwritten.
    */
    if (data.breakId) {
      const named = await this.prisma.break.findFirst({
        where: { id: data.breakId, timeEntry: { userId: data.userId, organizationId: data.organizationId } },
      });
      if (!named) throw new BadRequestException('You are not currently on a break');
      if (named.endedAt) {
        const tapAt = data.evidence ? new Date(data.evidence.occurredAt).getTime() : NaN;
        if (Math.abs(named.endedAt.getTime() - tapAt) <= SAME_TAP_MS) return success(named, 'Break ended');
        throw new ConflictException({
          message: 'This break was already ended before your change arrived',
          code: 'BREAK_ALREADY_ENDED',
          params: { current: { id: named.id, endedAt: named.endedAt } },
        });
      }
    }

    // Find active clock-in entry with active break
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: {
        breaks: {
          where: { endedAt: null, ...(data.breakId ? { id: data.breakId } : {}) },
        },
      },
    });

    if (!entry) {
      throw new BadRequestException('You must be clocked in to end a break');
    }

    if (!entry.breaks || entry.breaks.length === 0) {
      throw new BadRequestException('You are not currently on a break');
    }

    const activeBreak = entry.breaks[0];
    const now = judgeOccurrence(data.evidence, activeBreak.startedAt).at;
    const durationMinutes = Math.round((now.getTime() - activeBreak.startedAt.getTime()) / (1000 * 60));

    // Update break record
    const updatedBreak = await this.prisma.break.update({
      where: { id: activeBreak.id },
      data: {
        endedAt: now,
        durationMinutes,
        notes: data.notes || activeBreak.notes,
      },
    });

    // Update total break minutes on time entry
    const allBreaks = await this.prisma.break.findMany({
      where: {
        timeEntryId: entry.id,
        endedAt: { not: null },
      },
    });

    /*
      Unpaid minutes, tracked apart from the total.

      A paid rest is time at work; an unpaid one is not. The counted-time rule
      reads only the unpaid figure, and the screen shows the total — so the two
      are stored separately rather than one being inferred from the other.
    */
    const { breakMinutes: totalBreakMinutes, unpaidBreakMinutes } = breakTotals(allBreaks);

    // The rest is over: point the sweep at whatever is next, or at nothing —
    // only rests whose rule asks to be reminded (`nextRestAt` reads that).
    const plan = parseBreakPlan(entry.breakPlan);
    await this.prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        breakMinutes: totalBreakMinutes,
        unpaidBreakMinutes,
        nextBreakRemindAt: plan.length ? nextRestAt(plan, now) : null,
        // Label rules (new entries): a rest longer than planned + grace is LATE_FROM_REST.
        ...restColumnsAtBreakEnd(entry, { startedAt: activeBreak.startedAt, endedAt: now }),
      },
    });

    // Harmless on an open shift (there is no paid figure yet) and necessary on a
    // closed one, which is what `endBreakManually` reaches.
    await this.countedTime.recomputeClosed({
      ...entry,
      breakMinutes: totalBreakMinutes,
      unpaidBreakMinutes,
    });

    // Get user info for notification
    const user = await personNameOf(this.prisma, data.userId);

    // Emit break ended notification
    emitEvent(this.notificationClient, breakEndedEvent, {
      userId: data.userId,
      userName: user ? personName(user) : 'Unknown',
      breakId: updatedBreak.id,
      breakType: updatedBreak.type,
      startedAt: activeBreak.startedAt.toISOString(),
      endedAt: now.toISOString(),
      durationMinutes,
      organizationId: data.organizationId,
      spaceId: entry.locationId,
    });

    this.logger.log(
      `Break ended: break=${updatedBreak.id}, duration=${durationMinutes}min, totalBreakMinutes=${totalBreakMinutes}`,
    );

    return success(updatedBreak, `Break ended (${durationMinutes} minutes)`);
  }
}
