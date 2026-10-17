import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ApprovalService } from './approval.service';
import { EntryEditService } from './entry-edit.service';
import { EntryRecordService } from './entry-record.service';
import { ManualEntriesService } from './manual-entries.service';

/** Deciding and correcting time entries over RPC: approve, reject, edit, history, delete, add by hand. */
@Controller()
export class EntryDecisionsRpcController {
  constructor(
    private readonly approvalService: ApprovalService,
    private readonly manualEntries: ManualEntriesService,
    private readonly entryRecord: EntryRecordService,
    private readonly entryEdit: EntryEditService,
  ) {}

  // =========================================================================
  // APPROVAL WORKFLOW
  // =========================================================================

  @MessagePattern({ cmd: 'get_pending_approvals' })
  async getPendingApprovals(
    @Payload()
    data: {
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
      page?: number;
      limit?: number;
      summary?: boolean;
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
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
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
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
      reason: string;
    },
  ) {
    return this.approvalService.rejectEntry(data);
  }

  @MessagePattern({ cmd: 'edit_entry' })
  async editEntry(
    @Payload()
    data: {
      entryId: string;
      editorId: string;
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
      clockInAt?: string;
      clockOutAt?: string;
      notes?: string;
      reason: string;
    },
  ) {
    return this.entryEdit.editEntry(data);
  }

  @MessagePattern({ cmd: 'get_entry_history' })
  async getEntryHistory(@Payload() data: { entryId: string; organizationId: string }) {
    return this.entryRecord.getEntryHistory(data);
  }

  @MessagePattern({ cmd: 'delete_entry' })
  async deleteEntry(@Payload() data: { entryId: string; editorId: string; organizationId: string }) {
    return this.entryRecord.deleteEntry(data);
  }

  @MessagePattern({ cmd: 'add_manual_entries' })
  async addManualEntries(
    @Payload()
    data: {
      editorId: string;
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
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
    return this.manualEntries.addManualEntries(data);
  }

  @MessagePattern({ cmd: 'bulk_approve_entries' })
  async bulkApprove(
    @Payload()
    data: {
      entryIds: string[];
      approverId: string;
      organizationId: string;
      /** Spaces the caller may act in; null = org-wide, [] = none. */
      scopeSpaceIds?: string[] | null;
      notes?: string;
    },
  ) {
    return this.approvalService.bulkApprove(data);
  }
}
