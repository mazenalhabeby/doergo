import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, paginated, ApprovalStatus } from '@hbcfield/shared';

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get entries pending approval
   */
  async getPendingApprovals(data: {
    organizationId: string;
    page?: number;
    limit?: number;
  }) {
    const page = data.page ?? 1;
    const limit = data.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      organizationId: data.organizationId,
      approvalStatus: ApprovalStatus.PENDING,
      status: { not: 'CLOCKED_IN' as any }, // Only completed entries
    };

    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          location: {
            select: { id: true, name: true, timezone: true },
          },
          breaks: true,
        },
        orderBy: { clockInAt: 'desc' },
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return paginated(entries, { page, limit, total });
  }

  /**
   * Approve a time entry
   */
  async approveEntry(data: {
    entryId: string;
    approverId: string;
    organizationId: string;
    notes?: string;
  }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        organizationId: data.organizationId,
      },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    if (entry.approvalStatus !== 'PENDING') {
      throw new BadRequestException(
        `Entry is already ${entry.approvalStatus.toLowerCase()}`,
      );
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id: data.entryId },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        approvedById: data.approverId,
        approvedAt: new Date(),
        approvalNotes: data.notes,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
        location: {
          select: { name: true, timezone: true },
        },
      },
    });

    this.logger.log(
      `Entry approved: entry=${data.entryId}, approver=${data.approverId}`,
    );

    return success(updated, 'Time entry approved');
  }

  /**
   * Reject a time entry
   */
  async rejectEntry(data: {
    entryId: string;
    approverId: string;
    organizationId: string;
    reason: string;
  }) {
    if (!data.reason?.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        organizationId: data.organizationId,
      },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    if (entry.approvalStatus !== 'PENDING') {
      throw new BadRequestException(
        `Entry is already ${entry.approvalStatus.toLowerCase()}`,
      );
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id: data.entryId },
      data: {
        approvalStatus: ApprovalStatus.REJECTED,
        approvedById: data.approverId,
        approvedAt: new Date(),
        approvalNotes: data.reason,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    this.logger.log(
      `Entry rejected: entry=${data.entryId}, approver=${data.approverId}, reason=${data.reason}`,
    );

    return success(updated, 'Time entry rejected');
  }

  /**
   * Edit a time entry (manager correction)
   */
  async editEntry(data: {
    entryId: string;
    editorId: string;
    organizationId: string;
    clockInAt?: string;
    clockOutAt?: string;
    notes?: string;
    reason: string;
  }) {
    if (!data.reason?.trim()) {
      throw new BadRequestException('Edit reason is required');
    }

    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id: data.entryId,
        organizationId: data.organizationId,
      },
    });

    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }

    const updateData: any = {
      isEdited: true,
      editedById: data.editorId,
      editedAt: new Date(),
      editReason: data.reason,
    };

    // Save original values on first edit
    if (!entry.isEdited) {
      updateData.originalClockIn = entry.clockInAt;
      updateData.originalClockOut = entry.clockOutAt;
    }

    if (data.clockInAt) {
      updateData.clockInAt = new Date(data.clockInAt);
    }

    if (data.clockOutAt) {
      updateData.clockOutAt = new Date(data.clockOutAt);
    }

    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    // Recalculate total minutes if times changed
    const newClockIn = updateData.clockInAt || entry.clockInAt;
    const newClockOut = updateData.clockOutAt || entry.clockOutAt;

    if (newClockOut) {
      updateData.totalMinutes = Math.round(
        (new Date(newClockOut).getTime() - new Date(newClockIn).getTime()) /
          (1000 * 60),
      );
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id: data.entryId },
      data: updateData,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
        location: {
          select: { name: true, timezone: true },
        },
        editedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    this.logger.log(
      `Entry edited: entry=${data.entryId}, editor=${data.editorId}, reason=${data.reason}`,
    );

    return success(updated, 'Time entry updated');
  }

  /** Admin: delete a time entry (its breaks cascade), scoped to the org. */
  async deleteEntry(data: { entryId: string; editorId: string; organizationId: string }) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: data.entryId, organizationId: data.organizationId },
      select: { id: true },
    });
    if (!entry) {
      throw new NotFoundException('Time entry not found');
    }
    // Break has onDelete: Cascade, so removing the entry removes its breaks.
    await this.prisma.timeEntry.delete({ where: { id: data.entryId } });
    this.logger.log(`Entry deleted: entry=${data.entryId}, editor=${data.editorId}`);
    return success({ id: data.entryId }, 'Time entry removed');
  }

  /**
   * Admin: manually add (back-date) attendance for an employee.
   * Generates one CLOCKED_OUT entry per selected working day in [startDate, endDate],
   * auto-approved and geofence-exempt (no GPS needed for historical data).
   * Skips days that already have an entry for that employee (safe to re-run).
   */
  async addManualEntries(data: {
    editorId: string;
    organizationId: string;
    userId: string;
    locationId: string;
    startDate: string; // "YYYY-MM-DD"
    endDate: string; // "YYYY-MM-DD" (inclusive)
    weekdays?: number[]; // 0=Sun..6=Sat; ignored for a single-day add
    startTime: string; // "HH:MM"
    endTime: string; // "HH:MM"
    breakMinutes?: number;
    notes?: string;
    reason?: string;
  }) {
    const [user, loc] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: data.userId, organizationId: data.organizationId },
        select: { id: true },
      }),
      this.prisma.companyLocation.findFirst({
        where: { id: data.locationId, organizationId: data.organizationId },
        select: { id: true, lat: true, lng: true, timezone: true },
      }),
    ]);
    if (!user) throw new NotFoundException('Employee not found in your organization');
    if (!loc) throw new NotFoundException('Work site not found');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(data.endDate)) {
      throw new BadRequestException('Invalid date range');
    }
    if (!/^\d{2}:\d{2}$/.test(data.startTime) || !/^\d{2}:\d{2}$/.test(data.endTime)) {
      throw new BadRequestException('Invalid time');
    }
    if (data.endDate < data.startDate) throw new BadRequestException('End date is before the start date');

    const tz = loc.timezone || 'Europe/Berlin';
    const single = data.startDate === data.endDate;
    const weekdays = single ? null : data.weekdays?.length ? data.weekdays : [1, 2, 3, 4, 5];
    const breakMin = Math.max(0, Math.round(data.breakMinutes ?? 0));
    const reason = data.reason?.trim() || 'Manually added by admin';

    // Cap the span so an accidental multi-year range can't mass-insert. One
    // backfill covers at most a year (weekday filtering trims it further).
    const cur = new Date(`${data.startDate}T12:00:00Z`);
    const endD = new Date(`${data.endDate}T12:00:00Z`);
    const spanDays = Math.round((endD.getTime() - cur.getTime()) / 86_400_000) + 1;
    if (spanDays > 366) {
      throw new BadRequestException('Date range too large — back-fill at most one year at a time');
    }

    // Timezone formatters are expensive to construct, so build them ONCE per
    // request and reuse across every day (the real cost in a large backfill).
    const wallFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const ymdFmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const zonedWallTimeToUtc = (dateStr: string, timeStr: string): Date =>
      this.zonedWallTimeToUtc(dateStr, timeStr, wallFmt);
    const utcToZonedYmd = (date: Date): string => ymdFmt.format(date);

    // Target dates (weekday-filtered for a range; the single day is always included)
    const dates: string[] = [];
    while (cur <= endD) {
      if (single || (weekdays && weekdays.includes(cur.getUTCDay()))) {
        dates.push(cur.toISOString().slice(0, 10));
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    if (!dates.length) throw new BadRequestException('No matching days in the selected range');

    // Skip days the employee already has an entry for (dedupe / safe re-run)
    const existing = await this.prisma.timeEntry.findMany({
      where: {
        userId: data.userId,
        clockInAt: {
          gte: zonedWallTimeToUtc(data.startDate, '00:00'),
          lte: zonedWallTimeToUtc(data.endDate, '23:59'),
        },
      },
      select: { clockInAt: true },
    });
    const taken = new Set(existing.map((e) => utcToZonedYmd(e.clockInAt)));

    const now = new Date();
    const toCreate: any[] = [];
    let skipped = 0;
    for (const ymd of dates) {
      if (taken.has(ymd)) {
        skipped++;
        continue;
      }
      const clockIn = zonedWallTimeToUtc(ymd, data.startTime);
      let clockOut = zonedWallTimeToUtc(ymd, data.endTime);
      if (clockOut <= clockIn) clockOut = new Date(clockOut.getTime() + 24 * 3600_000); // overnight
      const totalMinutes = Math.max(
        0,
        Math.round((clockOut.getTime() - clockIn.getTime()) / 60000) - breakMin,
      );
      toCreate.push({
        userId: data.userId,
        organizationId: data.organizationId,
        locationId: data.locationId,
        status: 'CLOCKED_OUT',
        clockInAt: clockIn,
        clockInLat: loc.lat ?? 0,
        clockInLng: loc.lng ?? 0,
        clockInWithinGeofence: true,
        clockOutAt: clockOut,
        clockOutLat: loc.lat ?? 0,
        clockOutLng: loc.lng ?? 0,
        clockOutWithinGeofence: true,
        isRemote: false,
        totalMinutes,
        breakMinutes: breakMin,
        notes: data.notes?.trim() || null,
        flagReasons: [],
        approvalStatus: 'APPROVED',
        approvedById: data.editorId,
        approvedAt: now,
        approvalNotes: 'Added by admin',
        isEdited: true,
        editedById: data.editorId,
        editedAt: now,
        editReason: reason,
      });
    }

    if (toCreate.length) await this.prisma.timeEntry.createMany({ data: toCreate });

    this.logger.log(
      `Manual attendance added: user=${data.userId}, editor=${data.editorId}, created=${toCreate.length}, skipped=${skipped}`,
    );
    return success(
      { created: toCreate.length, skipped },
      `Added ${toCreate.length} ${toCreate.length === 1 ? 'entry' : 'entries'}` +
        (skipped ? ` (skipped ${skipped} — already recorded)` : ''),
    );
  }

  /**
   * Wall-clock date+time in a timezone → the correct UTC Date.
   * Takes a prebuilt formatter so callers can reuse one across many days
   * (constructing an Intl.DateTimeFormat per call is the expensive part).
   */
  private zonedWallTimeToUtc(
    dateStr: string,
    timeStr: string,
    wallFmt: Intl.DateTimeFormat,
  ): Date {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const [h, mi] = timeStr.split(':').map(Number);
    const utcGuess = Date.UTC(y, mo - 1, d, h, mi);
    const parts = wallFmt.formatToParts(new Date(utcGuess));
    const m: Record<string, string> = {};
    parts.forEach((p) => (m[p.type] = p.value));
    const hour = m.hour === '24' ? 0 : Number(m.hour);
    const asShown = Date.UTC(Number(m.year), Number(m.month) - 1, Number(m.day), hour, Number(m.minute));
    return new Date(utcGuess - (asShown - utcGuess));
  }

  /**
   * Bulk approve entries
   */
  async bulkApprove(data: {
    entryIds: string[];
    approverId: string;
    organizationId: string;
    notes?: string;
  }) {
    const results = {
      approved: [] as string[],
      failed: [] as { id: string; reason: string }[],
    };

    for (const entryId of data.entryIds) {
      try {
        await this.approveEntry({
          entryId,
          approverId: data.approverId,
          organizationId: data.organizationId,
          notes: data.notes,
        });
        results.approved.push(entryId);
      } catch (error: any) {
        results.failed.push({ id: entryId, reason: error.message });
      }
    }

    return success(results, `Approved ${results.approved.length} entries`);
  }
}
