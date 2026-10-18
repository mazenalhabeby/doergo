import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { MEMBER_SELECT } from './attendance-selects';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  personName,
  success,
  TimeEntryStatus,
  UNSCHEDULED_SESSION_DEFAULTS,
  clocksByPresence,
  presenceSessionEnd,
  SERVICE_NAMES,
  judgedByLabelRules,
} from '@hbcfield/shared';
import { AttendanceRoutingService } from './attendance-routing.service';
import { AutoClockService } from './auto-clock.service';
import { shiftNudgeCadence } from './shift-sweep-helpers';
import {
  emitEvent,
  attendanceShiftEscalationEvent,
  attendanceShiftReminderEvent,
} from '@hbcfield/shared/microservices';

/** The minute sweep that tells people their shift is about to start or end. */
@Injectable()
export class ShiftReminderSweepService {
  private readonly logger = new Logger(ShiftReminderSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    // Who is told about this member, at this workspace.
    private readonly routing: AttendanceRoutingService,
    // The automatic clock's own threshold for telling the leader (attendance/auto-clock.ts).
    @Optional() private readonly autoClock?: AutoClockService,
  ) {}

  /**
   * Shift reminder engine — replaces the old force-close auto-clock-out.
   *
   * It NEVER clocks anyone out. On a short interval it scans only the open
   * shifts whose reminder is actually due (`nextRemindAt <= now`, served by the
   * `[status, nextRemindAt]` index — not every open shift) and either:
   *   • nudges the worker ("forgot to clock out, or working extra?") and re-arms
   *     the next reminder, or
   *   • after `maxReminders` with no response, escalates to a space leader
   *     (a member whose sub-role grants `canReconcileAttendance`) and stops.
   *
   * Entries with no expected end (`nextRemindAt` null — TASK/NONE spaces or an
   * unresolved shift) are never touched: no reminders and no auto-close.
   */
  async runShiftReminders(_data?: { manual?: boolean }) {
    const now = new Date();

    const dueEntries = await this.prisma.timeEntry.findMany({
      where: {
        status: TimeEntryStatus.CLOCKED_IN,
        nextRemindAt: { not: null, lte: now },
      },
      include: {
        user: { select: MEMBER_SELECT },
        location: { select: { id: true, name: true, timezone: true } },
        shift: { select: { reminderIntervalMin: true, maxReminders: true } },
      },
      orderBy: { nextRemindAt: 'asc' }, // drain oldest-due first
      take: 500, // cap per tick; any backlog drains over subsequent ticks
    });

    if (dueEntries.length === 0) {
      return success({ remindedCount: 0, escalatedCount: 0, entryIds: [] });
    }

    // Partition into reminders vs escalations up front.
    type Due = (typeof dueEntries)[number];
    const toRemind: { entry: Due; nextCount: number; intervalMin: number; maxReminders: number }[] = [];
    const toEscalate: Due[] = [];
    /*
      ── The automatic clock: still inside after the end ──
      For a member it is on for, the phone asks the person itself (offline), so
      the server sends no "forgot to clock out?" nudges: it tells the LEADER once,
      at the planned end + `leaderAfterMinutes`, through the same routing
      escalation (workspace → the member's watchers → nobody). Due early (an
      approved extra-time round re-arms the ordinary reminder) → re-armed for
      that moment. One query for the whole batch.
    */
    const autoByEntry = this.autoClock ? await this.autoClock.settingsForEntries(dueEntries, now) : new Map();
    const rearm: { id: string; at: Date }[] = [];
    for (const entry of dueEntries) {
      const auto = autoByEntry.get(entry.id);
      // Clocked by arriving and leaving with no shift: its course is the workspace's hours, read now.
      const plannedEnd =
        entry.expectedClockOutAt ??
        (auto && clocksByPresence(auto, entry) ? presenceSessionEnd(entry.clockInAt, auto) : null);
      if (auto && plannedEnd) {
        const leaderAt = new Date(plannedEnd.getTime() + auto.leaderAfterMinutes * 60_000);
        if (now.getTime() < leaderAt.getTime()) rearm.push({ id: entry.id, at: leaderAt });
        else toEscalate.push(entry);
        continue;
      }
      // No expected end → this was an unscheduled clock-in armed by the safety net;
      // use the slower unscheduled cadence, not the tight shift cadence.
      const isUnscheduled = !entry.expectedClockOutAt;
      const { intervalMin, maxReminders } = isUnscheduled
        ? {
            intervalMin: UNSCHEDULED_SESSION_DEFAULTS.REMINDER_INTERVAL_MINUTES,
            maxReminders: UNSCHEDULED_SESSION_DEFAULTS.MAX_REMINDERS,
          }
        : shiftNudgeCadence(entry.shift);
      const nextCount = entry.reminderCount + 1;
      if (nextCount <= maxReminders) toRemind.push({ entry, nextCount, intervalMin, maxReminders });
      else toEscalate.push(entry);
    }

    // The workspace half is resolved ONCE per distinct escalating space — it is
    // the same answer for everybody there. The member half, when a space has
    // nobody, is resolved per entry inside `notifyTargetsFor`.
    const leadersBySpace = new Map<string, string[]>();
    const targetsByEntry = new Map<string, string[]>();
    for (const e of toEscalate) {
      targetsByEntry.set(e.id, await this.routing.notifyTargetsFor(e, 'canReconcileAttendance', leadersBySpace));
    }

    // Deferred writes (thunks) so we can cap DB concurrency.
    const tasks: Array<() => Promise<void>> = [];

    for (const r of rearm) {
      tasks.push(async () => {
        // Conditional: a clock-out between the read and this write must not be re-armed.
        await this.prisma.timeEntry.updateMany({
          where: { id: r.id, status: TimeEntryStatus.CLOCKED_IN },
          data: { nextRemindAt: r.at },
        });
      });
    }

    for (const { entry, nextCount, intervalMin, maxReminders } of toRemind) {
      const userName = personName(entry.user);
      const nextRemindAt = new Date(now.getTime() + intervalMin * 60_000);
      tasks.push(async () => {
        await this.prisma.timeEntry.update({
          where: { id: entry.id },
          data: { reminderState: 'REMINDED', reminderCount: nextCount, nextRemindAt },
        });
        /*
          One question at the end of a shift (decided 2026-10-18): a new entry with a
          planned end gets the FIRST reminder only — "Your shift has ended", with Clock
          out / Ask for more time. The later cycles still count, so the leader is told
          on the same schedule as before; the worker is not asked again.
        */
        if (judgedByLabelRules(entry) && entry.expectedClockOutAt && nextCount > 1) return;
        emitEvent(this.notificationClient, attendanceShiftReminderEvent, {
          entryId: entry.id,
          userId: entry.user.id,
          userName,
          locationId: entry.location?.id ?? entry.locationId,
          locationName: entry.location?.name || 'your shift',
          expectedClockOutAt: entry.expectedClockOutAt?.toISOString() ?? null,
          reminderCount: nextCount,
          unscheduled: !entry.expectedClockOutAt,
          hoursOpen: Math.round((now.getTime() - entry.clockInAt.getTime()) / 3_600_000),
          organizationId: entry.organizationId,
        });
        this.logger.log(`Shift reminder ${nextCount}/${maxReminders}: entry=${entry.id}, user=${userName}`);
      });
    }

    for (const entry of toEscalate) {
      const userName = personName(entry.user);
      const leaderIds = targetsByEntry.get(entry.id) ?? [];
      tasks.push(async () => {
        await this.prisma.timeEntry.update({
          where: { id: entry.id },
          data: { reminderState: 'ESCALATED', nextRemindAt: null },
        });
        emitEvent(this.notificationClient, attendanceShiftEscalationEvent, {
          entryId: entry.id,
          userId: entry.user.id,
          userName,
          locationId: entry.locationId,
          locationName: entry.location?.name || 'a shift',
          expectedClockOutAt: entry.expectedClockOutAt?.toISOString() ?? null,
          unscheduled: !entry.expectedClockOutAt,
          hoursOpen: Math.round((now.getTime() - entry.clockInAt.getTime()) / 3_600_000),
          leaderIds,
          organizationId: entry.organizationId,
        });
        this.logger.warn(`Shift escalation: entry=${entry.id}, user=${userName}, leaders=[${leaderIds.join(',')}]`);
      });
    }

    // Flush with bounded concurrency so a big burst can't monopolize the pooled
    // DB connections and starve live clock-in/out requests.
    const CONCURRENCY = 20;
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      await Promise.all(tasks.slice(i, i + CONCURRENCY).map((fn) => fn()));
    }

    return success({
      remindedCount: toRemind.length,
      escalatedCount: toEscalate.length,
      entryIds: [...toRemind.map((r) => r.entry.id), ...toEscalate.map((e) => e.id)],
      message: `Reminded ${toRemind.length}, escalated ${toEscalate.length}`,
    });
  }
}
