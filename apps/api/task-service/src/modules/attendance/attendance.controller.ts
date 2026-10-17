import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AttendanceService } from './attendance.service';

@Controller()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @MessagePattern({ cmd: 'list_clock_in_locations' })
  listClockInLocations(@Payload() d: { userId: string; organizationId: string }) {
    return this.attendanceService.listClockInLocations(d);
  }

  @MessagePattern({ cmd: 'get_attendance_status' })
  async getStatus(@Payload() data: { userId: string; organizationId: string }) {
    return this.attendanceService.getStatus(data);
  }

  @MessagePattern({ cmd: 'get_attendance_history' })
  async getHistory(
    @Payload()
    data: {
      userId: string;
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    },
  ) {
    return this.attendanceService.getHistory(data);
  }

  @MessagePattern({ cmd: 'get_location_entries' })
  async getLocationEntries(
    @Payload()
    data: {
      locationId: string;
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
      date?: string;
      search?: string;
      page?: number;
      limit?: number;
      startDate?: string;
      endDate?: string;
      requesterId?: string;
      /** Where the caller holds canViewSpaceAttendance; null = org-wide, [] = none. */
      viewScopeSpaceIds: string[] | null;
      sortBy?: string;
      sortOrder?: string;
      sharedSpaceIds?: string[];
    },
  ) {
    return this.attendanceService.getLocationEntries(data);
  }

  @MessagePattern({ cmd: 'get_location_entries_batch' })
  async getLocationEntriesBatch(
    @Payload()
    data: {
      locationIds: string[];
      organizationId: string;
      date?: string;
      requesterId?: string;
      /** Where the caller holds canViewSpaceAttendance; null = org-wide, [] = none. */
      viewScopeSpaceIds: string[] | null;
    },
  ) {
    return this.attendanceService.getLocationEntriesBatch(data);
  }

  @MessagePattern({ cmd: 'get_all_entries' })
  async getAllEntries(
    @Payload()
    data: {
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
      date?: string;
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: string;
    },
  ) {
    return this.attendanceService.getAllEntries(data);
  }

  @MessagePattern({ cmd: 'get_active_entries' })
  async getActiveEntries(@Payload() data: { organizationId: string }) {
    return this.attendanceService.getActiveEntries(data);
  }

  @MessagePattern({ cmd: 'list_no_shows' })
  async listNoShows(@Payload() data: { organizationId: string; days?: number; spaceId?: string; open?: boolean }) {
    return this.attendanceService.listNoShows(data);
  }

  @MessagePattern({ cmd: 'resolve_no_show' })
  async resolveNoShow(
    @Payload()
    data: {
      id: string;
      organizationId: string;
      action: 'excuse' | 'absent' | 'reopen';
      reasonCode?: string;
      reason?: string;
      wholeRun?: boolean;
      excusedById?: string;
    },
  ) {
    return this.attendanceService.resolveNoShow(data);
  }

  @MessagePattern({ cmd: 'no_show_summary' })
  async noShowSummary(@Payload() data: { organizationId: string; days?: number; spaceId?: string }) {
    return this.attendanceService.noShowSummary(data);
  }

  // ── Geofence excursion ("out of ring") ──
  @MessagePattern({ cmd: 'report_geofence_excursion' })
  async reportExcursion(
    @Payload()
    data: {
      userId: string;
      organizationId: string;
      reason: string;
      requestedMinutes: number;
    },
  ) {
    return this.attendanceService.reportExcursion(data);
  }

  @MessagePattern({ cmd: 'approve_geofence_excursion' })
  async approveExcursion(
    @Payload()
    data: {
      excursionId: string;
      approverId: string;
      organizationId: string;
      grantedMinutes?: number;
    },
  ) {
    return this.attendanceService.approveExcursion(data);
  }

  @MessagePattern({ cmd: 'reject_geofence_excursion' })
  async rejectExcursion(
    @Payload()
    data: {
      excursionId: string;
      approverId: string;
      organizationId: string;
    },
  ) {
    return this.attendanceService.rejectExcursion(data);
  }

  @MessagePattern({ cmd: 'list_geofence_excursions' })
  async listExcursions(
    @Payload()
    data: {
      organizationId: string;
      status?: 'active' | 'pending' | 'approved';
    },
  ) {
    return this.attendanceService.listActiveExcursions(data);
  }

  @MessagePattern({ cmd: 'resolve_forgot_clock_out' })
  async resolveForgotClockOut(
    @Payload() data: { userId: string; entryId: string; clockOutAt: string; organizationId: string },
  ) {
    return this.attendanceService.resolveForgotClockOut(data);
  }

  @MessagePattern({ cmd: 'request_extra_time' })
  async requestExtraTime(@Payload() data: { userId: string; entryId: string; organizationId: string }) {
    return this.attendanceService.requestExtraTime(data);
  }

  @MessagePattern({ cmd: 'approve_extra_time' })
  async approveExtraTime(
    @Payload() data: { approverId: string; entryId: string; minutes: number; organizationId: string },
  ) {
    return this.attendanceService.approveExtraTime(data);
  }

  @MessagePattern({ cmd: 'add_overtime_to_entry' })
  async addOvertimeToEntry(
    @Payload()
    data: {
      approverId: string;
      entryId: string;
      minutes: number;
      reason?: string | null;
      organizationId: string;
      scopeSpaceIds?: string[] | null;
    },
  ) {
    return this.attendanceService.addOvertimeToClosedEntry(data);
  }

  @MessagePattern({ cmd: 'remove_approved_overtime' })
  async removeApprovedOvertime(
    @Payload() data: { actorId: string; overtimeId: string; organizationId: string; scopeSpaceIds?: string[] | null },
  ) {
    return this.attendanceService.removeApprovedOvertime(data);
  }

  @MessagePattern({ cmd: 'reject_extra_time' })
  async rejectExtraTime(@Payload() data: { approverId: string; entryId: string; organizationId: string }) {
    return this.attendanceService.rejectExtraTime(data);
  }

  @MessagePattern({ cmd: 'list_pending_extra_time' })
  async listPendingExtraTime(@Payload() data: { userId: string; organizationId: string; isAdmin?: boolean }) {
    return this.attendanceService.listPendingExtraTime(data);
  }

  @MessagePattern({ cmd: 'get_entry_presence' })
  async getEntryPresence(
    @Payload() data: { entryId: string; organizationId: string; scopeSpaceIds?: string[] | null },
  ) {
    return this.attendanceService.getEntryPresence(data);
  }
}
