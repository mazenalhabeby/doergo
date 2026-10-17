import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ShiftResolverService } from './shift-resolver.service';
import { personName, success, SERVICE_NAMES } from '@hbcfield/shared';
import { AttendanceRoutingService } from './attendance-routing.service';
import { AutoClockService } from './auto-clock.service';
import { NoShowSettleService } from './no-show-settle.service';
import { shiftNudgeCadence } from './shift-sweep-helpers';
import {
  emitEvent,
  attendanceNoshowEscalationEvent,
  attendanceNoshowReminderEvent,
  attendanceNoshowResolvedEvent,
} from '@hbcfield/shared/microservices';

export { shiftNudgeCadence } from './shift-sweep-helpers';

/**
 * The shift engines that run on a clock: reminders on an open shift, the
 * expected shifts materialized ahead, fulfilling one at clock-in, and the
 * no-show sweep with its office list.
 */
@Injectable()
export class ShiftSweepService {
  private readonly logger = new Logger(ShiftSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    private readonly shiftResolver: ShiftResolverService,
    // Who is told about this member, at this workspace.
    private readonly routing: AttendanceRoutingService,
    // The automatic clock's own threshold for telling the leader (attendance/auto-clock.ts).
    @Optional() private readonly autoClock?: AutoClockService,
    // What the system can prove about a missed shift closes it before anybody is asked.
    @Optional() private readonly noShowSettle?: NoShowSettleService,
  ) {}

  /**
   * Clock-in fulfillment: mark the member's matching expected shift PRESENT.
   *
   * ⚠️ A clock-in can arrive AFTER the no-show sweep escalated it — a phone with
   * no signal at 07:58 sends it at 11:14, and by then a supervisor has been told
   * "hasn't clocked in and isn't responding". Marking the shift PRESENT fixes the
   * record and says nothing to the person who may already be phoning round. So
   * an escalated shift that is resolved this way tells the same people it
   * alerted, with the time of the tap.
   */
  async markShiftInstancePresent(
    userId: string,
    spaceId: string,
    shiftId: string,
    timeEntryId: string,
    clockInAt: Date,
    context?: { organizationId: string; recordedOffline: boolean; timezone: string },
  ) {
    const w = 12 * 3_600_000; // the instance whose start is within ±12h of this clock-in
    const window = {
      userId,
      spaceId,
      shiftId,
      expectedClockInAt: { gte: new Date(clockInAt.getTime() - w), lte: new Date(clockInAt.getTime() + w) },
    };
    const escalated = context
      ? await this.prisma.shiftInstance.findMany({ where: { ...window, state: 'ESCALATED' }, select: { id: true } })
      : [];
    await this.prisma.shiftInstance.updateMany({
      where: { ...window, state: { in: ['PENDING', 'REMINDED', 'ESCALATED'] } },
      data: { state: 'PRESENT', nextRemindAt: null, timeEntryId },
    });
    if (!context || escalated.length === 0) return;

    const member = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    const leaderIds = await this.routing.notifyTargetsFor(
      { spaceId, organizationId: context.organizationId, userId },
      'canReconcileAttendance',
    );
    for (const inst of escalated) {
      emitEvent(this.notificationClient, attendanceNoshowResolvedEvent, {
        instanceId: inst.id,
        userId,
        userName: member ? personName(member) : 'A worker',
        spaceId,
        clockInAt: clockInAt.toISOString(),
        timezone: context.timezone,
        recordedOffline: context.recordedOffline,
        leaderIds,
        organizationId: context.organizationId,
      });
    }
  }

