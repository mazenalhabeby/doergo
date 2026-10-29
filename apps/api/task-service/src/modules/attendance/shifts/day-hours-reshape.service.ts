import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  COUNTED_ROUND_STATUSES,
  PrismaService,
  SERVICE_NAMES,
  judgedByLabelRules,
  toISODateString,
  localPartsIn,
  readLabelFacts,
  withExpectedEnd,
  zoneOf,
} from '@hbcfield/shared';
import { emitEvent, attendanceChangedEvent } from '@hbcfield/shared/microservices';
import type { Prisma } from '@prisma/client';
import { CountedTimeService } from '../core/counted-time.service';
import { approvalFor } from '../core/attendance-occurrence';
import { approvedRequestsAround, dayRequestEffect, type DayRequestRow } from '../core/approved-requests';
import { reshapeForDayHours, withAgreedOutside } from './day-hours-reshape';

const DAY_MS = 86_400_000;
const DECIDED = new Set(['APPROVED', 'REJECTED']);

export interface DayHoursChange {
  organizationId: string;
  userId: string;
  /** The local day, YYYY-MM-DD. */
  date: string;
  /** The workspace the hours are for; null = every workspace. */
  spaceId: string | null;
  /** The approved HOURS request just written — its times are the day's plan. */
  request: DayRequestRow;
  actorId: string;
  reason: string | null;
}

/**
 * The office changed the hours of one day AFTER the member already clocked in that day
 * (docs/plans/time-counting-model.md, phase 2). A clock-in later that day reads the approved
 * request itself (`applyDayRequests`); an entry already recorded is re-shaped here through the
 * SAME rule (`dayRequestEffect`), so both answer one question one way.
 *
 * ⚠️ A decided entry keeps its decision — the person who set the hours IS deciding — and its
 * note says what moved. An undecided one is judged again from its new flags.
 */
