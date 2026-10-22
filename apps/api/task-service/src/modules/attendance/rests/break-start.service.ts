import { Injectable, Inject, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService, personNameOf } from '@hbcfield/shared';
import { personName, success, TimeEntryStatus, SERVICE_NAMES } from '@hbcfield/shared';
import type { OccurrenceEvidence } from '@hbcfield/shared';
import { judgeOccurrence } from '../../../common/occurrence.util';
import {
  parseBreakPlan,
  markTaken,
  nextBreakRemindAt as nextRestAt,
  plannedRestForTap,
  isRemindable,
} from '@hbcfield/shared';
import { emitEvent, breakStartedEvent } from '@hbcfield/shared/microservices';
import type { BreakType } from '@prisma/client';

/** Starting a rest. A collaborator of BreakService, which answers `startBreak` through it. */
@Injectable()
export class BreakStartService {
  // Named after BreakService, whose log lines these always were.
  private readonly logger = new Logger('BreakService');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * Start a break during current shift
   */
  async startBreak(data: {
    userId: string;
    organizationId: string;
    type?: string;
    notes?: string;
    /**
     * The planned rest this satisfies, when the member answered a prompt.
     *
     * Optional on purpose: taking an unplanned break stays allowed. A plan says
     * when a rest is EXPECTED, never that no other rest may happen.
     */
    ruleId?: string;
    /** The break's id, made on the phone — a resend returns the same break. */
    id?: string;
    /** The shift it belongs to, named by a phone that clocked in offline. */
    entryId?: string;
    /** When the tap happened, for a break recorded offline. */
    evidence?: OccurrenceEvidence;
    /** Why the system started it (a label code, e.g. AUTO_REST) — never sent by a client. */
    reason?: string;
  }) {
    this.logger.log(`Start break: user=${data.userId}, type=${data.type || 'SHORT'}`);

    if (data.id) {
      const prior = await this.prisma.break.findUnique({
        where: { id: data.id },
        include: { timeEntry: { select: { userId: true } } },
      });
      if (prior) {
        if (prior.timeEntry.userId !== data.userId)
          throw new ConflictException({ message: 'This id is already in use', code: 'ID_IN_USE' });
        const { timeEntry: _owner, ...breakRecord } = prior;
        return success(breakRecord, 'Break started');
      }
    }

    // Find active clock-in entry
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        ...(data.entryId ? { id: data.entryId } : {}),
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: {
        breaks: {
          where: { endedAt: null },
        },
      },
    });

    if (!entry) {
      throw new BadRequestException('You must be clocked in to take a break');
    }

    // Check if already on break
    if (entry.breaks && entry.breaks.length > 0) {
      throw new BadRequestException('You are already on a break. End your current break first.');
    }

    // The tap's own time; not before the shift began, nor before the last rest ended.
    const lastRest = data.evidence
      ? await this.prisma.break.findFirst({
          where: { timeEntryId: entry.id, endedAt: { not: null } },
          orderBy: { endedAt: 'desc' },
          select: { endedAt: true },
        })
      : null;
    const occurrence = judgeOccurrence(data.evidence, lastRest?.endedAt ?? entry.clockInAt);

    /*
      Which planned rest is this, and does it come off the paid time?

      `isPaid` is COPIED from the plan rather than read back from the rule later:
      editing a rule next month must not silently re-price a shift that has
      already been worked and paid.
    */
    const startedAt = occurrence.at;
    const plan = parseBreakPlan(entry.breakPlan);
    /*
      ⚠️ Named, or inside its window — never simply "the next one".

      With no rule named this used to satisfy whichever planned rest came next,
      so a 09:00 coffee was filed as lunch: lunch went TAKEN, the midday prompt
      never came, and the coffee inherited lunch's counts-as-work setting. A tap
      now satisfies a planned rest only when it names it or falls inside its due
      window (`plannedRestForTap`, shared with the phone); anything else is an
      unplanned break — allowed, recorded, never counted as work.
    */
    const planned = plannedRestForTap(plan, { ruleId: data.ruleId, at: startedAt });

    // Create break record
    const breakRecord = await this.prisma.break.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        timeEntryId: entry.id,
        type: (data.type as BreakType) || 'SHORT',
        startedAt,
        notes: data.notes,
        ...(data.reason ? { reason: data.reason } : {}),
        ruleId: planned?.ruleId ?? null,
        isPaid: planned?.isPaid ?? false,
      },
    });

    if (planned) {
      /*
        The plan and its indexed deadline move together, in one statement.

        The next wake-up is when THIS rest is over, so the member gets the "back
        to work" nudge rather than being asked again about a rest they are
        currently taking.
      */
      const updated = markTaken(plan, planned.ruleId, breakRecord.id, startedAt);
      await this.prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          breakPlan: updated as never,
          // A rule that asked not to be reminded gets no "back to work" nudge
          // either; the sweep looks at whatever else is due instead.
          nextBreakRemindAt: isRemindable(planned)
            ? new Date(startedAt.getTime() + planned.durationMinutes * 60_000)
            : nextRestAt(updated, startedAt),
        },
      });
    }

    // Get user info for notification
    const user = await personNameOf(this.prisma, data.userId);

    // Emit break started notification
    emitEvent(this.notificationClient, breakStartedEvent, {
      userId: data.userId,
      userName: user ? personName(user) : 'Unknown',
      breakId: breakRecord.id,
      breakType: breakRecord.type,
      startedAt: breakRecord.startedAt.toISOString(),
      organizationId: data.organizationId,
    });

    this.logger.log(`Break started: break=${breakRecord.id}, entry=${entry.id}`);

    return success(breakRecord, 'Break started');
  }
}
