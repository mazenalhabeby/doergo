import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AttendanceService } from './attendance.service';

@Controller()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

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
      date?: string;
      page?: number;
      limit?: number;
    },
  ) {
    return this.attendanceService.getLocationEntries(data);
  }

  @MessagePattern({ cmd: 'get_all_entries' })
  async getAllEntries(
    @Payload()
    data: {
      organizationId: string;
      date?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
  ) {
    return this.attendanceService.getAllEntries(data);
  }

  // =========================================================================
  // REPORTS
  // =========================================================================

  @MessagePattern({ cmd: 'get_attendance_summary' })
  async getAttendanceSummary(
    @Payload()
    data: {
      organizationId: string;
      userId?: string;
      startDate: string;
      endDate: string;
    },
  ) {
    return this.attendanceService.getAttendanceSummary(data);
  }

  @MessagePattern({ cmd: 'get_weekly_report' })
  async getWeeklyReport(
    @Payload()
    data: {
      organizationId: string;
      userId?: string;
      weekStartDate?: string;
    },
  ) {
    return this.attendanceService.getWeeklyReport(data);
  }

  @MessagePattern({ cmd: 'get_monthly_report' })
  async getMonthlyReport(
    @Payload()
    data: {
      organizationId: string;
      userId?: string;
      year?: number;
      month?: number;
    },
  ) {
    return this.attendanceService.getMonthlyReport(data);
  }

  @MessagePattern({ cmd: 'export_attendance_csv' })
  async exportToCSV(
    @Payload()
    data: {
      organizationId: string;
      startDate: string;
      endDate: string;
      userId?: string;
    },
  ) {
    return this.attendanceService.exportToCSV(data);
  }

  // =========================================================================
  // BREAKS
  // =========================================================================

  @MessagePattern({ cmd: 'start_break' })
  async startBreak(
    @Payload()
    data: {
      userId: string;
      organizationId: string;
      type?: string;
      notes?: string;
    },
  ) {
    return this.attendanceService.startBreak(data);
  }

  @MessagePattern({ cmd: 'end_break' })
  async endBreak(
    @Payload()
    data: {
      userId: string;
      organizationId: string;
      notes?: string;
    },
  ) {
    return this.attendanceService.endBreak(data);
  }

  @MessagePattern({ cmd: 'get_break_status' })
  async getBreakStatus(
    @Payload()
    data: {
      userId: string;
      organizationId: string;
    },
  ) {
    return this.attendanceService.getBreakStatus(data);
  }

  @MessagePattern({ cmd: 'get_breaks_for_entry' })
  async getBreaksForEntry(
    @Payload()
    data: {
      timeEntryId: string;
      organizationId: string;
    },
  ) {
    return this.attendanceService.getBreaksForEntry(data);
  }

  @MessagePattern({ cmd: 'get_active_breaks' })
  async getActiveBreaks(
    @Payload()
    data: {
      organizationId: string;
    },
  ) {
    return this.attendanceService.getActiveBreaks(data);
  }

  @MessagePattern({ cmd: 'get_break_history' })
  async getBreakHistory(
    @Payload()
    data: {
      organizationId: string;
      date?: string;
      userId?: string;
      type?: string;
      page?: number;
      limit?: number;
    },
  ) {
    return this.attendanceService.getBreakHistory(data);
  }

  @MessagePattern({ cmd: 'end_break_manually' })
  async endBreakManually(
    @Payload()
    data: {
      breakId: string;
      adminId: string;
      organizationId: string;
      notes?: string;
    },
  ) {
    return this.attendanceService.endBreakManually(data);
  }

  @MessagePattern({ cmd: 'get_break_summary' })
  async getBreakSummary(
    @Payload()
    data: {
      organizationId: string;
      startDate: string;
      endDate: string;
      userId?: string;
    },
  ) {
    return this.attendanceService.getBreakSummary(data);
  }

  // =========================================================================
  // APPROVAL WORKFLOW
  // =========================================================================

  @MessagePattern({ cmd: 'get_pending_approvals' })
  async getPendingApprovals(
    @Payload()
    data: {
      organizationId: string;
      page?: number;
      limit?: number;
    },
  ) {
    return this.attendanceService.getPendingApprovals(data);
  }

  @MessagePattern({ cmd: 'approve_entry' })
  async approveEntry(
    @Payload()
    data: {
      entryId: string;
      approverId: string;
      organizationId: string;
      notes?: string;
    },
  ) {
    return this.attendanceService.approveEntry(data);
  }

  @MessagePattern({ cmd: 'reject_entry' })
  async rejectEntry(
    @Payload()
    data: {
      entryId: string;
      approverId: string;
      organizationId: string;
      reason: string;
    },
  ) {
    return this.attendanceService.rejectEntry(data);
  }

  @MessagePattern({ cmd: 'edit_entry' })
  async editEntry(
    @Payload()
    data: {
      entryId: string;
      editorId: string;
      organizationId: string;
      clockInAt?: string;
      clockOutAt?: string;
      notes?: string;
      reason: string;
    },
  ) {
    return this.attendanceService.editEntry(data);
  }

  @MessagePattern({ cmd: 'bulk_approve_entries' })
  async bulkApprove(
    @Payload()
    data: {
      entryIds: string[];
      approverId: string;
      organizationId: string;
      notes?: string;
    },
  ) {
    return this.attendanceService.bulkApprove(data);
  }
}
