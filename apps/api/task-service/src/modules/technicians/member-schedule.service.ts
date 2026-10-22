import { dowOf, availabilityRoster, personBrief, personPasses } from '@hbcfield/shared';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { success } from '@hbcfield/shared';
import { SetScheduleDto, GetScheduleDto, GetAvailabilityDto } from './dto';
import { dateKeyOf, availabilityDays } from './technicians-helpers';
import { MemberServiceBase } from './member-service.base';

/** A member's working week, and who is available on a day. */
@Injectable()
export class MemberScheduleService extends MemberServiceBase {
  // ========================================================================
  // SCHEDULE MANAGEMENT
  // ========================================================================

  /**
   * Set or update a technician's weekly schedule
   */
  async setSchedule(dto: SetScheduleDto) {
    const { technicianId, organizationId, schedule } = dto;

    // Verify technician exists and belongs to organization
    const technician = await personPasses(this.prisma, technicianId, { organizationId });

    if (!technician) {
      throw new NotFoundException('Employee not found in organization');
    }

    // Validate schedule entries
    for (const entry of schedule) {
      if (entry.dayOfWeek < 0 || entry.dayOfWeek > 6) {
        throw new BadRequestException('dayOfWeek must be between 0 (Sunday) and 6 (Saturday)');
      }
      if (!this.isValidTimeFormat(entry.startTime) || !this.isValidTimeFormat(entry.endTime)) {
        throw new BadRequestException('Time must be in HH:MM format (e.g., "09:00")');
      }
      // Validate start < end (prevent inverted schedules)
      if (entry.isActive !== false && entry.startTime >= entry.endTime) {
        throw new BadRequestException(
          `Start time (${entry.startTime}) must be before end time (${entry.endTime}) for day ${entry.dayOfWeek}`,
        );
      }
    }

    // Check for duplicate days
    const days = schedule.map((e) => e.dayOfWeek);
    if (new Set(days).size !== days.length) {
      throw new BadRequestException('Duplicate day entries are not allowed');
    }

    // Upsert each schedule entry (delete old, create new for simplicity)
    await this.prisma.$transaction(async (tx) => {
      // Delete existing schedule for this technician
      await tx.technicianSchedule.deleteMany({
        where: { technicianId },
      });

      // Create new schedule entries
      if (schedule.length > 0) {
        await tx.technicianSchedule.createMany({
          data: schedule.map((entry) => ({
            technicianId,
            dayOfWeek: entry.dayOfWeek,
            startTime: entry.startTime,
            endTime: entry.endTime,
            isActive: entry.isActive ?? true,
            notes: entry.notes,
          })),
        });
      }
    });

    // Fetch and return updated schedule
    const updatedSchedule = await this.prisma.technicianSchedule.findMany({
      where: { technicianId },
      orderBy: { dayOfWeek: 'asc' },
    });

    if (schedule.some((e) => e.isActive !== false)) {
      this.rematch?.schedule({ organizationId, userId: technicianId, spaceId: null });
    }
    return success(updatedSchedule);
  }

  /**
   * Get a technician's weekly schedule
   */
  async getSchedule(dto: GetScheduleDto) {
    const { technicianId, organizationId } = dto;

    // Verify technician belongs to organization
    const technician = await personBrief(this.prisma, technicianId, { organizationId });

    if (!technician) {
      throw new NotFoundException('Employee not found in organization');
    }

    const schedule = await this.prisma.technicianSchedule.findMany({
      where: { technicianId },
      orderBy: { dayOfWeek: 'asc' },
    });

    return success({
      technician,
      schedule,
    });
  }

  private isValidTimeFormat(time: string): boolean {
    const regex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return regex.test(time);
  }

  // ========================================================================
  // AVAILABILITY QUERIES
  // ========================================================================

  /**
   * Get availability for all technicians on a specific date or date range
   */
  async getAvailability(dto: GetAvailabilityDto) {
    const { organizationId, date, startDate, endDate, scopeSpaceIds } = dto;
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // The days to answer, as calendar dates (YYYY-MM-DD) — see `availabilityDays`.
    const days = availabilityDays({ date, startDate, endDate });
    if (days.length === 0) return success([]);

    // Collect unique dayOfWeek values needed
    const daysOfWeek = [...new Set(days.map((d) => dowOf(d)))];

    // Time off is a @db.Date column (UTC midnight), so the range bounds are the same instants.
    const rangeStart = new Date(`${days[0]}T00:00:00.000Z`);
    const rangeEnd = new Date(`${days[days.length - 1]}T00:00:00.000Z`);

    const technicians = await availabilityRoster(this.prisma, {
      organizationId,
      scopeSpaceIds,
      daysOfWeek,
      rangeStart,
      rangeEnd,
    });

    // Build availability for each date
    const dayResults = days.map((dateStr) => {
      const dayOfWeek = dowOf(dateStr);

      const availability = technicians.map((tech) => {
        const schedule = tech.schedules?.find((s) => s.dayOfWeek === dayOfWeek) || null;
        const timeOffRecord = tech.timeOffRequests?.find(
          (t) => dateKeyOf(t.startDate) <= dateStr && dateKeyOf(t.endDate) >= dateStr,
        );
        const onTimeOff = !!timeOffRecord;
        const hasSchedule = schedule !== null;

        // Resolve primary space
        const primaryAssignment = tech.spaceAssignments?.find((a) => a.isPrimary);
        const firstAssignment = tech.spaceAssignments?.[0];
        const space = primaryAssignment?.space || firstAssignment?.space || null;

        return {
          id: tech.id,
          firstName: tech.firstName,
          lastName: tech.lastName,
          position: tech.position,
          isAvailable: hasSchedule && !onTimeOff,
          onTimeOff,
          space: space ? { id: space.id, name: space.name } : null,
          schedule: schedule
            ? {
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                notes: schedule.notes,
              }
            : null,
          timeOff: timeOffRecord
            ? {
                startDate: timeOffRecord.startDate,
                endDate: timeOffRecord.endDate,
                reason: timeOffRecord.reason,
              }
            : null,
        };
      });

      return {
        date: dateStr,
        dayOfWeek,
        dayName: DAY_NAMES[dayOfWeek],
        technicians: availability,
        summary: {
          total: technicians.length,
          available: availability.filter((a) => a.isAvailable).length,
          onTimeOff: availability.filter((a) => a.onTimeOff).length,
          notScheduled: availability.filter((a) => !a.schedule).length,
        },
      };
    });

    // If single date was requested, return single object (backward compatible)
    if (!startDate || !endDate) {
      return success(dayResults[0]);
    }

    // Range request: return array
    return success(dayResults);
  }
}
