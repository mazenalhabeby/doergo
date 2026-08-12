import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  success,
  buildDateRangeFilter,
  getStartOfWeek,
  getEndOfWeek,
  getStartOfMonth,
  getEndOfMonth,
} from '@hbcfield/shared';
import { format } from 'date-fns';

@Injectable()
export class AttendanceReportService {
  private readonly logger = new Logger(AttendanceReportService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Absolute row cap as a second backstop behind the span clamp.
  private static readonly MAX_EXPORT_ROWS = 100_000;

  /**
   * Clamp a caller-supplied range to a hard maximum span (P6). Without this,
   * `?startDate=2015-01-01` loads 15 years of time entries into memory and OOMs
   * the pod. Caps at 400 days (matching analytics.service). Returns validated
   * Date bounds for buildDateRangeFilter.
   */
  private clampRange(start: Date | string, end: Date | string): { startDate: Date; endDate: Date } {
    const endDate = end ? new Date(end) : new Date();
    let startDate = start ? new Date(start) : new Date(endDate.getTime() - 29 * 864e5);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    const maxSpan = 400 * 864e5;
    if (endDate.getTime() - startDate.getTime() > maxSpan) {
      startDate = new Date(endDate.getTime() - maxSpan);
    }
    return { startDate, endDate };
  }

  async getAttendanceSummary(data: {
    organizationId: string;
    userId?: string;
    startDate: Date | string;
    endDate: Date | string;
  }) {
    const { startDate, endDate } = this.clampRange(data.startDate, data.endDate);
    const dateFilter = buildDateRangeFilter(startDate, endDate);

    const where: any = {
      organizationId: data.organizationId,
      clockInAt: dateFilter,
    };

    if (data.userId) {
      where.userId = data.userId;
    }

    const entries = await this.prisma.timeEntry.findMany({
      where,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        location: {
          select: { id: true, name: true, timezone: true },
        },
      },
      orderBy: { clockInAt: 'asc' },
      take: AttendanceReportService.MAX_EXPORT_ROWS,
    });

    const totalMinutes = entries.reduce((sum, e) => sum + (e.totalMinutes || 0), 0);
    const totalShifts = entries.filter((e) => e.status !== 'CLOCKED_IN').length;
    const activeShifts = entries.filter((e) => e.status === 'CLOCKED_IN').length;
    const autoClockOuts = entries.filter((e) => e.status === 'AUTO_OUT').length;

    const workDays = this.countWorkDays(new Date(data.startDate), new Date(data.endDate));
    const standardHours = workDays * 8;
    const actualHours = totalMinutes / 60;
    const overtimeHours = Math.max(0, actualHours - standardHours);

    // Group by user
    const byUser: Record<string, any> = {};
    for (const entry of entries) {
      const userId = entry.user.id;
      if (!byUser[userId]) {
        byUser[userId] = {
          user: entry.user,
          totalMinutes: 0,
          shifts: 0,
          autoClockOuts: 0,
          locations: new Set<string>(),
        };
      }
      byUser[userId].totalMinutes += entry.totalMinutes || 0;
      if (entry.status !== 'CLOCKED_IN') byUser[userId].shifts++;
      if (entry.status === 'AUTO_OUT') byUser[userId].autoClockOuts++;
      byUser[userId].locations.add(entry.location.name);
    }

    const userSummaries = Object.values(byUser).map((u: any) => ({
      user: u.user,
      totalHours: Math.round((u.totalMinutes / 60) * 10) / 10,
      shifts: u.shifts,
      autoClockOuts: u.autoClockOuts,
      locations: Array.from(u.locations),
      averageShiftHours:
        u.shifts > 0 ? Math.round((u.totalMinutes / u.shifts / 60) * 10) / 10 : 0,
    }));

    // Group by location
    const byLocation: Record<string, any> = {};
    for (const entry of entries) {
      const locId = entry.location.id;
      if (!byLocation[locId]) {
        byLocation[locId] = {
          location: entry.location,
          totalMinutes: 0,
          shifts: 0,
          uniqueUsers: new Set<string>(),
        };
      }
      byLocation[locId].totalMinutes += entry.totalMinutes || 0;
      if (entry.status !== 'CLOCKED_IN') byLocation[locId].shifts++;
      byLocation[locId].uniqueUsers.add(entry.userId);
    }

    const locationSummaries = Object.values(byLocation).map((l: any) => ({
      location: l.location,
      totalHours: Math.round((l.totalMinutes / 60) * 10) / 10,
      shifts: l.shifts,
      uniqueTechnicians: l.uniqueUsers.size,
    }));

    return success({
      period: {
        startDate: format(new Date(data.startDate), 'yyyy-MM-dd'),
        endDate: format(new Date(data.endDate), 'yyyy-MM-dd'),
        workDays,
      },
      summary: {
        totalHours: Math.round(actualHours * 10) / 10,
        totalShifts,
        activeShifts,
        autoClockOuts,
        standardHours,
        overtimeHours: Math.round(overtimeHours * 10) / 10,
        averageShiftHours:
          totalShifts > 0 ? Math.round((totalMinutes / totalShifts / 60) * 10) / 10 : 0,
      },
      byUser: userSummaries,
      byLocation: locationSummaries,
    });
  }

