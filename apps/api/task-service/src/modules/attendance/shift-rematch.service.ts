import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { zoneOf, SERVICE_NAMES, computeScheduleFlags } from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { ShiftResolverService } from './shift-resolver.service';
import { CountedTimeService } from './counted-time.service';
import { BreakRulesService } from './break-rules.service';
import { approvalFor } from './attendance-occurrence';
import { rematchLabels } from './rematch-labels';
import { emitEvent, attendanceChangedEvent } from '@hbcfield/shared/microservices';
import type { Prisma } from '@prisma/client';

/** Which entries a rota change can reach. Always built on the SERVER from the row just written. */
export interface RematchScope {
  organizationId: string;
  userId: string;
  /** The workspace of the rota row; null = every workspace (a personal weekly schedule). */
  spaceId?: string | null;
  /** Earliest clock-in the change can cover. Clamped to LOOKBACK_DAYS. */
  from?: Date | null;
  /** Who changed the rota — written into the entry's edit history. */
  actorId?: string | null;
}

/** How far back a rota change may reach. Older entries belong to closed payroll. */
const LOOKBACK_DAYS = 90;
/** Edits arriving within this window (filling a month day by day) run as one pass. */
const DEBOUNCE_MS = 1500;
/** A rota change touching more than this many unscheduled entries is not a normal edit. */
const MAX_ENTRIES = 500;

/** The flags that only mean something against a shift — recomputed, never carried over. */
const SCHEDULE_FLAGS = new Set(['UNSCHEDULED_DAY', 'LATE_ARRIVAL', 'EARLY_DEPARTURE', 'OVERTIME', 'PAST_DAILY_LIMIT']);
const DECIDED = new Set(['APPROVED', 'REJECTED']);
const DAY_MS = 86_400_000;

/**
 * An entry clocked in with no shift, and the shift was added afterwards.
 *
 * The clock-in matches a shift ONCE and stamps it on the entry. Before this,
 * adding the rota a day late left the entry "Unscheduled" for good — counted
 * from the minute they arrived rather than from the shift start, and with no
 * late or overtime check at all, because there was nothing to check against.
 *
 * ⚠️ ONLY entries that matched NO shift are re-matched. An entry that already
 * holds a shift keeps it: approving overtime MOVES `expectedClockOutAt`, and
 * re-resolving that entry from the rota would quietly undo the approval.
 *
 * ⚠️ The same resolver as the clock-in, so the two cannot disagree. The real
 * clock-in and clock-out are evidence and are never touched.
 *
 * ⚠️ An approved or rejected entry stays decided unless its counted time
 * changes; if it does, it goes back to Pending with a note, because a figure a
 * person signed off must never change underneath them.
 */
/** What the re-match reads of an unscheduled entry. */
const REMATCH_ENTRY_INCLUDE = {
  location: { select: { id: true, timezone: true, workModel: true, lat: true, lng: true } },
  shift: { select: { name: true } },
} as const;
type RematchEntry = Prisma.TimeEntryGetPayload<{ include: typeof REMATCH_ENTRY_INCLUDE }>;

@Injectable()
export class ShiftRematchService implements OnModuleDestroy {
  private readonly logger = new Logger(ShiftRematchService.name);
  private readonly pending = new Map<string, { scope: RematchScope; timer: NodeJS.Timeout }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftResolver: ShiftResolverService,
    private readonly countedTime: CountedTimeService,
    private readonly breakRules: BreakRulesService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  onModuleDestroy() {
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
  }

  /**
   * Fire and forget, after the rota write has committed. The save that caused it
   * returns at once; a burst of edits for one person collapses into one pass.
   * Safe to run twice: an entry that already holds a shift is never touched again.
   */
  schedule(scope: RematchScope): void {
    const key = `${scope.organizationId}:${scope.userId}:${scope.spaceId ?? '*'}`;
    const prev = this.pending.get(key);
    if (prev) clearTimeout(prev.timer);
    const merged: RematchScope = prev
      ? {
          ...scope,
          from: earliest(prev.scope.from, scope.from),
          actorId: scope.actorId ?? prev.scope.actorId,
        }
      : scope;
    const timer = setTimeout(() => {
      this.pending.delete(key);
      this.rematch(merged).catch((err) => this.logger.error(`Shift re-match failed for ${key}: ${err}`));
    }, DEBOUNCE_MS);
    timer.unref?.();
    this.pending.set(key, { scope: merged, timer });
  }

