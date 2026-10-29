import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  zoneOf,
  ABSENCE_WHERE,
  NO_SHOW_OPEN_STATES,
  settleNoShow,
  toISODateString,
  type NoShowSettlement,
  peopleStanding,
  rotaInForceOn,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { CalendarRulesService } from '../../calendar/calendar-rules.service';
import { ShiftResolverService } from '../core/shift-resolver.service';
import { isMemberAt } from '../shifts/shift-instances.service';

/** What a missed shift needs to be judged — the columns of a ShiftInstance. */
export interface NoShowInstance {
  id: string;
  organizationId: string;
  userId: string;
  spaceId: string;
  shiftId: string;
  localDate: string;
  expectedClockInAt: Date;
  expectedClockOutAt: Date;
}

/** Open no-shows older than this are left as they are (a record to decide, not to re-prove). */
const RECHECK_DAYS = 60;
const BATCH = 500;

/**
 * Closes the no-shows the system can PROVE need nobody (shared `settleNoShow`):
 * a clock-in here after all (late, or the hours added by the office), a
 * clock-in at another workspace in that shift's time, approved leave, the
 * person gone, the rota no longer planning the shift that day, a full public
 * holiday. The reason is written on the row; nobody is told.
 *
 * Asked by the no-show sweep before it nudges or escalates, after the office
 * adds hours, and on the slow cron over every open one (the rota, the leave or
 * the calendar may change after the shift was missed).
 *
 * Batched: a fixed number of queries per call, whatever the number of rows.
 */
@Injectable()
export class NoShowSettleService {
  private readonly logger = new Logger(NoShowSettleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftResolver: ShiftResolverService,
    @Optional() private readonly calendar?: CalendarRulesService,
  ) {}

  /** Judge and write. Returns what was settled, keyed by instance id. */
  async settle(instances: readonly NoShowInstance[], now = new Date()): Promise<Map<string, NoShowSettlement>> {
    const verdicts = await this.judge(instances, now);
    const writes: Promise<unknown>[] = [];
    for (const [id, v] of verdicts) {
      if (!v) continue;
      // Guarded on the open states: a leader's decision in the meantime is never overwritten.
      const where = { id, state: { in: ['PENDING', ...NO_SHOW_OPEN_STATES] } };
      writes.push(
        v.state === 'PRESENT'
          ? this.prisma.shiftInstance.updateMany({
              where,
              data: { state: 'PRESENT', timeEntryId: v.timeEntryId, nextRemindAt: null },
            })
          : this.prisma.shiftInstance.updateMany({
              where,
              data: {
                state: 'EXCUSED',
                nextRemindAt: null,
                closeReason: v.reason,
                closedAutomatically: true,
                settledSpaceId: v.settledSpaceId ?? null,
                decidedAt: now,
              },
            }),
      );
    }
    await Promise.all(writes);
    return verdicts;
  }

  /** Every open no-show of the last two months, once more (the slow cron). */
  async recheckOpen(now = new Date()) {
    const since = new Date(now.getTime() - RECHECK_DAYS * 86_400_000);
    let settled = 0;
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.prisma.shiftInstance.findMany({
        where: { state: { in: [...NO_SHOW_OPEN_STATES] }, expectedClockInAt: { gte: since } },
        select: INSTANCE_SELECT,
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!rows.length) break;
      cursor = rows[rows.length - 1]!.id;
      const v = await this.settle(rows, now);
      settled += [...v.values()].filter(Boolean).length;
      if (rows.length < BATCH) break;
    }
    if (settled) this.logger.log(`No-shows settled on re-check: ${settled}`);
    return { settled };
  }

  /** After hours were added (or an entry edited) for one person: their open no-shows in that span. */
  async settleForUser(userId: string, from: Date, to: Date, now = new Date()) {
    const rows = await this.prisma.shiftInstance.findMany({
      where: {
        userId,
        state: { in: ['PENDING', ...NO_SHOW_OPEN_STATES] },
        expectedClockOutAt: { gt: from },
        expectedClockInAt: { lt: to, lte: now },
      },
      select: INSTANCE_SELECT,
      take: BATCH,
    });
    return rows.length ? this.settle(rows, now) : new Map<string, NoShowSettlement>();
  }