  async getWeeklyReport(data: {
    organizationId: string;
    userId?: string;
    weekStartDate?: Date | string;
  }) {
    const baseDate = data.weekStartDate ? new Date(data.weekStartDate) : new Date();
    const startDate = getStartOfWeek(baseDate);
    const endDate = getEndOfWeek(baseDate);

    return this.getAttendanceSummary({
      organizationId: data.organizationId,
      userId: data.userId,
      startDate,
      endDate,
    });
  }

  async getMonthlyReport(data: {
    organizationId: string;
    userId?: string;
    year?: number;
    month?: number;
  }) {
    const now = new Date();
    const year = data.year ?? now.getFullYear();
    const month = data.month ?? now.getMonth() + 1;

    const baseDate = new Date(year, month - 1, 15);
    const startDate = getStartOfMonth(baseDate);
    const endDate = getEndOfMonth(baseDate);

    return this.getAttendanceSummary({
      organizationId: data.organizationId,
      userId: data.userId,
      startDate,
      endDate,
    });
  }

  async exportToCSV(data: {
    organizationId: string;
    startDate: Date | string;
    endDate: Date | string;
    userId?: string;
  }) {
    const { startDate, endDate } = this.clampRange(data.startDate, data.endDate);
    const dateFilter = buildDateRangeFilter(startDate, endDate);

    const where: any = {
      organizationId: data.organizationId,
      clockInAt: dateFilter,
    };

    if (data.userId) {
      where.userId = data.userId;
    }

    const entries = await this.prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        location: { select: { name: true, timezone: true } },
      },
      orderBy: [{ clockInAt: 'asc' }],
      take: AttendanceReportService.MAX_EXPORT_ROWS,
    });

    const headers = [
      'Date', 'Technician', 'Email', 'Location', 'Clock In', 'Clock Out',
      'Status', 'Duration (Hours)', 'Within Geofence (In)', 'Within Geofence (Out)', 'Notes',
    ];

    const rows = entries.map((entry) => [
      format(entry.clockInAt, 'yyyy-MM-dd'),
      `${entry.user.firstName} ${entry.user.lastName}`,
      entry.user.email,
      entry.location.name,
      format(entry.clockInAt, 'HH:mm:ss'),
      entry.clockOutAt ? format(entry.clockOutAt, 'HH:mm:ss') : '',
      entry.status,
      entry.totalMinutes ? (entry.totalMinutes / 60).toFixed(2) : '',
      entry.clockInWithinGeofence ? 'Yes' : 'No',
      entry.clockOutWithinGeofence === null ? '' : entry.clockOutWithinGeofence ? 'Yes' : 'No',
      entry.notes || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
      ),
    ].join('\n');

    return success({
      filename: `attendance_${format(new Date(data.startDate), 'yyyy-MM-dd')}_to_${format(new Date(data.endDate), 'yyyy-MM-dd')}.csv`,
      content: csvContent,
      mimeType: 'text/csv',
      recordCount: entries.length,
    });
  }

  private countWorkDays(startDate: Date, endDate: Date): number {
    let count = 0;
    const current = new Date(startDate);
    while (current <= endDate) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) count++;
      current.setDate(current.getDate() + 1);
    }
    return count;
  }
}
