import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  PRESENCE,
  SERVICE_NAMES,
  TERMINAL_STATUSES,
  decidePresence,
  endOfDayIn,
  isWorkPresence,
  replayPresence,
  startOfDayIn,
  type PresenceChange,
  type PresenceJob,
  type PresencePoint,
  type PresenceState,
} from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';

/** The columns of an open entry this service reads. */
export interface PresenceEntry {
  id: string;
  userId: string;
  organizationId: string;
  timezone?: string | null;
  presence?: string | null;
  presenceAt?: Date | null;
  lastSeenAt?: Date | null;
  location?: { timezone?: string | null } | null;
}

/**
 * Keeps an open entry's "where are they working now" in step with the evidence.
 *
 * ⚠️ NEVER IN THE WAY. The group is display only, so every failure here is
 * logged and swallowed: a heartbeat, a clock-in or a job moving on must never
 * fail because the dashboard's label could not be worked out.
 *
 * ⚠️ WRITES ONLY ON A CHANGE. A steady day is its clock-in, a few changes, and
 * a "last seen" refreshed at most every ten minutes — not a write per heartbeat.
 * Every write is claimed against the state it was decided from, so two
 * heartbeats racing cannot both record the same change.
 *
 * ⚠️ NO COORDINATES LEAVE THIS SERVICE. Movement is measured from where the
 * last change happened, and that position lives on the history row — not on the
 * time entry, which many list reads return whole. Every read of the history
 * here selects its columns, and `history()` never selects the position.
 */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * The group at clock-in, as columns for the entry being created — including
   * its first history row, so the clock-in stays one insert.
   */
  async atClockIn(input: {
    userId: string;
    organizationId: string;
    point: PresencePoint | null;
    insideArea: boolean;
    at: Date;
    timezone: string;
    recordedOffline: boolean;
  }): Promise<Record<string, unknown>> {
    try {
      const point = input.point ?? { lat: 0, lng: 0 };
      const jobs = input.insideArea ? [] : await this.openJobs(input.userId, input.organizationId, input.at, input.timezone);
      const d = decidePresence({ point, insideArea: input.insideArea, jobs, state: { presence: null, anchor: null } });
      return {
        presence: d.presence,
        presenceReason: d.reason,
        presenceAt: input.at,
        presenceChanges: {
          create: [{
            organizationId: input.organizationId, at: input.at, presence: d.presence, reason: d.reason, sentLate: input.recordedOffline,
            ...(input.point ? { anchorLat: d.anchor.lat, anchorLng: d.anchor.lng } : {}),
          }],
        },
      };
    } catch (err) {
      this.logger.warn(`presence at clock-in skipped for user=${input.userId}: ${err}`);
      return {};
    }
  }

  /** One live position for an open entry. */
  async onPosition(entry: PresenceEntry, point: PresencePoint, insideArea: boolean, at: Date = new Date()): Promise<void> {
    try {
      // Inside the area neither jobs nor movement can change the answer, so neither is read.
      const [jobs, anchor] = insideArea
        ? [[], null]
        : await Promise.all([this.openJobs(entry.userId, entry.organizationId, at, tzOf(entry)), this.anchorOf(entry.id)]);
      const d = decidePresence({ point, insideArea, jobs, state: { presence: presenceOf(entry), anchor } });
      if (d.changed) {
        await this.record(entry, [{ at, presence: d.presence, reason: d.reason, anchor: d.anchor }], at, false);
        return;
      }
      if (!entry.lastSeenAt || at.getTime() - entry.lastSeenAt.getTime() >= PRESENCE.SEEN_WRITE_EVERY_MS) {
        await this.prisma.timeEntry.updateMany({ where: { id: entry.id }, data: { lastSeenAt: at } });
      }
    } catch (err) {
      this.logger.warn(`presence update skipped for entry=${entry.id}: ${err}`);
    }
  }

  /**
   * Positions a phone kept without signal, oldest first. One pass: today's jobs
   * are read once, each change written once, the entry once, one live update.
   */
  async onBatch(entry: PresenceEntry, points: readonly (PresencePoint & { at: Date; insideArea: boolean })[]): Promise<void> {
    if (points.length === 0) return;
    try {
      const newest = points[points.length - 1]!.at;
      const needsJobs = points.some((p) => !p.insideArea);
      const [jobs, anchor] = await Promise.all([
        needsJobs ? this.openJobs(entry.userId, entry.organizationId, newest, tzOf(entry)) : Promise.resolve([]),
        this.anchorOf(entry.id),
      ]);
      const run = replayPresence({ points, jobs, state: { presence: presenceOf(entry), anchor } });
      if (run.changes.length === 0) {
        await this.prisma.timeEntry.updateMany({ where: { id: entry.id }, data: { lastSeenAt: newest } });
        return;
      }
      await this.record(entry, run.changes, newest, true);
    } catch (err) {
      this.logger.warn(`presence batch skipped for entry=${entry.id}: ${err}`);
    }
  }

  /**
   * A job went on its way, or arrived: the member is in the field now, without
   * waiting for the next heartbeat. Only for the assignee's own open entry.
   */
  async onJobMoved(input: { userId: string; organizationId: string; reason: 'ON_THE_WAY' | 'AT_JOB'; at: Date }): Promise<void> {
    try {
      const entry = await this.prisma.timeEntry.findFirst({
        where: { userId: input.userId, organizationId: input.organizationId, status: 'CLOCKED_IN' },
        select: { id: true, userId: true, organizationId: true, presence: true, presenceAt: true, lastSeenAt: true },
      });
      if (!entry || entry.presence === 'FIELD') return;
      // No position with a tap: movement stays measured from the last place that counted.
      await this.record(entry, [{ at: input.at, presence: 'FIELD', reason: input.reason, anchor: await this.anchorOf(entry.id) }], null, false);
    } catch (err) {
      this.logger.warn(`presence on job move skipped for user=${input.userId}: ${err}`);
    }
  }

  /** The day's changes for one entry — group, reason and time only. */
  history(timeEntryId: string, organizationId: string) {
    return this.prisma.timeEntryPresence.findMany({
      where: { timeEntryId, organizationId },
      orderBy: { at: 'asc' },
      take: 200,
      select: { at: true, presence: true, reason: true, sentLate: true },
    });
  }

  /**
   * Write changes, claimed against the state they were decided from. A lost
   * claim means another heartbeat got there first with the same evidence.
   */
  private async record(entry: PresenceEntry, changes: PresenceChange[], seenAt: Date | null, sentLate: boolean) {
    const last = changes[changes.length - 1]!;
    const claimed = await this.prisma.$transaction(async (tx) => {
      const res = await tx.timeEntry.updateMany({
        where: { id: entry.id, status: 'CLOCKED_IN', presenceAt: entry.presenceAt ?? null },
        data: {
          presence: last.presence,
          presenceReason: last.reason,
          presenceAt: last.at,
          ...(seenAt ? { lastSeenAt: seenAt } : {}),
        },
      });
      if (res.count === 0) return false;
      await tx.timeEntryPresence.createMany({
        data: changes.map((c) => ({
          timeEntryId: entry.id, organizationId: entry.organizationId, at: c.at, presence: c.presence, reason: c.reason, sentLate,
          anchorLat: c.anchor?.lat ?? null, anchorLng: c.anchor?.lng ?? null,
        })),
      });
      return true;
    });
    if (!claimed) return;
    // An invalidation, not a payload: each screen refetches through its own scoped read.
    this.notificationClient.emit('attendance_changed', { organizationId: entry.organizationId, action: 'presence', entryId: entry.id });
  }

  /** Where the newest change with a position happened. One indexed read, (timeEntryId, at). */
  private async anchorOf(timeEntryId: string): Promise<PresencePoint | null> {
    const row = await this.prisma.timeEntryPresence.findFirst({
      where: { timeEntryId, anchorLat: { not: null }, anchorLng: { not: null } },
      orderBy: { at: 'desc' },
      select: { anchorLat: true, anchorLng: true },
    });
    return row?.anchorLat != null && row.anchorLng != null ? { lat: row.anchorLat, lng: row.anchorLng } : null;
  }

  /**
   * The member's open jobs that can say "field": on their way, or at an address
   * and due today. One indexed read, capped, only when the member is outside
   * their area — inside it, jobs cannot change the answer.
   */
  private async openJobs(userId: string, organizationId: string, at: Date, timezone: string): Promise<PresenceJob[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId,
        OR: [{ assignedToId: userId }, { assignees: { some: { userId } } }],
        status: { notIn: TERMINAL_STATUSES as string[] },
        AND: [
          {
            OR: [
              { status: 'EN_ROUTE' },
              { locationLat: { not: null }, locationLng: { not: null }, dueDate: { gte: startOfDayIn(at, timezone), lt: endOfDayIn(at, timezone) } },
            ],
          },
        ],
      },
      select: { status: true, locationLat: true, locationLng: true },
      take: 25,
    });
    return tasks.map((t) => ({ lat: t.locationLat, lng: t.locationLng, onTheWay: t.status === 'EN_ROUTE' }));
  }
}

function presenceOf(entry: PresenceEntry): PresenceState['presence'] {
  return isWorkPresence(entry.presence) ? entry.presence : null;
}

function tzOf(entry: PresenceEntry): string {
  return entry.timezone || entry.location?.timezone || 'UTC';
}
