import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  SERVICE_NAMES,
  parseBreakPlan,
  nextBreakRemindAt,
  outstandingBreaks,
  isExpired,
  markMissed,
  snooze,
  type BreakPlanItem,
} from '@hbcfield/shared';

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
        organizationId: true,
        locationId: true,
        breakPlan: true,
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
        await this.clear(entry.id);
        continue;
      }

      const openBreak = entry.breaks[0];
      if (openBreak) {
        // ── They are resting. Is it over?
        const item = plan.find((i) => i.ruleId === openBreak.ruleId && i.state === 'TAKEN');
        const overAt = item
          ? new Date(openBreak.startedAt.getTime() + item.durationMinutes * 60_000)
          : null;
        if (overAt && overAt.getTime() <= now.getTime()) {
          this.emit('attendance_break_over', entry, {
            breakId: openBreak.id,
            name: item!.name,
            durationMinutes: item!.durationMinutes,
          });
          ended += 1;
          // Asked once. The next deadline is whatever comes after this rest —
          // nagging somebody to come back is not this system's job.
          await this.rearm(entry.id, plan, now);
        } else {
          await this.setDeadline(entry.id, overAt ?? this.in(now, 5));
        }
        continue;
      }

      // ── Nothing open: the next outstanding rest is due, or its window closed.
      const nextUp = outstandingBreaks(plan)[0];
      if (!nextUp) {
        await this.clear(entry.id);
        continue;
      }

      if (isExpired(nextUp, now)) {
        const updated = markMissed(plan, nextUp.ruleId);
        missed += 1;
        this.logger.log(`Rest window closed unmet: entry=${entry.id} rest=${nextUp.name}`);
        await this.write(entry.id, updated, nextBreakRemindAt(updated, now));
        continue;
      }

      this.emit('attendance_break_due', entry, {
        ruleId: nextUp.ruleId,
        name: nextUp.name,
        durationMinutes: nextUp.durationMinutes,
        isPaid: nextUp.isPaid,
        expiresAt: nextUp.expiresAt,
        snoozeCount: nextUp.snoozeCount,
      });
      asked += 1;

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
      const item = after.find((i) => i.ruleId === nextUp.ruleId);
      if (item?.state === 'MISSED') {
        missed += 1;
        this.logger.log(`Rest unanswered and recorded missed: entry=${entry.id} rest=${nextUp.name}`);
      }
      await this.write(entry.id, after, nextBreakRemindAt(after, now));
    }

    if (asked || ended || missed) {
      this.logger.log(`Rest sweep: asked=${asked} ended=${ended} missed=${missed}`);
    }
    return { asked, ended, missed };
  }

  // ── writes ──────────────────────────────────────────────────────────────

  private write(id: string, plan: BreakPlanItem[], deadline: Date | null) {
    // The plan and the indexed deadline move in ONE statement. Two writes could
    // leave a row whose JSON says a rest is pending and whose index says nothing
    // is due — invisible, and permanent.
    return this.prisma.timeEntry.update({
      where: { id },
      data: { breakPlan: plan as never, nextBreakRemindAt: deadline },
    });
  }

  private setDeadline(id: string, at: Date | null) {
    return this.prisma.timeEntry.update({ where: { id }, data: { nextBreakRemindAt: at } });
  }

  private clear(id: string) {
    return this.setDeadline(id, null);
  }

  private rearm(id: string, plan: BreakPlanItem[], now: Date) {
    return this.setDeadline(id, nextBreakRemindAt(plan, now));
  }

  private in(now: Date, minutes: number): Date {
    return new Date(now.getTime() + minutes * 60_000);
  }

  private emit(
    event: 'attendance_break_due' | 'attendance_break_over',
    entry: {
      id: string;
      userId: string;
      organizationId: string;
      locationId: string;
      location?: { name?: string | null } | null;
      user?: { firstName: string; lastName: string } | null;
    },
    payload: Record<string, unknown>,
  ) {
    this.notificationClient.emit(event, {
      entryId: entry.id,
      userId: entry.userId,
      userName: entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : '',
      locationId: entry.locationId,
      locationName: entry.location?.name ?? 'your shift',
      organizationId: entry.organizationId,
      ...payload,
    });
  }
}
