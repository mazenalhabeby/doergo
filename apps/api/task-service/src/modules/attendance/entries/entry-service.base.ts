import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { JobPauseService } from '../../tasks/handover/job-pause.service';
import { PrismaService } from '@hbcfield/shared';
import { SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN, SERVICE_NAMES } from '@hbcfield/shared';
import { NoShowSettleService } from '../no-shows/no-show-settle.service';
import { CountedTimeService } from '../core/counted-time.service';
import { ShiftRematchService } from '../shifts/shift-rematch.service';
import { emitEvent, attendanceChangedEvent } from '@hbcfield/shared/microservices';

/**
 * What the time-entry services share: announcing a change, the audit row, and what
 * a shift was expected to be.
 */
@Injectable()
export abstract class EntryServiceBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    // An admin editing hours moves the paid figure like any other close path.
    protected readonly countedTime: CountedTimeService,
    @Inject(SERVICE_NAMES.NOTIFICATION) protected readonly notificationClient: ClientProxy,
    // An edited entry that still holds no shift gets another look at the rota.
    @Optional() protected readonly rematch?: ShiftRematchService,
    // A manager closing an open shift ends it like any clock-out: jobs left in work pause.
    @Optional() protected readonly jobPause?: JobPauseService,
    // Hours added for a day somebody was marked missing close that no-show ("They were here").
    @Optional() protected readonly noShowSettle?: NoShowSettleService,
  ) {}

  /**
   * Broadcast that an admin mutated attendance (edit/approve/reject/delete/manual
   * add) so every open attendance view refreshes in real time — same idea as the
   * clock-in/out events, but for manager-side changes which had no signal before.
   */
  protected emitChanged(organizationId: string, action: string, entryId?: string) {
    try {
      emitEvent(this.notificationClient, attendanceChangedEvent, { organizationId, action, entryId });
    } catch (err) {
      this.logger.warn(`attendance_changed emit failed (${action}): ${err}`);
    }
  }

  /** Duration of a shift window in minutes from its "HH:MM" start/end strings. */
  protected shiftDurationMinutes(startTime: string, endTime: string, crossesMidnight: boolean): number {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let dur = eh * 60 + em - (sh * 60 + sm);
    if (crossesMidnight || dur <= 0) dur += 24 * 60; // overnight window
    return dur;
  }

  /**
   * The expected start and the tolerance an edit re-reads the flags against.
   *
   * ⚠️ The start is the PERSISTED `expectedClockInAt` — stamped at clock-in by
   * the shift resolver for a rota shift AND for the legacy weekly schedule. This
   * used to be derived from the bound shift's length, which needs a `shiftId`,
   * so every legacy-schedule entry lost its LATE_ARRIVAL on its first edit. The
   * derivation survives only for rows older than the persisted column.
   *
   * One shift read at most: the tolerance rides on the same row.
   */
  protected async expectationFor(entry: {
    shiftId: string | null;
    expectedClockInAt: Date | null;
    expectedClockOutAt: Date | null;
  }): Promise<{ expectedStart: Date | null; toleranceMin: number }> {
    if (entry.expectedClockInAt || !entry.shiftId || !entry.expectedClockOutAt) {
      return {
        expectedStart: entry.expectedClockInAt ?? null,
        toleranceMin: await this.countedTime.toleranceFor(entry.shiftId),
      };
    }
    const shift = await this.prisma.shift.findUnique({
      where: { id: entry.shiftId },
      select: { startLocal: true, endLocal: true, crossesMidnight: true, flagToleranceMin: true },
    });
    if (!shift) return { expectedStart: null, toleranceMin: SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN };
    const dur = this.shiftDurationMinutes(shift.startLocal, shift.endLocal, shift.crossesMidnight);
    return {
      expectedStart: new Date(entry.expectedClockOutAt.getTime() - dur * 60_000),
      toleranceMin: shift.flagToleranceMin ?? SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
    };
  }

  /**
   * One row in the shared activity log per office change to an entry — the
   * indexed per-entity audit trail ([resourceId, createdAt]); no dedicated
   * table. Edits feed the entry's edit-history table; a deletion leaves the only
   * trace there is once the row is gone. Never fails the change it records.
   */
  protected async auditEntry(params: {
    eventType: 'TIME_ENTRY_EDITED' | 'TIME_ENTRY_DELETED';
    entryId: string;
    actorId: string;
    organizationId: string;
    targetUserId?: string;
    metadata: Record<string, unknown>;
  }) {
    try {
      await this.prisma.activityLog.create({
        data: {
          eventType: params.eventType,
          userId: params.actorId,
          ...(params.targetUserId ? { targetUserId: params.targetUserId } : {}),
          resourceType: 'timeEntry',
          resourceId: params.entryId,
          organizationId: params.organizationId,
          metadata: params.metadata as never,
        },
      });
    } catch (e) {
      this.logger.warn(`Audit-log write failed (${params.eventType}) for entry=${params.entryId}: ${e}`);
    }
  }
}
