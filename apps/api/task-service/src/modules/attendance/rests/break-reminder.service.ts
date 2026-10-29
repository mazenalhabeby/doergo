import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@hbcfield/shared';
import {
  personName,
  SERVICE_NAMES,
  parseBreakPlan,
  nextBreakRemindAt,
  breakNeedingAttention,
  isRemindable,
  isExpired,
  markMissed,
  snooze,
  flagsWithMissedRest,
  type BreakPlanItem,
} from '@hbcfield/shared';
import {
  emitEvent,
  attendanceBreakDueEvent,
  attendanceBreakOverEvent,
  type EventContract,
  type EventPayload,
} from '@hbcfield/shared/microservices';

/** Filled in by `emit` from the entry itself. */
type BreakEntryFields = 'entryId' | 'userId' | 'userName' | 'locationId' | 'locationName' | 'organizationId';

/** What a claim is conditional on: the row as the sweep read it. */
type ClaimedEntry = { id: string; nextBreakRemindAt: Date | null };

/** How many entries one tick may touch. A backlog drains over later ticks. */
const SWEEP_LIMIT = 500;

/**
 * The rest alarm.
 *
 * Runs inside the reminder sweep that already ticks every minute — a second
 * indexed due-list, not a second job. Two things fall due here: a rest whose
 * moment has come, and a rest that has run over its own length.
 *
 * It never starts a rest, never ends one and never deducts anything. Every path
 * out of it is a person tapping something, because a system that quietly edits
 * hours is a system nobody trusts with hours.
 */
