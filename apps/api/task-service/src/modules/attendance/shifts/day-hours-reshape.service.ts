import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  PrismaService,
  SERVICE_NAMES,
  judgedByLabelRules,
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
import { reshapeForDayHours } from './day-hours-reshape';

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
    const today = entries.filter(
      (e) => localPartsIn(e.clockInAt, zoneOf(e.location?.timezone, e.timezone)).dateStr === change.date,
    );
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
    const next = reshapeForDayHours(
      { ...entry, flagReasons: entry.flagReasons as string[] },
      { start: effect.expectedClockInAt, end: effect.expectedClockOutAt },
      toleranceMin,
      new Date(),
    );
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
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function fmt(minutes?: number | null): string {
  if (minutes == null) return '—';
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}
