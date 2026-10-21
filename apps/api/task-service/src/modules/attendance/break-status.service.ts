import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { success, TimeEntryStatus } from '@hbcfield/shared';
import { scopeWhere, type AttendanceScope } from '@hbcfield/shared';
import { CountedTimeService } from './counted-time.service';
import {
  parseBreakPlan,
  outstandingBreaks,
  nextBreakRemindAt as nextRestAt,
  snooze as snoozePlan,
  isRemindable,
  flagsWithMissedRest,
  breakTotals,
} from '@hbcfield/shared';
import { assertNotSelfDecision } from './self-decision';

/**
 * A rest in progress: "later" on the prompt, where the member's rest stands, and
 * the office ending one.
 */
@Injectable()
export class BreakStatusService {
  private readonly logger = new Logger(BreakStatusService.name);

  constructor(
    private readonly prisma: PrismaService,
    // A break changes breakMinutes, and paid time is computed from it.
    private readonly countedTime: CountedTimeService,
  ) {}

  /**
   * Get current break status
   */
  /**
   * "Later."
   *
   * Moves the rest out by its own interval and counts the answer. The COUNT is
   * what matters and it is kept here, not on the phone: otherwise "Later" is a
   * mute button, and a device that is off, flat or in a basement silences an
   * alarm by not existing.
   *
   * Past the cap the rest is recorded as MISSED and the asking stops — a phone
   * in a locker collecting forty notifications is how people learn to turn a
   * notification channel off entirely.
   */
  async snoozeBreak(data: { userId: string; organizationId: string; ruleId?: string }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      select: { id: true, breakPlan: true, locationId: true, shiftId: true, flagReasons: true },
    });
    if (!entry) throw new BadRequestException('You must be clocked in');

    const plan = parseBreakPlan(entry.breakPlan);
    // Unnamed, "Later" answers the rest being asked about — never a silent one.
    const target = data.ruleId
      ? plan.find((i) => i.ruleId === data.ruleId)
      : outstandingBreaks(plan).find(isRemindable);
    if (!target) return { success: true, data: { snoozed: false }, message: 'Nothing to postpone' };

    /*
      The cadence comes from the PLAN, not the rule.

      It was frozen there at clock-in with everything else, so this needs no
      lookup — and, more importantly, a rule edited at noon cannot change how
      insistent somebody's afternoon is. The floor and the cap are still the
      shared rule's, which is what stops a misconfiguration becoming a storm.
    */
    const updated = snoozePlan(plan, target.ruleId, {
      snoozeMin: target.snoozeMin,
      maxSnoozes: target.maxSnoozes,
    });
    const item = updated.find((i) => i.ruleId === target.ruleId)!;

    /*
      Past the cap a REQUIRED rest is missed, and that is flagged for a person in
      the same statement — never deducted (break-plan.ts). `flagsWithMissedRest`
      only adds, so an ordinary "Later" leaves the flags exactly as they were.
    */
    const flags = flagsWithMissedRest(entry.flagReasons, updated);
    const flagged = flags.length !== (entry.flagReasons ?? []).length;
    await this.prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        breakPlan: updated as never,
        nextBreakRemindAt: nextRestAt(updated, new Date()),
        ...(flagged ? { flagReasons: flags } : {}),
      },
    });

    this.logger.log(
      `Rest postponed: entry=${entry.id} rest=${target.name} count=${item.snoozeCount} state=${item.state}`,
    );
    return {
      success: true,
      data: { snoozed: item.state === 'SNOOZED', state: item.state, dueAt: item.dueAt, snoozeCount: item.snoozeCount },
      message: item.state === 'MISSED' ? 'Recorded as not taken' : 'We will ask again shortly',
    };
  }

  async getBreakStatus(data: { userId: string; organizationId: string }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        userId: data.userId,
        organizationId: data.organizationId,
        status: TimeEntryStatus.CLOCKED_IN,
      },
      include: {
        breaks: {
          orderBy: { startedAt: 'desc' },
        },
      },
    });

    if (!entry) {
      return success({
        isClockedIn: false,
        isOnBreak: false,
        currentBreak: null,
        todayBreaks: [],
        totalBreakMinutes: 0,
      });
    }

    const activeBreak = entry.breaks.find((b) => !b.endedAt);
    const completedBreaks = entry.breaks.filter((b) => b.endedAt);
    const totalBreakMinutes = completedBreaks.reduce((sum, b) => sum + (b.durationMinutes || 0), 0);

    return success({
      isClockedIn: true,
      isOnBreak: !!activeBreak,
      currentBreak: activeBreak || null,
      todayBreaks: entry.breaks,
      totalBreakMinutes,
    });
  }

  /**
   * End a break manually (admin action)
   */
  async endBreakManually(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: AttendanceScope;
    breakId: string;
    adminId: string;
    organizationId: string;
    notes?: string;
  }) {
    const breakRecord = await this.prisma.break.findFirst({
      where: {
        id: data.breakId,
        endedAt: null, // Must be active
        timeEntry: {
          organizationId: data.organizationId,
          // Only the caller's granted spaces — see attendance-scope.ts.
          ...scopeWhere(data.scopeSpaceIds),
        },
      },
      include: {
        timeEntry: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            // Every rest on the shift: the totals are recomputed from these rows.
            breaks: true,
          },
        },
      },
    });

    if (!breakRecord) {
      throw new NotFoundException('Active break not found');
    }

    // ⚠️ Ending your OWN rest from the office side sets your own rest length —
    // and so your own counted time. Somebody else does it (self-decision.ts).
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: data.adminId,
      subjectId: breakRecord.timeEntry.userId,
      organizationId: data.organizationId,
      message: 'You cannot change the rests on your own time entry. Ask a manager or an administrator.',
    });

    const endedAt = new Date();
    const durationMinutes = Math.floor((endedAt.getTime() - new Date(breakRecord.startedAt).getTime()) / 60000);

    /*
      The same consequences as the member ending it, in one transaction: both
      totals recomputed from the rows (⚠️ this used to write `breakMinutes` only,
      leaving `unpaidBreakMinutes` — what the counted time reads — at the old
      figure), the counted time moved on a closed shift, and the rest alarm
      pointed at whatever is next.
    */
    const { timeEntry } = breakRecord;
    const rows = timeEntry.breaks.map((b) => (b.id === breakRecord.id ? { ...b, endedAt, durationMinutes } : b));
    const totals = breakTotals(rows);
    const plan = parseBreakPlan(timeEntry.breakPlan);
    const updatedBreak = await this.prisma.$transaction(async (tx) => {
      const ended = await tx.break.update({
        where: { id: data.breakId },
        data: {
          endedAt,
          durationMinutes,
          notes: data.notes ? `[Admin ended] ${data.notes}` : `[Admin ended by ${data.adminId}]`,
        },
      });
      await tx.timeEntry.update({
        where: { id: breakRecord.timeEntryId },
        data: {
          ...totals,
          ...(timeEntry.status === TimeEntryStatus.CLOCKED_IN
            ? { nextBreakRemindAt: plan.length ? nextRestAt(plan, endedAt) : null }
            : {}),
        },
      });
      await this.countedTime.recomputeClosed({ ...timeEntry, ...totals }, tx);
      return ended;
    });

    this.logger.log(
      `Admin ${data.adminId} ended break ${data.breakId} ` +
        `for user ${breakRecord.timeEntry.user.firstName} ${breakRecord.timeEntry.user.lastName}`,
    );

    return success(updatedBreak, `Break ended by admin (${durationMinutes} minutes)`);
  }
}
