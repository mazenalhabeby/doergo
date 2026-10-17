import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ApprovalService } from './approval.service';
import { EntryEditService } from './entry-edit.service';
import { EntryRecordService } from './entry-record.service';
import { ManualEntriesService } from './manual-entries.service';
import {
  pattern,
  type RpcRequest,
  getPendingApprovals,
  approveEntry,
  rejectEntry,
  editEntry,
  getEntryHistory,
  deleteEntry,
  addManualEntries,
  bulkApproveEntries,
} from '@hbcfield/shared/microservices';

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

  @MessagePattern(pattern(getPendingApprovals))
  async getPendingApprovals(
    @Payload()
    data: RpcRequest<typeof getPendingApprovals>,
  ) {
    return this.approvalService.getPendingApprovals(data);
  }

  @MessagePattern(pattern(approveEntry))
  async approveEntry(
    @Payload()
    data: RpcRequest<typeof approveEntry>,
  ) {
    return this.approvalService.approveEntry(data);
  }

  @MessagePattern(pattern(rejectEntry))
  async rejectEntry(
    @Payload()
    data: RpcRequest<typeof rejectEntry>,
  ) {
    return this.approvalService.rejectEntry(data);
  }

  @MessagePattern(pattern(editEntry))
  async editEntry(
    @Payload()
    data: RpcRequest<typeof editEntry>,
  ) {
    return this.entryEdit.editEntry(data);
  }

  @MessagePattern(pattern(getEntryHistory))
  async getEntryHistory(@Payload() data: RpcRequest<typeof getEntryHistory>) {
    return this.entryRecord.getEntryHistory(data);
  }

  @MessagePattern(pattern(deleteEntry))
  async deleteEntry(@Payload() data: RpcRequest<typeof deleteEntry>) {
    return this.entryRecord.deleteEntry(data);
  }

  @MessagePattern(pattern(addManualEntries))
  async addManualEntries(
    @Payload()
    data: RpcRequest<typeof addManualEntries>,
  ) {
    return this.manualEntries.addManualEntries(data);
  }

  @MessagePattern(pattern(bulkApproveEntries))
  async bulkApprove(
    @Payload()
    data: RpcRequest<typeof bulkApproveEntries>,
  ) {
    return this.approvalService.bulkApprove(data);
  }
}
