import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AUTO_CLOCK_IN_FLAG,
  SERVICE_NAMES,
  SHIFT_REMINDER_DEFAULTS,
  TimeEntryStatus,
  autoClockUndoDeadline,
  readAutoClockSettings,
  success,
  type OccurrenceEvidence,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { judgeOccurrence } from '../../../common/occurrence.util';
import { AUTO_UNDO_EVENT, WORK_EVENTS } from './auto-clock-helpers';
import { AutoClockService } from './auto-clock.service';
import { emitEvent, attendanceChangedEvent } from '@hbcfield/shared/microservices';

/**
 * Taking an automatic step back: undoing a drive-past clock-in, and "still
 * working" instead of the automatic rest.
 */
@Injectable()
export class AutoClockUndoService {
  @Inject(AutoClockService) private readonly autoClock!: AutoClockService;

  private readonly logger = new Logger(AutoClockUndoService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * Take back an automatic clock-in — a drive-past, not an arrival.
   *
   * Own entry only (anybody else's is 404, like a missing one), still open, made
   * by the automatic clock, nothing recorded on it (no rest, no work-log, no job
   * moved or joined since), and within `autoClockUndoDeadline` of the clock-in,
   * judged at the moment of the TAP so an undo made offline counts when it was
   * made. The entry is REMOVED — it never happened — the way an office delete
   * removes one, and an audit row is the record that it existed. A replay of the
   * same undo finds that row and answers done.
   */
  async undo(data: { userId: string; organizationId: string; entryId: string; evidence?: OccurrenceEvidence }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: data.entryId, userId: data.userId, organizationId: data.organizationId },
      select: {
        id: true,
        userId: true,
        locationId: true,
        status: true,
        clockInAt: true,
        clockOutAt: true,
        flagReasons: true,
        shiftId: true,
        location: { select: { autoClock: true } },
        _count: { select: { breaks: true, workLog: true } },
      },
    });
    if (!entry) {
      if (await this.autoClock.wasUndone(data.entryId, data.userId))
        return success({ undone: true as const }, 'Already undone');
      throw new NotFoundException('Time entry not found');
    }
    const refuse = (why: string) =>
      new BadRequestException({
        message: `This clock-in can no longer be undone: ${why}`,
        code: 'AUTO_CLOCK_UNDO_NOT_ALLOWED',
        params: { why },
      });

    if (!(entry.flagReasons ?? []).includes(AUTO_CLOCK_IN_FLAG)) throw refuse('NOT_AUTOMATIC');
    if (entry.status !== TimeEntryStatus.CLOCKED_IN || entry.clockOutAt) throw refuse('CLOSED');
    if (entry._count.breaks > 0 || entry._count.workLog > 0) throw refuse('WORK_RECORDED');

    const at = judgeOccurrence(data.evidence, entry.clockInAt).at;
    const settings = readAutoClockSettings(entry.location?.autoClock);
    if (at.getTime() > autoClockUndoDeadline(entry.clockInAt, settings).getTime()) throw refuse('TOO_LATE');

    const worked = await this.prisma.taskEvent.findFirst({
      where: { userId: data.userId, createdAt: { gte: entry.clockInAt }, eventType: { in: [...WORK_EVENTS] as never } },
      select: { id: true },
    });
    if (worked) throw refuse('WORK_RECORDED');

    await this.prisma.$transaction(async (tx) => {
      // The expected shift it fulfilled is expected again — the person may still arrive.
      const instances = await tx.shiftInstance.findMany({
        where: { timeEntryId: entry.id },
        select: { id: true, expectedClockInAt: true },
      });
      for (const inst of instances) {
        const due = Math.max(
          Date.now(),
          inst.expectedClockInAt.getTime() + SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES * 60_000,
        );
        await tx.shiftInstance.update({
          where: { id: inst.id },
          data: { state: 'PENDING', timeEntryId: null, nextRemindAt: new Date(due) },
        });
      }
      // Rests, presence, excursions and work-log cascade with the entry.
      await tx.timeEntry.delete({ where: { id: entry.id } });
      await tx.activityLog.create({
        data: {
          eventType: AUTO_UNDO_EVENT,
          userId: data.userId,
          targetUserId: data.userId,
          resourceType: 'timeEntry',
          resourceId: entry.id,
          organizationId: data.organizationId,
          metadata: {
            undoneAt: at.toISOString(),
            entry: {
              locationId: entry.locationId,
              clockInAt: entry.clockInAt.toISOString(),
              flagReasons: entry.flagReasons ?? [],
            },
          } as never,
        },
      });
    });
    this.logger.log(`Automatic clock-in undone: entry=${entry.id}, user=${data.userId}`);
    emitEvent(this.notificationClient, attendanceChangedEvent, {
      organizationId: data.organizationId,
      action: 'auto-undo',
      entryId: entry.id,
      userId: entry.userId,
      spaceId: entry.locationId,
    });
    return success({ undone: true as const }, 'Clock-in undone');
  }

  // ── "Still working" on the automatic rest ───────────────────────────────

  /** No automatic rest on this shift. Own running entry; a replay (or a second tap) answers done. */
  async skipRest(data: { userId: string; organizationId: string; entryId: string; evidence?: OccurrenceEvidence }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: data.entryId, userId: data.userId, organizationId: data.organizationId },
      select: { id: true, status: true, clockInAt: true, autoRestSkippedAt: true },
    });
    if (!entry) throw new NotFoundException('Time entry not found');
    if (entry.autoRestSkippedAt) return success({ skipped: true as const }, 'Already skipped');
    if (entry.status !== TimeEntryStatus.CLOCKED_IN) {
      throw new ConflictException({ message: 'This shift is already closed', code: 'ENTRY_ALREADY_CLOSED' });
    }
    const at = judgeOccurrence(data.evidence, entry.clockInAt).at;
    // Conditional: a close racing this either sees the skip or has already run.
    await this.prisma.timeEntry.updateMany({
      where: { id: entry.id, status: TimeEntryStatus.CLOCKED_IN, autoRestSkippedAt: null },
      data: { autoRestSkippedAt: at },
    });
    return success({ skipped: true as const }, 'No automatic rest today');
  }
}