  /** Re-match one person's unscheduled entries in the scope. Returns how many now hold a shift. */
  async rematch(scope: RematchScope): Promise<number> {
    const now = Date.now();
    const floor = new Date(now - LOOKBACK_DAYS * DAY_MS);
    // One day of slack: a night shift on the 30th is clocked in on the 30th but
    // its rota row may be dated from the 1st of the next day's week.
    const from = scope.from ? new Date(Math.max(scope.from.getTime() - DAY_MS, floor.getTime())) : floor;

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        organizationId: scope.organizationId,
        userId: scope.userId,
        ...(scope.spaceId ? { locationId: scope.spaceId } : {}),
        shiftId: null,
        flagReasons: { has: 'UNSCHEDULED_DAY' },
        clockInAt: { gte: from, lte: new Date(now) },
      },
      orderBy: { clockInAt: 'asc' },
      take: MAX_ENTRIES,
      include: REMATCH_ENTRY_INCLUDE,
    });
    if (entries.length === 0) return 0;

    let matched = 0;
    for (const entry of entries) {
      try {
        if (await this.rematchOne(entry, scope.actorId ?? null)) matched += 1;
      } catch (err) {
        this.logger.warn(`Re-match skipped entry=${entry.id}: ${err}`);
      }
    }

    if (matched > 0) {
      this.logger.log(
        `Re-matched ${matched}/${entries.length} unscheduled entries for user=${scope.userId} org=${scope.organizationId}`,
      );
      try {
        emitEvent(this.notificationClient, attendanceChangedEvent, {
          organizationId: scope.organizationId,
          action: 'rematch',
        });
      } catch (err) {
        this.logger.warn(`attendance_changed emit failed after re-match: ${err}`);
      }
    }
    return matched;
  }

  private async rematchOne(entry: RematchEntry, actorId: string | null): Promise<boolean> {
    if (!entry.location) return false;
    const resolved = await this.shiftResolver.resolveForClockIn({
      userId: entry.userId,
      space: entry.location,
      clockInAt: entry.clockInAt,
      clockInTz: entry.timezone ?? undefined,
      firstMatch: entry.labelRules == null,
    });
    if (!resolved) return false;

    const toleranceMin = resolved.flagToleranceMin;
    // Label rules (new entries): agreed hours, first arrival only, the rest. Old entries: as before.
    const labeled = await rematchLabels(this.prisma, entry, resolved);
    if (labeled) Object.assign(resolved, { expectedClockInAt: labeled.expectedClockInAt, expectedClockOutAt: labeled.expectedClockOutAt });
    const flags = [
      ...new Set([
        ...(entry.flagReasons as string[]).filter((f) => !SCHEDULE_FLAGS.has(f) && !(labeled && f === 'LATE_FROM_REST')),
        ...(labeled?.flags ??
          computeScheduleFlags({
            clockInAt: entry.clockInAt,
            clockOutAt: entry.clockOutAt,
            expectedClockInAt: resolved.expectedClockInAt,
            expectedClockOutAt: resolved.expectedClockOutAt,
            toleranceMin,
          })),
      ]),
    ];

    const stamped = {
      ...entry,
      shiftId: resolved.shiftId,
      expectedClockInAt: resolved.expectedClockInAt,
      expectedClockOutAt: resolved.expectedClockOutAt,
    };
    const counted = entry.clockOutAt
      ? await this.countedTime.columnsFor(stamped, entry.clockOutAt, toleranceMin)
      : null;

    // Still open: the reminders and the rests follow the shift from now on.
    const open = entry.status === 'CLOCKED_IN';
    const restPlan =
      open && !(Array.isArray(entry.breakPlan) && entry.breakPlan.length > 0)
        ? await this.breakRules.planForClockIn({
            spaceId: entry.locationId,
            shiftId: resolved.shiftId,
            clockInAt: entry.clockInAt,
            expectedStartAt: resolved.expectedClockInAt,
            expectedEndAt: resolved.expectedClockOutAt,
            timezone: zoneOf(entry.timezone, entry.location.timezone),
          })
        : null;

    const countedChanged = counted != null && counted.paidMinutes !== entry.paidMinutes;
    const decided = DECIDED.has(entry.approvalStatus);
    let approval: Record<string, unknown>;
    if (decided && !countedChanged) {
      approval = {};
    } else if (decided) {
      approval = {
        approvalStatus: 'PENDING',
        approvedById: null,
        approvedAt: null,
        approvalNotes: appendNote(
          entry.approvalNotes,
          `Matched to its shift after the rota changed; counted time ${fmt(entry.paidMinutes)} → ` +
            `${fmt(counted!.paidMinutes)}. Was ${entry.approvalStatus.toLowerCase()}, needs a new decision.`,
        ),
      };
    } else {
      approval = { approvalStatus: approvalFor(flags) };
    }

    // Conditional: two passes racing (two replicas, a retry) cannot both write.
    const claimed = await this.prisma.timeEntry.updateMany({
      where: { id: entry.id, shiftId: null, flagReasons: { has: 'UNSCHEDULED_DAY' } },
      data: {
        shiftId: resolved.shiftId,
        expectedClockInAt: resolved.expectedClockInAt,
        expectedClockOutAt: resolved.expectedClockOutAt,
        endIsDailyLimit: false,
        flagReasons: flags,
        ...(labeled ? { labelFacts: labeled.labelFacts } : {}),
        ...(counted ?? {}),
        ...(open ? { nextRemindAt: resolved.nextRemindAt } : {}),
        ...(restPlan
          ? {
              breakPlan: restPlan.breakPlan as unknown as Prisma.InputJsonValue,
              nextBreakRemindAt: restPlan.nextBreakRemindAt,
            }
          : {}),
        ...approval,
      },
    });
    if (claimed.count === 0) return false;

    // The entry's edit history — the same rows the "Edit history" table reads.
    const shiftName = resolved.shiftId
      ? ((await this.prisma.shift.findUnique({ where: { id: resolved.shiftId }, select: { name: true } }))?.name ??
        'Shift')
      : 'Weekly schedule';
    const changes = [
      { field: 'shift', from: null, to: shiftName },
      ...(counted && countedChanged
        ? [{ field: 'countedMinutes', from: String(entry.paidMinutes ?? ''), to: String(counted.paidMinutes ?? '') }]
        : []),
      ...(approval.approvalStatus && approval.approvalStatus !== entry.approvalStatus
        ? [{ field: 'approvalStatus', from: entry.approvalStatus, to: String(approval.approvalStatus) }]
        : []),
    ];
    try {
      await this.prisma.activityLog.create({
        data: {
          eventType: 'TIME_ENTRY_EDITED',
          userId: actorId,
          resourceType: 'timeEntry',
          resourceId: entry.id,
          organizationId: entry.organizationId,
          metadata: { reason: 'Matched to its shift after the rota changed', changes },
        },
      });
    } catch (err) {
      this.logger.warn(`Re-match history write failed for entry=${entry.id}: ${err}`);
    }
    return true;
  }
}

function earliest(a?: Date | null, b?: Date | null): Date | null {
  if (!a || !b) return null; // either side "no bound" → the widest window
  return a.getTime() <= b.getTime() ? a : b;
}

function fmt(minutes?: number | null): string {
  if (minutes == null) return '—';
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

function appendNote(existing: string | null | undefined, note: string): string {
  return existing ? `${existing}\n${note}` : note;
}