  /** The verdicts, written nowhere. */
  async judge(instances: readonly NoShowInstance[], now = new Date()): Promise<Map<string, NoShowSettlement>> {
    const out = new Map<string, NoShowSettlement>();
    if (!instances.length) return out;

    const userIds = [...new Set(instances.map((i) => i.userId))];
    const shiftIds = [...new Set(instances.map((i) => i.shiftId))];
    const minStart = new Date(Math.min(...instances.map((i) => i.expectedClockInAt.getTime())));
    const maxEnd = new Date(Math.max(...instances.map((i) => i.expectedClockOutAt.getTime())));
    const days = instances.map((i) => i.localDate).sort();
    const firstDay = days[0]!;
    const lastDay = days[days.length - 1]!;

    const spaceIds = [...new Set(instances.map((i) => i.spaceId))];
    const [entries, leaves, users, assignments, members, spaces] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: {
          userId: { in: userIds },
          clockInAt: { lt: maxEnd },
          OR: [{ clockOutAt: null }, { clockOutAt: { gt: minStart } }],
          approvalStatus: { not: 'REJECTED' },
        },
        select: { id: true, userId: true, locationId: true, clockInAt: true, clockOutAt: true },
      }),
      this.prisma.timeOff.findMany({
        where: {
          technicianId: { in: userIds },
          status: 'APPROVED',
          ...ABSENCE_WHERE,
          startDate: { lte: new Date(`${lastDay}T00:00:00.000Z`) },
          endDate: { gte: new Date(`${firstDay}T00:00:00.000Z`) },
        },
        select: { technicianId: true, startDate: true, endDate: true },
      }),
      peopleStanding(this.prisma, userIds),
      this.prisma.shiftAssignment.findMany({
        where: { userId: { in: userIds }, shiftId: { in: shiftIds }, isActive: true },
        select: {
          userId: true,
          spaceId: true,
          shiftId: true,
          recurrence: true,
          daysOfWeek: true,
          daysOfMonth: true,
          dates: true,
          effectiveFrom: true,
          effectiveTo: true,
          isActive: true,
          shift: { select: { startLocal: true, endLocal: true, crossesMidnight: true, isActive: true } },
          space: { select: { timezone: true } },
        },
      }),
      this.prisma.spaceAssignment.findMany({
        where: { userId: { in: userIds }, spaceId: { in: spaceIds } },
        select: { userId: true, spaceId: true, effectiveFrom: true, effectiveTo: true },
      }),
      this.prisma.companyLocation.findMany({ where: { id: { in: spaceIds } }, select: { id: true, isActive: true } }),
    ]);
    const memberOf = new Map(members.map((m) => [`${m.userId}:${m.spaceId}`, m]));
    const openSpaces = new Set(spaces.filter((x) => x.isActive).map((x) => x.id));
    const holidays = await this.holidayDays(instances, firstDay, lastDay);
    const userById = new Map(users.map((u) => [u.id, u]));

    for (const inst of instances) {
      const inEnd = inst.expectedClockOutAt.getTime();
      const inStart = inst.expectedClockInAt.getTime();
      const overlapping = entries
        .filter(
          (e) => e.userId === inst.userId && e.clockInAt.getTime() < inEnd && (e.clockOutAt ?? now).getTime() > inStart,
        )
        .map((e) => ({ timeEntryId: e.id, spaceId: e.locationId }));
      const onLeave = leaves.some(
        (l) =>
          l.technicianId === inst.userId &&
          toISODateString(l.startDate) <= inst.localDate &&
          toISODateString(l.endDate) >= inst.localDate,
      );
      const u = userById.get(inst.userId);
      const memberGone = !u || !u.isActive || u.organizationId !== inst.organizationId;
      // As the rota stands NOW: an assignment for this person, shift and workspace, in force that day
      // (compared as local DAYS, never a padded instant), that plans it — in a workspace still open,
      // with the person on its roster at the shift's start and still on it.
      const m = memberOf.get(`${inst.userId}:${inst.spaceId}`);
      const stillPlanned =
        openSpaces.has(inst.spaceId) &&
        isMemberAt(m, inst.expectedClockInAt) &&
        isMemberAt(m, now) &&
        assignments.some(
          (a) =>
            a.userId === inst.userId &&
            a.spaceId === inst.spaceId &&
            a.shiftId === inst.shiftId &&
            a.shift?.isActive !== false &&
            rotaInForceOn(a, inst.localDate) &&
            !!this.shiftResolver.matchAndWindowForDate(a, zoneOf(a.space?.timezone), inst.localDate),
        );
      const holiday = holidays.get(inst.spaceId)?.has(inst.localDate) ?? false;
      out.set(inst.id, settleNoShow(inst, { overlapping, onLeave, memberGone, stillPlanned, holiday }));
    }
    return out;
  }

  /** Full public holidays (and company days off) per workspace, in the window. Three queries per organization. */
  private async holidayDays(
    instances: readonly NoShowInstance[],
    from: string,
    to: string,
  ): Promise<Map<string, Set<string>>> {
    const out = new Map<string, Set<string>>();
    if (!this.calendar) return out;
    const spacesByOrg = new Map<string, Set<string>>();
    for (const i of instances) {
      const set = spacesByOrg.get(i.organizationId) ?? new Set<string>();
      set.add(i.spaceId);
      spacesByOrg.set(i.organizationId, set);
    }
    for (const [orgId, spaceIds] of spacesByOrg) {
      try {
        const places = await this.calendar.places(orgId, [...spaceIds], from, to);
        for (const id of spaceIds) {
          const rules = places.get(id)?.rules;
          if (!rules) continue;
          const days = new Set<string>();
          for (const [day, h] of rules.holidays) if (!h.halfDay) days.add(day);
          out.set(id, days);
        }
      } catch (e) {
        // A calendar that cannot be read settles nothing on holidays; the rest still applies.
        this.logger.warn(`Holiday lookup failed for ${orgId}: ${(e as Error).message}`);
      }
    }
    return out;
  }
}

export const INSTANCE_SELECT = {
  id: true,
  organizationId: true,
  userId: true,
  spaceId: true,
  shiftId: true,
  localDate: true,
  expectedClockInAt: true,
  expectedClockOutAt: true,
} as const;
