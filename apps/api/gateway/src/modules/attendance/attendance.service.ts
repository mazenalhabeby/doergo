import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

@Injectable()
export class AttendanceService extends BaseGatewayService {
  constructor(
    @Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy,
  ) {
    super(taskClient, AttendanceService.name);
  }

  /**
   * Get current attendance status for an employee
   */
  async getStatus(data: { userId: string; organizationId: string }) {
    return this.send({ cmd: 'get_attendance_status' }, data);
  }

  /**
   * Get attendance history for an employee
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

  // ── Session work-log ("what I did today") ──────────────────────────────────
  worklogAddNote(data: any) { return this.send({ cmd: 'worklog_add_note' }, data); }
  worklogAddNotesBatch(data: any) { return this.send({ cmd: 'worklog_add_notes_batch' }, data); }
  worklogList(data: any) { return this.send({ cmd: 'worklog_list' }, data); }
  worklogDeleteNote(data: any) { return this.send({ cmd: 'worklog_delete_note' }, data); }
  worklogPresignAttachment(data: any) { return this.send({ cmd: 'worklog_presign_attachment' }, data); }
  worklogConfirmAttachment(data: any) { return this.send({ cmd: 'worklog_confirm_attachment' }, data); }
  worklogDeleteAttachment(data: any) { return this.send({ cmd: 'worklog_delete_attachment' }, data); }

  /**
   * Get time entries for a location (admin view)
   */
  async getLocationEntries(data: {
    locationId: string;
    organizationId: string;
    date?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    limit?: number;
    requesterId?: string;
    requesterCanViewAll?: boolean;
    sortBy?: string;
    sortOrder?: string;
    sharedSpaceIds?: string[];
  }) {
    return this.send({ cmd: 'get_location_entries' }, data);
  }

  async getLocationEntriesBatch(data: {
    locationIds: string[];
    organizationId: string;
    date?: string;
    requesterId?: string;
    requesterCanViewAll?: boolean;
  }) {
    return this.send({ cmd: 'get_location_entries_batch' }, data);
  }

  /**
   * Get all time entries for an organization (admin view)
   */
  async getAllEntries(data: {
    organizationId: string;
    date?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }) {
    return this.send({ cmd: 'get_all_entries' }, data);
  }

  async getActiveEntries(data: { organizationId: string }) {
    return this.send({ cmd: 'get_active_entries' }, data);
  }

  async listNoShows(data: { organizationId: string; days?: number; spaceId?: string }) {
    return this.send({ cmd: 'list_no_shows' }, data);
  }

  async resolveNoShow(data: { id: string; organizationId: string; action: 'excuse' | 'reopen' }) {
    return this.send({ cmd: 'resolve_no_show' }, data);
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

  // ── Geofence excursion ("out of ring") ──

  /** Employee submits a reason + duration for being outside the ring. */
  async reportExcursion(data: {
    userId: string;
    organizationId: string;
    reason: string;
    requestedMinutes: number;
  }) {
    return this.send({ cmd: 'report_geofence_excursion' }, data);
  }

  /** Approver grants time (optionally adjusted) for an out-of-ring request. */
  async approveExcursion(data: {
    excursionId: string;
    approverId: string;
    organizationId: string;
    grantedMinutes?: number;
  }) {
    return this.send({ cmd: 'approve_geofence_excursion' }, data);
  }

  /** Approver rejects an out-of-ring request → the worker is clocked out. */
  async rejectExcursion(data: {
    excursionId: string;
    approverId: string;
    organizationId: string;
  }) {
    return this.send({ cmd: 'reject_geofence_excursion' }, data);
  }

  /** Approver surface: active (PENDING/APPROVED) out-of-ring requests. */
  async listExcursions(data: {
    organizationId: string;
    status?: 'active' | 'pending' | 'approved';
  }) {
    return this.send({ cmd: 'list_geofence_excursions' }, data);
  }

  // ── Shift reminder responses (worker actions + leader approval) ──

  /** Worker self-reports their leave time after forgetting to clock out. */
  async resolveForgotClockOut(data: {
    userId: string;
    entryId: string;
    clockOutAt: string;
    organizationId: string;
  }) {
    return this.send({ cmd: 'resolve_forgot_clock_out' }, data);
  }

  /** Worker requests to keep working past the shift end (routes to a leader). */
  async requestExtraTime(data: { userId: string; entryId: string; organizationId: string }) {
    return this.send({ cmd: 'request_extra_time' }, data);
  }

  /** Leader approves N more minutes of overtime for an open shift. */
  async approveExtraTime(data: {
    approverId: string;
    entryId: string;
    minutes: number;
    organizationId: string;
  }) {
    return this.send({ cmd: 'approve_extra_time' }, data);
  }

  /** Leader rejects an extra-time request. */
  async rejectExtraTime(data: { approverId: string; entryId: string; organizationId: string }) {
    return this.send({ cmd: 'reject_extra_time' }, data);
  }

  /** Open extra-time requests awaiting approval (scoped to the caller's spaces). */
  async listPendingExtraTime(data: { userId: string; organizationId: string; isAdmin?: boolean }) {
    return this.send({ cmd: 'list_pending_extra_time' }, data);
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
    timezone?: string;
    reason: string;
  }) {
    return this.send({ cmd: 'edit_entry' }, data);
  }

  /** Full edit history (per-edit audit rows) for a time entry. */
  async getEntryHistory(data: { entryId: string; organizationId: string }) {
    return this.send({ cmd: 'get_entry_history' }, data);
  }

  async deleteEntry(data: { entryId: string; editorId: string; organizationId: string }) {
    return this.send({ cmd: 'delete_entry' }, data);
  }

  async addManualEntries(data: {
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
  }) {
    return this.send({ cmd: 'add_manual_entries' }, data);
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