  /**
   * No-show sweep (runs in the same 1-min tick as the clock-out reminder sweep):
   * drain expected shifts past their grace with no clock-in — nudge the worker,
   * then after MAX_REMINDERS escalate to a space leader. Members on approved
   * time-off are marked EXCUSED, not chased.
   */
  async runNoShowSweep() {
    const now = new Date();
    const due = await this.prisma.shiftInstance.findMany({
      where: { state: { in: ['PENDING', 'REMINDED'] }, nextRemindAt: { not: null, lte: now } },
      orderBy: { nextRemindAt: 'asc' },
      take: 500,
    });
    if (due.length === 0) return success({ remindedCount: 0, escalatedCount: 0, excusedCount: 0 });

    /*
      First, what the system can PROVE (shared attendance/no-show.ts): approved
      leave, a clock-in here or at another workspace in the shift's time, the
      person gone, the rota no longer planning it, a public holiday. Those are
      closed with the reason, and nobody is chased or told.
    */
    const settled = this.noShowSettle ? await this.noShowSettle.settle(due, now) : new Map();
    const open = due.filter((d) => !settled.get(d.id));
    const excusedCount = due.length - open.length;
    if (open.length === 0) return success({ remindedCount: 0, escalatedCount: 0, excusedCount });

    // Names and each shift's cadence (ShiftInstance is fk-less by design) — one query each.
    const userIds = [...new Set(open.map((d) => d.userId))];
    const shiftIds = [...new Set(open.map((d) => d.shiftId))];
    const [users, shifts] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.shift.findMany({
        where: { id: { in: shiftIds } },
        select: { id: true, reminderIntervalMin: true, maxReminders: true },
      }),
    ]);
    const nameById = new Map(users.map((u) => [u.id, personName(u)]));
    const shiftById = new Map(shifts.map((s) => [s.id, s]));

    const toRemind: { inst: (typeof due)[number]; nextCount: number; intervalMin: number }[] = [];
    const toEscalate: (typeof due)[number][] = [];
    for (const inst of open) {
      // A deleted shift (no row) falls back to the defaults rather than stalling.
      const { intervalMin, maxReminders } = shiftNudgeCadence(shiftById.get(inst.shiftId));
      const nextCount = inst.reminderCount + 1;
      if (nextCount <= maxReminders) toRemind.push({ inst, nextCount, intervalMin });
      else toEscalate.push(inst);
    }

    const leadersBySpace = new Map<string, string[]>();
    const targetsByEntry = new Map<string, string[]>();
    for (const e of toEscalate) {
      targetsByEntry.set(e.id, await this.routing.notifyTargetsFor(e, 'canReconcileAttendance', leadersBySpace));
    }

    const tasks: Array<() => Promise<void>> = [];
    for (const { inst, nextCount, intervalMin } of toRemind) {
      const userName = nameById.get(inst.userId) ?? 'A worker';
      const nextRemindAt = new Date(now.getTime() + intervalMin * 60_000);
      tasks.push(async () => {
        await this.prisma.shiftInstance.update({
          where: { id: inst.id },
          data: { state: 'REMINDED', reminderCount: nextCount, nextRemindAt },
        });
        emitEvent(this.notificationClient, attendanceNoshowReminderEvent, {
          instanceId: inst.id,
          userId: inst.userId,
          userName,
          spaceId: inst.spaceId,
          expectedClockInAt: inst.expectedClockInAt.toISOString(),
          reminderCount: nextCount,
          organizationId: inst.organizationId,
        });
      });
    }
    for (const inst of toEscalate) {
      const userName = nameById.get(inst.userId) ?? 'A worker';
      const leaderIds = targetsByEntry.get(inst.id) ?? [];
      tasks.push(async () => {
        await this.prisma.shiftInstance.update({
          where: { id: inst.id },
          data: { state: 'ESCALATED', nextRemindAt: null },
        });
        emitEvent(this.notificationClient, attendanceNoshowEscalationEvent, {
          instanceId: inst.id,
          userId: inst.userId,
          userName,
          spaceId: inst.spaceId,
          expectedClockInAt: inst.expectedClockInAt.toISOString(),
          leaderIds,
          organizationId: inst.organizationId,
        });
      });
    }
    const CONCURRENCY = 20;
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      await Promise.all(tasks.slice(i, i + CONCURRENCY).map((fn) => fn()));
    }
    return success({ remindedCount: toRemind.length, escalatedCount: toEscalate.length, excusedCount });
  }
}
