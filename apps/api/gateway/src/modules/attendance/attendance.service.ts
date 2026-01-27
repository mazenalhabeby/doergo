import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@doergo/shared';

@Injectable()
export class AttendanceService extends BaseGatewayService {
  constructor(
    @Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy,
  ) {
    super(taskClient, AttendanceService.name);
  }

  /**
   * Get current attendance status for a technician
   */
  async getStatus(data: { userId: string; organizationId: string }) {
    return this.send({ cmd: 'get_attendance_status' }, data);
  }

  /**
   * Get attendance history for a technician
   */
  async getHistory(data: {
    userId: string;
    organizationId: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    return this.send({ cmd: 'get_attendance_history' }, data);
  }

  /**
   * Get time entries for a location (admin view)
   */
  async getLocationEntries(data: {
    locationId: string;
    organizationId: string;
    date?: string;
    page?: number;
    limit?: number;
  }) {
    return this.send({ cmd: 'get_location_entries' }, data);
  }

  /**
   * Get all time entries for an organization (admin view)
   */
  async getAllEntries(data: {
    organizationId: string;
    date?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    return this.send({ cmd: 'get_all_entries' }, data);
  }

  // =========================================================================
  // REPORTS
  // =========================================================================

  /**
   * Get attendance summary for a period
   */
  async getAttendanceSummary(data: {
    organizationId: string;
    userId?: string;
    startDate: string;
    endDate: string;
  }) {
    return this.send({ cmd: 'get_attendance_summary' }, data);
  }

  /**
   * Get weekly attendance report
   */
  async getWeeklyReport(data: {
    organizationId: string;
    userId?: string;
    weekStartDate?: string;
  }) {
    return this.send({ cmd: 'get_weekly_report' }, data);
  }

  /**
   * Get monthly attendance report
   */
  async getMonthlyReport(data: {
    organizationId: string;
    userId?: string;
    year?: number;
    month?: number;
  }) {
    return this.send({ cmd: 'get_monthly_report' }, data);
  }

  /**
   * Export attendance data to CSV
   */
  async exportToCSV(data: {
    organizationId: string;
    startDate: string;
    endDate: string;
    userId?: string;
  }) {
    return this.send({ cmd: 'export_attendance_csv' }, data);
  }

  // =========================================================================
  // BREAKS
  // =========================================================================

  /**
   * Start a break
   */
  async startBreak(data: {
    userId: string;
    organizationId: string;
    type?: string;
    notes?: string;
  }) {
    return this.send({ cmd: 'start_break' }, data);
  }

  /**
   * End current break
   */
  async endBreak(data: {
    userId: string;
    organizationId: string;
    notes?: string;
  }) {
    return this.send({ cmd: 'end_break' }, data);
  }

  /**
   * Get current break status
   */
  async getBreakStatus(data: { userId: string; organizationId: string }) {
    return this.send({ cmd: 'get_break_status' }, data);
  }

  /**
   * Get breaks for a time entry
   */
  async getBreaksForEntry(data: { timeEntryId: string; organizationId: string }) {
    return this.send({ cmd: 'get_breaks_for_entry' }, data);
  }

  /**
   * Get all active breaks in the organization (admin)
   */
  async getActiveBreaks(data: { organizationId: string }) {
    return this.send({ cmd: 'get_active_breaks' }, data);
  }

  /**
   * Get break history with filters (admin)
   */
  async getBreakHistory(data: {
    organizationId: string;
    date?: string;
    userId?: string;
    type?: string;
    page?: number;
    limit?: number;
  }) {
    return this.send({ cmd: 'get_break_history' }, data);
  }

  /**
   * End a break manually (admin)
   */
  async endBreakManually(data: {
    breakId: string;
    adminId: string;
    organizationId: string;
    notes?: string;
  }) {
    return this.send({ cmd: 'end_break_manually' }, data);
  }

  /**
   * Get break summary statistics for a date range
   */
  async getBreakSummary(data: {
    organizationId: string;
    startDate: string;
    endDate: string;
    userId?: string;
  }) {
    return this.send({ cmd: 'get_break_summary' }, data);
  }

  // =========================================================================
  // APPROVAL WORKFLOW
  // =========================================================================

  /**
   * Get entries pending approval
   */
  async getPendingApprovals(data: {
    organizationId: string;
    page?: number;
    limit?: number;
  }) {
    return this.send({ cmd: 'get_pending_approvals' }, data);
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
    return this.send({ cmd: 'approve_entry' }, data);
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
    return this.send({ cmd: 'reject_entry' }, data);
  }

  /**
   * Edit a time entry
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
    return this.send({ cmd: 'edit_entry' }, data);
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
    return this.send({ cmd: 'bulk_approve_entries' }, data);
  }
}