@Injectable()
export class BreakReminderService {
  private readonly logger = new Logger(BreakReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * One tick.
   *
   * The query is the whole performance story: `[status, nextBreakRemindAt]` is
   * an index, and only entries whose rest is genuinely due are read. Open shifts
   * with nothing pending carry a null deadline and are never looked at.
   */
  async sweep(now: Date = new Date()) {
    const due = await this.prisma.timeEntry.findMany({
      where: {
        status: 'CLOCKED_IN',
        nextBreakRemindAt: { not: null, lte: now },
      },
      select: {
        id: true,
        userId: true,
        // The value read is the claim: every write below is conditional on it.
        nextBreakRemindAt: true,
        organizationId: true,
        locationId: true,
        breakPlan: true,
        // A required rest recorded missed is flagged in the same write.
        flagReasons: true,
        timezone: true,
        location: { select: { id: true, name: true, timezone: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
        // An open break means they are ON a rest — the nudge to end it, not to
        // start another.
        breaks: { where: { endedAt: null }, select: { id: true, startedAt: true, ruleId: true } },
      },
      orderBy: { nextBreakRemindAt: 'asc' },
      take: SWEEP_LIMIT,
    });

    if (due.length === 0) return { asked: 0, ended: 0, missed: 0 };

    let asked = 0;
    let ended = 0;
    let missed = 0;

    for (const entry of due) {
      const plan = parseBreakPlan(entry.breakPlan);
      if (plan.length === 0) {
        // Nothing to remind about: clear the deadline so this row stops being
        // selected every minute forever.
        await this.clear(entry);
        continue;
      }

      const openBreak = entry.breaks[0];
      if (openBreak) {
        // ── They are resting. Is it over?
        // Only a rest whose rule asks to be reminded gets "your rest is over".
        const item = plan.find((i) => i.ruleId === openBreak.ruleId && i.state === 'TAKEN' && isRemindable(i));
        const overAt = item ? new Date(openBreak.startedAt.getTime() + item.durationMinutes * 60_000) : null;
        if (overAt && overAt.getTime() <= now.getTime()) {
          // Asked once. The next deadline is whatever comes after this rest —
          // nagging somebody to come back is not this system's job.
          if (!(await this.rearm(entry, plan, now))) continue;
          this.emit(attendanceBreakOverEvent, entry, {
            breakId: openBreak.id,
            name: item!.name,
            durationMinutes: item!.durationMinutes,
          });
          ended += 1;
        } else {
          await this.setDeadline(entry, overAt ?? this.in(now, 5));
        }
        continue;
      }

      /*
        ── Nothing open: the rest that needs attention now — due to be asked, or
        its window closed. ⚠️ Through `breakNeedingAttention`, never "the next
        outstanding one": a rule with reminders switched off is never asked
        about; it surfaces only when its window closes, to be recorded missed.
      */
      const nextUp = breakNeedingAttention(plan, now);
      if (!nextUp) {
        // Woken early or for nothing: point the index at the real next moment.
        await this.rearm(entry, plan, now);
        continue;
      }

      if (isExpired(nextUp, now)) {
        const updated = markMissed(plan, nextUp.ruleId);
        if (!(await this.write(entry, updated, nextBreakRemindAt(updated, now)))) continue;
        missed += 1;
        this.logger.log(`Rest window closed unmet: entry=${entry.id} rest=${nextUp.name}`);
        continue;
      }

      /*
        An ask that goes unanswered COUNTS.

        This used to re-arm five minutes later and leave `snoozeCount` alone,
        while the comment beside it claimed the cap would eventually stop the
        asking. It would not: the count moved only when somebody actively tapped
        "Later", so a member who simply ignored the prompt was asked again every
        five minutes for the rest of the shift — about a hundred and forty times
        on a twelve-hour day. Precisely the notification storm the cap exists to
        prevent, produced by the code that documented itself as preventing it.

        Ignoring a prompt and postponing it are the same fact about the day: it
        was offered and not taken. So they share one counter and one transition,
        and past the cap the rest is recorded MISSED and the asking stops.
      */
      const after = snooze(plan, nextUp.ruleId, {
        snoozeMin: nextUp.snoozeMin,
        maxSnoozes: nextUp.maxSnoozes,
        now,
      });
      // Claimed first: a rest started, "Later" tapped or a clock-out meanwhile wins, and nothing is sent.
      if (!(await this.write(entry, after, nextBreakRemindAt(after, now)))) continue;
      this.emit(attendanceBreakDueEvent, entry, {
        ruleId: nextUp.ruleId,
        name: nextUp.name,
        durationMinutes: nextUp.durationMinutes,
        isPaid: nextUp.isPaid,
        expiresAt: nextUp.expiresAt,
        snoozeCount: nextUp.snoozeCount,
      });
      asked += 1;
      const item = after.find((i) => i.ruleId === nextUp.ruleId);
      if (item?.state === 'MISSED') {
        missed += 1;
        this.logger.log(`Rest unanswered and recorded missed: entry=${entry.id} rest=${nextUp.name}`);
      }
    }

    if (asked || ended || missed) {
      this.logger.log(`Rest sweep: asked=${asked} ended=${ended} missed=${missed}`);
    }
    return { asked, ended, missed };
  }

  // ── writes ──────────────────────────────────────────────────────────────

  /**
   * Every write is a CLAIM on the row as read: still clocked in, deadline
   * unchanged. Two ticks overlap (the sweep queue runs 20 at once), and a rest
   * started, "Later" tapped or a clock-out committed between the read and the
   * write must never be overwritten — the plan or the flags it wrote (an
   * AUTO_CLOCK_OUT flag included) would be lost. Resolves true when it won.
   */
  private async claim(entry: ClaimedEntry, data: Record<string, unknown>): Promise<boolean> {
    const res = await this.prisma.timeEntry.updateMany({
      where: { id: entry.id, status: 'CLOCKED_IN', nextBreakRemindAt: entry.nextBreakRemindAt },
      data,
    });
    return res.count === 1;
  }

  private write(entry: ClaimedEntry & { flagReasons?: string[] | null }, plan: BreakPlanItem[], deadline: Date | null) {
    /*
      The plan and the indexed deadline move in ONE statement. Two writes could
      leave a row whose JSON says a rest is pending and whose index says nothing
      is due — invisible, and permanent.

      And the review flag with them: a REQUIRED rest that has just become MISSED
      ("Later" ran out, or its window closed) puts the entry in front of a person
      (`flagsWithMissedRest`) — and deducts nothing. Unchanged flags are not
      rewritten.
    */
    const priorFlags = entry.flagReasons;
    const flags = flagsWithMissedRest(priorFlags, plan);
    const flagged = flags.length !== (priorFlags ?? []).length;
    return this.claim(entry, {
      breakPlan: plan as never,
      nextBreakRemindAt: deadline,
      ...(flagged ? { flagReasons: flags } : {}),
    });
  }

  private setDeadline(entry: ClaimedEntry, at: Date | null) {
    return this.claim(entry, { nextBreakRemindAt: at });
  }

  private clear(entry: ClaimedEntry) {
    return this.setDeadline(entry, null);
  }

  private rearm(entry: ClaimedEntry, plan: BreakPlanItem[], now: Date) {
    return this.setDeadline(entry, nextBreakRemindAt(plan, now));
  }

  private in(now: Date, minutes: number): Date {
    return new Date(now.getTime() + minutes * 60_000);
  }

  /** The entry's facts are added here; the caller gives only what is particular to the rest. */
  private emit<C extends typeof attendanceBreakDueEvent | typeof attendanceBreakOverEvent>(
    event: C,
    entry: {
      id: string;
      userId: string;
      organizationId: string;
      locationId: string;
      location?: { name?: string | null } | null;
      user?: { firstName: string; lastName: string } | null;
    },
    payload: Omit<EventPayload<C>, BreakEntryFields>,
  ) {
    // The spread of a generic payload cannot be proved complete by the compiler; the
    // Omit above is what checks each caller.
    emitEvent(
      this.notificationClient,
      event as EventContract<EventPayload<C>>,
      {
        entryId: entry.id,
        userId: entry.userId,
        userName: entry.user ? personName(entry.user) : '',
        locationId: entry.locationId,
        locationName: entry.location?.name ?? 'your shift',
        organizationId: entry.organizationId,
        ...payload,
      } as EventPayload<C>,
    );
  }
}
