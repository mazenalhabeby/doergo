import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

@Injectable()
export class AttendanceService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, AttendanceService.name);
  }

  /**
   * Get current attendance status for an employee
   */
  async getStatus(data: { userId: string; organizationId: string }) {
    return this.send({ cmd: 'get_attendance_status' }, data);
  }

  /** The workspaces this member may clock in at right now — see the service. */
  async listClockInLocations(data: { userId: string; organizationId: string }) {
    return this.send({ cmd: 'list_clock_in_locations' }, data);
  }

  /**
   * Get attendance history for an employee
   */
  async getHistory(data: {
    userId: string;
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    return this.send({ cmd: 'get_attendance_history' }, data);
  }

  // ── Session work-log ("what I did today") ──────────────────────────────────
  /*
    Work-log and rest WRITES go through `sendOnce`: `send` retries on a slow
    answer, and a retried write lands twice — the batch route has no ids to
    catch it. Reads and presigns keep the retrying `send`.
  */
  worklogAddNote(data: any) {
    return this.sendOnce({ cmd: 'worklog_add_note' }, data);
  }
  worklogAddNotesBatch(data: any) {
    return this.sendOnce({ cmd: 'worklog_add_notes_batch' }, data);
  }
  worklogList(data: any) {
    return this.send({ cmd: 'worklog_list' }, data);
  }
  worklogDeleteNote(data: any) {
    return this.sendOnce({ cmd: 'worklog_delete_note' }, data);
  }
  worklogPresignAttachment(data: any) {
    return this.send({ cmd: 'worklog_presign_attachment' }, data);
  }
  worklogConfirmAttachment(data: any) {
    return this.sendOnce({ cmd: 'worklog_confirm_attachment' }, data);
  }
  worklogDeleteAttachment(data: any) {
    return this.sendOnce({ cmd: 'worklog_delete_attachment' }, data);
  }

  /**
   * Get time entries for a location (admin view)
   */
  async getLocationEntries(data: {
    locationId: string;
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    date?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    limit?: number;
    requesterId?: string;
    /** Where the caller holds canViewSpaceAttendance; null = org-wide, [] = none. */
    viewScopeSpaceIds: string[] | null;
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
    /** Where the caller holds canViewSpaceAttendance; null = org-wide, [] = none. */
    viewScopeSpaceIds: string[] | null;
  }) {
    return this.send({ cmd: 'get_location_entries_batch' }, data);
  }

  /**
   * Get all time entries for an organization (admin view)
   */
  async getAllEntries(data: {
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
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

  async getActiveEntries(data: { organizationId: string; scopeSpaceIds?: string[] | null }) {
    return this.send({ cmd: 'get_active_entries' }, data);
  }

  async listNoShows(data: {
    organizationId: string;
    scopeSpaceIds?: string[] | null;
    days?: number;
    spaceId?: string;
    open?: boolean;
  }) {
    return this.send({ cmd: 'list_no_shows' }, data);
  }

  async resolveNoShow(data: {
    id: string;
    organizationId: string;
    scopeSpaceIds?: string[] | null;
    action: 'excuse' | 'absent' | 'reopen';
    reasonCode?: string;
    reason?: string;
    wholeRun?: boolean;
    excusedById?: string;
  }) {
    return this.send({ cmd: 'resolve_no_show' }, data);
  }

  async noShowSummary(data: {
    organizationId: string;
    scopeSpaceIds?: string[] | null;
    days?: number;
    spaceId?: string;
  }) {
    return this.send({ cmd: 'no_show_summary' }, data);
  }

  // ── The automatic clock (attendance/auto-clock.ts) — the caller's own, always ──
  // Writes through `sendOnce`: a retried consent is harmless, a retried undo is not worth the doubt.
  autoClockPlan(data: { userId: string; organizationId: string }) {
    return this.send({ cmd: 'auto_clock_plan' }, data);
  }
  autoClockConsent(data: { userId: string; organizationId: string; consent: boolean }) {
    return this.sendOnce({ cmd: 'auto_clock_consent' }, data);
  }
  autoClockUndo(data: { userId: string; organizationId: string; entryId: string; evidence?: unknown }) {
    return this.sendOnce({ cmd: 'auto_clock_undo' }, data);
  }
  autoClockSkipRest(data: { userId: string; organizationId: string; entryId: string; evidence?: unknown }) {
    return this.sendOnce({ cmd: 'auto_clock_skip_rest' }, data);
  }
}
