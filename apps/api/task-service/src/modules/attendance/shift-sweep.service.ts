import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { MEMBER_SELECT } from './attendance-selects';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ShiftResolverService } from './shift-resolver.service';
import {
  success,
  TimeEntryStatus,
  SHIFT_REMINDER_DEFAULTS,
  UNSCHEDULED_SESSION_DEFAULTS,
  SERVICE_NAMES,
} from '@hbcfield/shared';
import { ABSENCE_WHERE, scopeWhereOn, type AttendanceScope } from '@hbcfield/shared';
import { localPartsIn, toISODateString } from '@hbcfield/shared';
import { AttendanceRoutingService } from './attendance-routing.service';

/**
 * A shift's own nudge cadence — gap between nudges and how many before a
 * leader is told — with the defaults where there is no shift row to read.
 *
 * ONE reading for both sweeps (an open shift that will not end, and a shift
 * nobody turned up for). The no-show sweep used to hard-code the defaults, so
 * a shift set to "nudge every 15 min, twice" was nudged every 5, three times,
 * when nobody came — and as configured only when they forgot to leave.
 * (The GRACE before the first nudge is already the shift's: it is baked into
 * `nextRemindAt` when the instance is materialized.)
 */
export function shiftNudgeCadence(
  shift?: { reminderIntervalMin?: number | null; maxReminders?: number | null } | null,
): { intervalMin: number; maxReminders: number } {
  return {
    intervalMin: shift?.reminderIntervalMin ?? SHIFT_REMINDER_DEFAULTS.REMINDER_INTERVAL_MINUTES,
    maxReminders: shift?.maxReminders ?? SHIFT_REMINDER_DEFAULTS.MAX_REMINDERS,
  };
}

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
    for (const entry of dueEntries) {
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

    for (const { entry, nextCount, intervalMin, maxReminders } of toRemind) {
      const userName = `${entry.user.firstName} ${entry.user.lastName}`;
      const nextRemindAt = new Date(now.getTime() + intervalMin * 60_000);
      tasks.push(async () => {
        await this.prisma.timeEntry.update({
          where: { id: entry.id },
          data: { reminderState: 'REMINDED', reminderCount: nextCount, nextRemindAt },
        });
        this.notificationClient.emit('attendance_shift_reminder', {
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
      const userName = `${entry.user.firstName} ${entry.user.lastName}`;
      const leaderIds = targetsByEntry.get(entry.id) ?? [];
      tasks.push(async () => {
        await this.prisma.timeEntry.update({
          where: { id: entry.id },
          data: { reminderState: 'ESCALATED', nextRemindAt: null },
        });
        this.notificationClient.emit('attendance_shift_escalation', {
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

  // ──────────────────────────────────────────────────────────────────────────
  // NO-SHOW ENGINE (clock-in parity): materialize expected shifts → fulfill on
  // clock-in → sweep the unfulfilled ones (remind worker, escalate to a leader).
  // ──────────────────────────────────────────────────────────────────────────

  /** Local YYYY-MM-DD days (in tz) spanning [from, to] — a 2–3 element set. */
  private localDaysInWindow(from: Date, to: Date, tz: string): string[] {
    // The shared zoned-time reader (cached formatter, UTC on an unknown zone).
    const day = (t: Date) => localPartsIn(t, tz).dateStr;
    const days = new Set<string>();
    for (let t = from.getTime(); t <= to.getTime(); t += 6 * 3_600_000) days.add(day(new Date(t)));
    days.add(day(to));
    return [...days];
  }

  /**
   * Rolling materialization: ensure a ShiftInstance exists for every rota shift
   * in the next `windowHours`. Idempotent (upsert; never overwrites lifecycle
   * state). Physical spaces anchor to the site tz; logical to the member's tz
   * (falling back to org). Bounded scan over active assignments — no per-minute
   * cost (runs on a slow cron).
   */
  async materializeShiftInstances(windowHours = 36) {
    const now = new Date();
    const horizon = new Date(now.getTime() + windowHours * 3_600_000);

    // Collect every expected ShiftInstance, then bulk-insert. `skipDuplicates`
    // reproduces the old per-row upsert's `update: {}` semantics (insert new,
    // never clobber an existing instance's lifecycle/reminders) — but as chunked
    // createMany instead of up to ~15k serial upserts occupying the queue slot. (P5)
    const pending: Array<{
      organizationId: string;
      spaceId: string;
      userId: string;
      shiftId: string;
      localDate: string;
      expectedClockInAt: Date;
      expectedClockOutAt: Date;
      nextRemindAt: Date;
    }> = [];

    // Keyset-paginate ALL active assignments (cursor by id) instead of a silent
    // `take: 5000` cap that stopped materializing — and therefore stopped
    // detecting no-shows — for the tail beyond 5000 active rotas. (P4)
    const BATCH = 1000;
    let cursor: string | undefined;
    let processed = 0;
    for (;;) {
      const assignments = await this.prisma.shiftAssignment.findMany({
        where: {
          isActive: true,
          effectiveFrom: { lte: horizon },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
        },
        include: {
          shift: true,
          space: { select: { id: true, organizationId: true, timezone: true, lat: true, lng: true } },
          user: { select: { id: true, timezone: true, organization: { select: { timezone: true } } } },
        },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (assignments.length === 0) break;
      cursor = assignments[assignments.length - 1].id;
      processed += assignments.length;

      for (const a of assignments) {
        if (!a.shift?.isActive) continue;
        const physical = a.space.lat != null && a.space.lng != null;
        const tz = physical
          ? a.space.timezone || 'UTC'
          : a.user.timezone || a.user.organization?.timezone || 'UTC';
        for (const dateStr of this.localDaysInWindow(now, horizon, tz)) {
          const win = this.shiftResolver.matchAndWindowForDate(a as any, tz, dateStr);
          if (!win) continue;
          if (win.expectedClockOutAt.getTime() < now.getTime()) continue; // already over
          const graceMin = a.shift.graceMin ?? SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES;
          pending.push({
            organizationId: a.space.organizationId,
            spaceId: a.spaceId,
            userId: a.userId,
            shiftId: a.shiftId,
            localDate: dateStr,
            expectedClockInAt: win.expectedClockInAt,
            expectedClockOutAt: win.expectedClockOutAt,
            nextRemindAt: new Date(win.expectedClockInAt.getTime() + graceMin * 60_000),
          });
        }
      }

      if (assignments.length < BATCH) break;
    }

    let created = 0;
    const CHUNK = 1000;
    for (let i = 0; i < pending.length; i += CHUNK) {
      const res = await this.prisma.shiftInstance.createMany({
        data: pending.slice(i, i + CHUNK),
        skipDuplicates: true,
      });
      created += res.count;
    }
    return success({ processed, created });
  }

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

    const member = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    const leaderIds = await this.routing.notifyTargetsFor({ spaceId, organizationId: context.organizationId, userId }, 'canReconcileAttendance');
    for (const inst of escalated) {
      this.notificationClient.emit('attendance_noshow_resolved', {
        instanceId: inst.id,
        userId,
        userName: member ? `${member.firstName} ${member.lastName}`.trim() : 'A worker',
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

    // Batch-load names, approved time-off and each shift's cadence
    // (ShiftInstance is fk-less by design) — one query each, whatever the batch.
    const userIds = [...new Set(due.map((d) => d.userId))];
    const shiftIds = [...new Set(due.map((d) => d.shiftId))];
    // The earliest shift day in the batch: leave that ended before it cannot
    // excuse anything here, so it is not read (a member's whole leave history
    // otherwise rides along every minute).
    const earliestDay = due.reduce((min, d) => (d.localDate < min ? d.localDate : min), due[0].localDate);
    const [users, leaves, shifts] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.timeOff.findMany({
        // Only LEAVE excuses a shift — a remote day or changed hours is a day still owed.
        where: { technicianId: { in: userIds }, status: 'APPROVED', ...ABSENCE_WHERE, endDate: { gte: new Date(`${earliestDay}T00:00:00.000Z`) } },
        select: { technicianId: true, startDate: true, endDate: true },
      }),
      this.prisma.shift.findMany({
        where: { id: { in: shiftIds } },
        select: { id: true, reminderIntervalMin: true, maxReminders: true },
      }),
    ]);
    const nameById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    const shiftById = new Map(shifts.map((s) => [s.id, s]));
    /*
      ⚠️ Compared as CALENDAR DAYS, never as instants. `startDate`/`endDate` are
      DATE columns (read back as UTC midnight) and the last day is INCLUSIVE, so
      `endDate >= expectedClockInAt` failed for any shift on the last day of
      leave — 07:00 in Vienna is 05:00Z, after the stored midnight — and the
      member was chased on a day they had off. `localDate` is the shift's own day
      in the zone it was materialized in (the workspace's), which is exactly the
      day the leave was booked against.
    */
    const onLeave = (userId: string, localDate: string) =>
      leaves.some(
        (l) =>
          l.technicianId === userId &&
          toISODateString(l.startDate) <= localDate &&
          toISODateString(l.endDate) >= localDate,
      );

    const toRemind: { inst: (typeof due)[number]; nextCount: number; intervalMin: number }[] = [];
    const toEscalate: (typeof due)[number][] = [];
    const toExcuse: string[] = [];
    for (const inst of due) {
      if (onLeave(inst.userId, inst.localDate)) {
        toExcuse.push(inst.id);
        continue;
      }
      // A deleted shift (no row) falls back to the defaults rather than stalling.
      const { intervalMin, maxReminders } = shiftNudgeCadence(shiftById.get(inst.shiftId));
      const nextCount = inst.reminderCount + 1;
      if (nextCount <= maxReminders) toRemind.push({ inst, nextCount, intervalMin });
      else toEscalate.push(inst);
    }

    if (toExcuse.length) {
      await this.prisma.shiftInstance.updateMany({
        where: { id: { in: toExcuse } },
        data: { state: 'EXCUSED', nextRemindAt: null },
      });
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
        this.notificationClient.emit('attendance_noshow_reminder', {
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
        this.notificationClient.emit('attendance_noshow_escalation', {
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
    return success({ remindedCount: toRemind.length, escalatedCount: toEscalate.length, excusedCount: toExcuse.length });
  }

  /** Admin list: recent no-shows (reminded / escalated / excused) for review. */
  async listNoShows(data: { organizationId: string; days?: number; spaceId?: string; scopeSpaceIds?: AttendanceScope }) {
    const now = new Date();
    const since = new Date(now.getTime() - (data.days ?? 7) * 86_400_000);
    const rows = await this.prisma.shiftInstance.findMany({
      where: {
        organizationId: data.organizationId,
        /*
          ⚠️ BOTH, AND-ed — never spread into one object. Spreading the scope
          after `{ spaceId }` REPLACED the key: a site lead asking for one of
          their two sites got both, silently. It never leaked (the scope still
          won), but the filter the caller asked for was dropped.
        */
        AND: [
          data.spaceId ? { spaceId: data.spaceId } : {},
          scopeWhereOn('spaceId', data.scopeSpaceIds),
        ],
        state: { in: ['REMINDED', 'ESCALATED', 'EXCUSED'] },
        expectedClockInAt: { gte: since, lte: now },
      },
      orderBy: { expectedClockInAt: 'desc' },
      take: 200,
    });
    if (rows.length === 0) return success([]);

    const userIds = [...new Set(rows.map((r) => r.userId))];
    const spaceIds = [...new Set(rows.map((r) => r.spaceId))];
    const [users, spaces] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, avatarUrl: true } }),
      this.prisma.companyLocation.findMany({ where: { id: { in: spaceIds } }, select: { id: true, name: true } }),
    ]);
    const uMap = new Map(users.map((u) => [u.id, u]));
    const sMap = new Map(spaces.map((s) => [s.id, s.name]));
    return success(
      rows.map((r) => {
        const u = uMap.get(r.userId);
        return {
          id: r.id,
          userId: r.userId,
          userName: u ? `${u.firstName} ${u.lastName}` : 'Unknown',
          avatarUrl: u?.avatarUrl ?? null,
          spaceId: r.spaceId,
          spaceName: sMap.get(r.spaceId) ?? 'Space',
          expectedClockInAt: r.expectedClockInAt,
          expectedClockOutAt: r.expectedClockOutAt,
          state: r.state,
          reminderCount: r.reminderCount,
          localDate: r.localDate,
          excuseReason: r.excuseReason ?? null,
        };
      }),
    );
  }

  /** Excuse a no-show (mark EXCUSED + record the reason) or reopen it (back to PENDING). */
  async resolveNoShow(data: { id: string; organizationId: string; action: 'excuse' | 'reopen'; reason?: string; excusedById?: string; scopeSpaceIds?: AttendanceScope }) {
    const inst = await this.prisma.shiftInstance.findFirst({
      // ShiftInstance names its own space, so it narrows on `spaceId`. A
      // no-show in a space the caller was not granted reads as 'not found'.
      where: {
        id: data.id,
        organizationId: data.organizationId,
        ...scopeWhereOn('spaceId', data.scopeSpaceIds),
      },
      select: { id: true },
    });
    if (!inst) throw new NotFoundException('No-show not found');
    const updated = await this.prisma.shiftInstance.update({
      where: { id: inst.id },
      data: data.action === 'reopen'
        ? { state: 'PENDING', nextRemindAt: new Date(), excuseReason: null, excusedById: null }
        : { state: 'EXCUSED', nextRemindAt: null, excuseReason: data.reason?.trim().slice(0, 500) || null, excusedById: data.excusedById ?? null },
    });
    return success(updated);
  }
}
