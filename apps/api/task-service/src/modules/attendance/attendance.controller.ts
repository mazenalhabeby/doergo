import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AttendanceService } from './attendance.service';
import { BreakService } from './break.service';
import { AttendanceReportService } from './attendance-report.service';
import { ApprovalService } from './approval.service';

@Controller()
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly breakService: BreakService,
    private readonly reportService: AttendanceReportService,
    private readonly approvalService: ApprovalService,
  ) {}

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
      search?: string;
      page?: number;
      limit?: number;
      requesterId?: string;
      requesterCanViewAll?: boolean;
      sortBy?: string;
      sortOrder?: string;
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
      requesterCanViewAll?: boolean;
    },
  ) {
    return this.attendanceService.getLocationEntriesBatch(data);
  }

  @MessagePattern({ cmd: 'get_all_entries' })
  async getAllEntries(
    @Payload()
    data: {
      organizationId: string;
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
  async listNoShows(@Payload() data: { organizationId: string; days?: number; spaceId?: string }) {
    return this.attendanceService.listNoShows(data);
  }

  @MessagePattern({ cmd: 'resolve_no_show' })
  async resolveNoShow(@Payload() data: { id: string; organizationId: string; action: 'excuse' | 'reopen' }) {
    return this.attendanceService.resolveNoShow(data);
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
    return this.reportService.getAttendanceSummary(data);
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
    return this.reportService.getWeeklyReport(data);
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
    return this.reportService.getMonthlyReport(data);
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
    return this.reportService.exportToCSV(data);
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
    return this.breakService.startBreak(data);
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
    return this.breakService.endBreak(data);
  }

  @MessagePattern({ cmd: 'get_break_status' })
  async getBreakStatus(
    @Payload()
    data: {
      userId: string;
      organizationId: string;
    },
  ) {
    return this.breakService.getBreakStatus(data);
  }

  @MessagePattern({ cmd: 'get_breaks_for_entry' })
  async getBreaksForEntry(
    @Payload()
    data: {
      timeEntryId: string;
      organizationId: string;
    },
  ) {
    return this.breakService.getBreaksForEntry(data);
  }

  @MessagePattern({ cmd: 'get_active_breaks' })
  async getActiveBreaks(
    @Payload()
    data: {
      organizationId: string;
    },
  ) {
    return this.breakService.getActiveBreaks(data);
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
    return this.breakService.getBreakHistory(data);
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
    return this.breakService.endBreakManually(data);
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
    return this.breakService.getBreakSummary(data);
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
    return this.approvalService.getPendingApprovals(data);
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
    return this.approvalService.approveEntry(data);
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
    return this.approvalService.rejectEntry(data);
  }

  // ── Shift reminder responses (worker actions + leader approval) ──
  @MessagePattern({ cmd: 'resolve_forgot_clock_out' })
  async resolveForgotClockOut(
    @Payload() data: { userId: string; entryId: string; clockOutAt: string; organizationId: string },
  ) {
    return this.attendanceService.resolveForgotClockOut(data);
  }

  @MessagePattern({ cmd: 'request_extra_time' })
  async requestExtraTime(
    @Payload() data: { userId: string; entryId: string; organizationId: string },
  ) {
    return this.attendanceService.requestExtraTime(data);
  }

  @MessagePattern({ cmd: 'approve_extra_time' })
  async approveExtraTime(
    @Payload() data: { approverId: string; entryId: string; minutes: number; organizationId: string },
  ) {
    return this.attendanceService.approveExtraTime(data);
  }

  @MessagePattern({ cmd: 'reject_extra_time' })
  async rejectExtraTime(
    @Payload() data: { approverId: string; entryId: string; organizationId: string },
  ) {
    return this.attendanceService.rejectExtraTime(data);
  }

  @MessagePattern({ cmd: 'list_pending_extra_time' })
  async listPendingExtraTime(
    @Payload() data: { userId: string; organizationId: string; isAdmin?: boolean },
  ) {
    return this.attendanceService.listPendingExtraTime(data);
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
    return this.approvalService.editEntry(data);
  }

  @MessagePattern({ cmd: 'delete_entry' })
  async deleteEntry(
    @Payload() data: { entryId: string; editorId: string; organizationId: string },
  ) {
    return this.approvalService.deleteEntry(data);
  }

  @MessagePattern({ cmd: 'add_manual_entries' })
  async addManualEntries(
    @Payload()
    data: {
      editorId: string;
      organizationId: string;
      userId: string;
      locationId: string;
      startDate: string;
      endDate: string;
      weekdays?: number[];
      startTime: string;
      endTime: string;
      breakMinutes?: number;
      notes?: string;
      reason?: string;
    },
  ) {
    return this.approvalService.addManualEntries(data);
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
    return this.approvalService.bulkApprove(data);
  }
}
