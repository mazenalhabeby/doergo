import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

/** Deciding and correcting time entries and excursions, asked of task-service. */
@Injectable()
export class EntryDecisionsGatewayService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, EntryDecisionsGatewayService.name);
  }

  // =========================================================================
  // APPROVAL WORKFLOW
  // =========================================================================

  /**
   * Get entries pending approval
   */
  async getPendingApprovals(data: {
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    page?: number;
    limit?: number;
    summary?: boolean;
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
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
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
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    reason: string;
  }) {
    return this.send({ cmd: 'reject_entry' }, data);
  }

  // ── Geofence excursion ("out of ring") ──

  /** Employee submits a reason + duration for being outside the ring. */
  async reportExcursion(data: {
    userId: string;
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
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
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    grantedMinutes?: number;
  }) {
    return this.send({ cmd: 'approve_geofence_excursion' }, data);
  }

  /** Approver rejects an out-of-ring request → the worker is clocked out. */
  async rejectExcursion(data: {
    excursionId: string;
    approverId: string;
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
  }) {
    return this.send({ cmd: 'reject_geofence_excursion' }, data);
  }

  /** Approver surface: active (PENDING/APPROVED) out-of-ring requests. */
  async listExcursions(data: {
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    status?: 'active' | 'pending' | 'approved';
  }) {
    return this.send({ cmd: 'list_geofence_excursions' }, data);
  }

  /**
   * Edit a time entry
   */
  async editEntry(data: {
    entryId: string;
    editorId: string;
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    clockInAt?: string;
    clockOutAt?: string;
    notes?: string;
    timezone?: string;
    reason: string;
  }) {
    return this.send({ cmd: 'edit_entry' }, data);
  }

  /** Where somebody worked through one entry's day — groups and reasons, no positions. */
  async getEntryPresence(data: { entryId: string; organizationId: string; scopeSpaceIds?: string[] | null }) {
    return this.send({ cmd: 'get_entry_presence' }, data);
  }

  /** Full edit history (per-edit audit rows) for a time entry. */
  async getEntryHistory(data: { entryId: string; organizationId: string; scopeSpaceIds?: string[] | null }) {
    return this.send({ cmd: 'get_entry_history' }, data);
  }

  async deleteEntry(data: { entryId: string; editorId: string; organizationId: string; scopeSpaceIds?: string[] | null }) {
    return this.send({ cmd: 'delete_entry' }, data);
  }

  async addManualEntries(data: {
    editorId: string;
    organizationId: string;
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    userId: string;
    locationId: string;
    startDate: string;
    endDate: string;
    weekdays?: number[];
    startTime: string;
    endTime: string;
    /*
      The break as both attendance dialogs describe it — wall-clock times inside
      the shift, with a type and a reason.

      `breakMinutes` stays for clients that have not taken the update; the
      service turns it into the same break, centred.
    */
    breakStart?: string;
    breakEnd?: string;
    breakType?: 'SHORT' | 'LUNCH' | 'OTHER';
    breakReason?: string;
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
    /** Spaces the caller may see; null = org-wide, [] = none. */
    scopeSpaceIds?: string[] | null;
    notes?: string;
  }) {
    return this.send({ cmd: 'bulk_approve_entries' }, data);
  }
}
