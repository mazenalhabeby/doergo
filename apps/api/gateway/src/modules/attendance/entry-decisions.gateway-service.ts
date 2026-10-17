import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
  pattern,
  type RpcRequest,
  getPendingApprovals,
  approveEntry,
  rejectEntry,
  reportGeofenceExcursion,
  approveGeofenceExcursion,
  rejectGeofenceExcursion,
  listGeofenceExcursions,
  editEntry,
  getEntryPresence,
  getEntryHistory,
  deleteEntry,
  addManualEntries,
  bulkApproveEntries,
} from '@hbcfield/shared/microservices';

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
  async getPendingApprovals(data: RpcRequest<typeof getPendingApprovals>) {
    return this.send(pattern(getPendingApprovals), data);
  }

  /**
   * Approve a time entry
   */
  async approveEntry(data: RpcRequest<typeof approveEntry>) {
    return this.send(pattern(approveEntry), data);
  }

  /**
   * Reject a time entry
   */
  async rejectEntry(data: RpcRequest<typeof rejectEntry>) {
    return this.send(pattern(rejectEntry), data);
  }

  // ── Geofence excursion ("out of ring") ──

  /** Employee submits a reason + duration for being outside the ring. */
  async reportExcursion(data: RpcRequest<typeof reportGeofenceExcursion>) {
    return this.send(pattern(reportGeofenceExcursion), data);
  }

  /** Approver grants time (optionally adjusted) for an out-of-ring request. */
  async approveExcursion(data: RpcRequest<typeof approveGeofenceExcursion>) {
    return this.send(pattern(approveGeofenceExcursion), data);
  }

  /** Approver rejects an out-of-ring request → the worker is clocked out. */
  async rejectExcursion(data: RpcRequest<typeof rejectGeofenceExcursion>) {
    return this.send(pattern(rejectGeofenceExcursion), data);
  }

  /** Approver surface: active (PENDING/APPROVED) out-of-ring requests. */
  async listExcursions(data: RpcRequest<typeof listGeofenceExcursions>) {
    return this.send(pattern(listGeofenceExcursions), data);
  }

  /**
   * Edit a time entry
   */
  async editEntry(data: RpcRequest<typeof editEntry>) {
    return this.send(pattern(editEntry), data);
  }

  /** Where somebody worked through one entry's day — groups and reasons, no positions. */
  async getEntryPresence(data: RpcRequest<typeof getEntryPresence>) {
    return this.send(pattern(getEntryPresence), data);
  }

  /** Full edit history (per-edit audit rows) for a time entry. */
  async getEntryHistory(data: RpcRequest<typeof getEntryHistory>) {
    return this.send(pattern(getEntryHistory), data);
  }

  async deleteEntry(data: RpcRequest<typeof deleteEntry>) {
    return this.send(pattern(deleteEntry), data);
  }

  /*
    The break as both attendance dialogs describe it — wall-clock times inside
    the shift, with a type and a reason. `breakMinutes` stays for clients that
    have not taken the update; the service turns it into the same break, centred.
  */
  async addManualEntries(data: RpcRequest<typeof addManualEntries>) {
    return this.send(pattern(addManualEntries), data);
  }

  /**
   * Bulk approve entries
   */
  async bulkApprove(data: RpcRequest<typeof bulkApproveEntries>) {
    return this.send(pattern(bulkApproveEntries), data);
  }
}