@Injectable()
export class DayHoursReshapeService {
  private readonly logger = new Logger(DayHoursReshapeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly countedTime: CountedTimeService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  /** Re-shape the day's entries; returns how many changed. */
  /** An approved one-day HOURS request — set in Approvals or by the office — re-plans the sessions it is about. */
  async reshapeApprovedHours(
    t: {
      id: string;
      kind: string;
      technicianId: string;
      spaceId: string | null;
      startDate: Date;
      endDate: Date;
      startTime: string | null;
      endTime: string | null;
      reason: string | null;
    },
    actorId: string,
    organizationId: string,
  ): Promise<number> {
    if (t.kind !== 'HOURS' || t.startDate.getTime() !== t.endDate.getTime()) return 0;
    return this.reshapeDay({
      organizationId,
      userId: t.technicianId,
      date: toISODateString(t.startDate),
      spaceId: t.spaceId,
      request: { ...t, kind: 'HOURS', minutes: null },
      actorId,
      reason: t.reason,
    });
  }

  async reshapeDay(change: DayHoursChange): Promise<number> {
    const dayStart = Date.parse(`${change.date}T00:00:00.000Z`);
    // A day either side covers every zone on Earth; the local day is checked per entry below.
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        userId: change.userId,
        organizationId: change.organizationId,
        clockInAt: { gte: new Date(dayStart - DAY_MS), lt: new Date(dayStart + 2 * DAY_MS) },
        approvalStatus: { not: 'REJECTED' },
        ...(change.spaceId ? { locationId: change.spaceId } : {}),
      },
      include: { location: { select: { timezone: true } } },
      orderBy: { clockInAt: 'asc' },
    });
    const sameDay = entries.filter(
      (e) => localPartsIn(e.clockInAt, zoneOf(e.location?.timezone, e.timezone)).dateStr === change.date,
    );
    /*
      ⚠️ Only the sessions the new hours are ABOUT: those that overlap them (a running one counts as
      running until now). An earlier session that day which ended before the new hours start — a
      morning without a plan, a long no-shift day — is a session of its own: re-planned to hours it
      never touched, its counted time would fall to nothing, silently. Found by tools/time-counting-e2e.py.
    */
    const today = sameDay.filter((e) => {
      // A FINISHED no-shift session was counted by the no-shift rule (all of it, long day flagged);
      // hours set afterwards are about the rest of the day, never a reason to re-count it.
      if (e.clockOutAt && e.endIsDailyLimit) return false;
      const tz = zoneOf(e.location?.timezone, e.timezone);
      const w = dayRequestEffect([change.request], {
        spaceId: e.locationId,
        at: e.clockInAt,
        tz,
        expectedClockInAt: null,
        expectedClockOutAt: null,
      });
      const end = (e.clockOutAt ?? new Date()).getTime();
      const from = w.expectedClockInAt?.getTime() ?? -Infinity;
      const to = w.expectedClockOutAt?.getTime() ?? Infinity;
      return e.clockInAt.getTime() < to && end > from;
    });
    if (!today.length) return 0;

    // Agreed overtime extends the NEW end too — only when the end is replaced (else it is already in it).
    const overtime = change.request.endTime
      ? await approvedRequestsAround(this.prisma, change.userId, today[0].clockInAt, ['OVERTIME'])
      : [];

    let changed = 0;
    for (const entry of today) {
      if (await this.reshapeOne(entry, change, overtime)) changed++;
    }
    if (changed) {
      emitEvent(this.notificationClient, attendanceChangedEvent, {
        organizationId: change.organizationId,
        action: 'day_hours_set',
        userId: change.userId,
        spaceId: change.spaceId,
      });
    }
    return changed;
  }

  private async reshapeOne(
    entry: Prisma.TimeEntryGetPayload<{ include: { location: { select: { timezone: true } } } }>,
    change: DayHoursChange,
    overtime: DayRequestRow[],
  ): Promise<boolean> {
    const tz = zoneOf(entry.location?.timezone, entry.timezone);
    // From the RAW window: a changed day replaces what it names; agreed overtime is added again on top.
    const effect = dayRequestEffect([change.request, ...overtime], {
      spaceId: entry.locationId,
      at: entry.clockInAt,
      tz,
      expectedClockInAt: entry.expectedClockInAt,
      expectedClockOutAt: change.request.endTime ? null : entry.expectedClockOutAt,
    });
    const toleranceMin = await this.countedTime.toleranceFor(entry.shiftId);
    const window = withAgreedOutside(
      { start: effect.expectedClockInAt, end: effect.expectedClockOutAt },
      {
        roundMinutes: change.request.endTime ? await this.agreedRoundMinutes(entry.id) : 0,
        beforeMinutes: entry.outsideBeforeMinutes ?? 0,
      },
      { start: !!change.request.startTime, end: !!change.request.endTime },
    );
    const next = reshapeForDayHours({ ...entry, flagReasons: entry.flagReasons as string[] }, window, toleranceMin, new Date());
    if (!next.startMoved && !next.endMoved) return false;

    const counted = entry.clockOutAt
      ? await this.countedTime.columnsFor({ ...entry, ...next }, entry.clockOutAt, toleranceMin)
      : null;
    const decided = DECIDED.has(entry.approvalStatus);
    const countedChanged = counted != null && counted.paidMinutes !== entry.paidMinutes;
    const note = `Hours for the day set by the office${change.reason ? ` (${change.reason})` : ''}${
      countedChanged ? `; counted ${fmt(entry.paidMinutes)} → ${fmt(counted!.paidMinutes)}` : ''
    }.`;
    const facts = judgedByLabelRules(entry) ? readLabelFacts(entry.labelFacts) : null;

    await this.prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        expectedClockInAt: next.expectedClockInAt,
        expectedClockOutAt: next.expectedClockOutAt,
        endIsDailyLimit: next.endIsDailyLimit,
        flagReasons: next.flagReasons,
        ...(counted ?? {}),
        ...(next.reminder ?? {}),
        ...(facts && next.endMoved
          ? { labelFacts: withExpectedEnd(facts, next.expectedClockOutAt) as unknown as Prisma.InputJsonValue }
          : {}),
        ...(decided
          ? { approvalNotes: entry.approvalNotes ? `${entry.approvalNotes}\n${note}` : note }
          : { approvalStatus: approvalFor(next.flagReasons) }),
      },
    });

    const changes = [
      ...(next.startMoved
        ? [{ field: 'expectedClockInAt', from: iso(entry.expectedClockInAt), to: iso(next.expectedClockInAt) }]
        : []),
      ...(next.endMoved
        ? [{ field: 'expectedClockOutAt', from: iso(entry.expectedClockOutAt), to: iso(next.expectedClockOutAt) }]
        : []),
      ...(countedChanged
        ? [{ field: 'countedMinutes', from: String(entry.paidMinutes ?? ''), to: String(counted!.paidMinutes ?? '') }]
        : []),
    ];
    try {
      await this.prisma.activityLog.create({
        data: {
          eventType: 'TIME_ENTRY_EDITED',
          userId: change.actorId,
          resourceType: 'timeEntry',
          resourceId: entry.id,
          organizationId: entry.organizationId,
          metadata: { reason: note, timeOffId: change.request.id, changes },
        },
      });
    } catch (err) {
      this.logger.warn(`Day-hours history write failed for entry=${entry.id}: ${err}`);
    }
    return true;
  }

  /** The shift's approved overtime rounds, in minutes (shared `COUNTED_ROUND_STATUSES`) — each moved the end once. */
  private async agreedRoundMinutes(entryId: string): Promise<number> {
    const sum = await this.prisma.overtimeRequest.aggregate({
      where: { timeEntryId: entryId, status: { in: [...COUNTED_ROUND_STATUSES] } },
      _sum: { maxDurationMinutes: true },
    });
    return sum._sum.maxDurationMinutes ?? 0;
  }
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function fmt(minutes?: number | null): string {
  if (minutes == null) return '—';
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}
