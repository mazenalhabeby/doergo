import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

@Injectable()
export class AssetsService extends BaseGatewayService {
  constructor(
    @Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy,
  ) {
    super(taskClient, AssetsService.name);
  }

  // Categories
  async findAllCategories(data: Record<string, any>) {
    return this.send({ cmd: 'find_all_asset_categories' }, data);
  }

  // Types
  async findTypesByCategory(data: Record<string, any>) {
    return this.send({ cmd: 'find_types_by_category' }, data);
  }

  // Assets
  async findAll(data: Record<string, any>) {
    return this.send({ cmd: 'find_all_assets' }, data);
  }

  async findOne(data: Record<string, any>) {
    return this.send({ cmd: 'find_asset' }, data);
  }

  async listOrphans(data: Record<string, any>) {
    return this.send({ cmd: 'list_orphan_assets' }, data);
  }

  async billingUsage(data: Record<string, any>) {
    return this.send({ cmd: 'asset_billing_usage' }, data);
  }

  async getMaintenanceHistory(data: Record<string, any>) {
    return this.send({ cmd: 'get_asset_maintenance_history' }, data);
  }

  async listActivities(data: Record<string, any>) {
    return this.send({ cmd: 'list_asset_activities' }, data);
  }

  // A note is small and wanted on screen immediately, so it goes straight to
  // the service rather than through the queue — the same call shape as a read.
  async addActivity(data: Record<string, any>) {
    return this.send({ cmd: 'add_asset_activity' }, data);
  }

  async listMoney(data: Record<string, any>) {
    return this.send({ cmd: 'list_asset_money' }, data);
  }

  async addMoney(data: Record<string, any>) {
    return this.send({ cmd: 'add_asset_money' }, data);
  }

  async removeMoney(data: Record<string, any>) {
    return this.send({ cmd: 'remove_asset_money' }, data);
  }

  // Custody — who held it, and when.
  async custodyTimeline(data: Record<string, any>) {
    return this.send({ cmd: 'asset_custody_timeline' }, data);
  }

  async custodyForMember(data: Record<string, any>) {
    return this.send({ cmd: 'asset_custody_for_member' }, data);
  }

  async custodyMine(data: Record<string, any>) {
    return this.send({ cmd: 'asset_custody_mine' }, data);
  }

  /*
    A write that does NOT go through the queue, like a money entry and a note.
    The queue is there to make task creation exactly-once under a burst; a
    handover is one person pressing one button and watching for the result.
  */
  async custodyHandOver(data: Record<string, any>) {
    return this.send({ cmd: 'asset_custody_handover' }, data);
  }

  // Expenses — a member spends, the office accepts.
  async expensePresign(data: Record<string, any>) {
    return this.send({ cmd: 'asset_expense_presign' }, data);
  }

  /** Read a PDF receipt — the one file the phone's own reader cannot open. */
  async expenseRead(data: Record<string, any>) {
    return this.send({ cmd: 'asset_expense_read' }, data);
  }

  async expenseSubmit(data: Record<string, any>) {
    return this.send({ cmd: 'asset_expense_submit' }, data);
  }

  async expenseMine(data: Record<string, any>) {
    return this.send({ cmd: 'asset_expense_mine' }, data);
  }

  async expensePending(data: Record<string, any>) {
    return this.send({ cmd: 'asset_expense_pending' }, data);
  }

  async expenseReview(data: Record<string, any>) {
    return this.send({ cmd: 'asset_expense_review' }, data);
  }

  async expenseReceiptUrl(data: Record<string, any>) {
    return this.send({ cmd: 'asset_expense_receipt_url' }, data);
  }

  // Proposals — a member sends a page, the office decides.
  async proposalPresign(data: Record<string, any>) {
    return this.send({ cmd: 'asset_proposal_presign' }, data);
  }

  async proposalRaise(data: Record<string, any>) {
    return this.send({ cmd: 'asset_proposal_raise' }, data);
  }

  async proposalMine(data: Record<string, any>) {
    return this.send({ cmd: 'asset_proposal_mine' }, data);
  }

  async proposalPending(data: Record<string, any>) {
    return this.send({ cmd: 'asset_proposal_pending' }, data);
  }

  async proposalAccept(data: Record<string, any>) {
    return this.send({ cmd: 'asset_proposal_accept' }, data);
  }

  async proposalReject(data: Record<string, any>) {
    return this.send({ cmd: 'asset_proposal_reject' }, data);
  }

  async proposalWithdraw(data: Record<string, any>) {
    return this.send({ cmd: 'asset_proposal_withdraw' }, data);
  }

  async proposalDocumentUrl(data: Record<string, any>) {
    return this.send({ cmd: 'asset_proposal_document_url' }, data);
  }

  // Contracts — read, then propose, then apply.
  async contractRead(data: Record<string, any>) {
    return this.send({ cmd: 'asset_contract_read' }, data);
  }

  async contractPreview(data: Record<string, any>) {
    return this.send({ cmd: 'asset_contract_preview' }, data);
  }

  async contractApply(data: Record<string, any>) {
    return this.send({ cmd: 'asset_contract_apply' }, data);
  }

  async listRows(data: Record<string, any>) {
    return this.send({ cmd: 'list_asset_rows' }, data);
  }

  async addRow(data: Record<string, any>) {
    return this.send({ cmd: 'add_asset_row' }, data);
  }

  async updateRow(data: Record<string, any>) {
    return this.send({ cmd: 'update_asset_row' }, data);
  }

  async removeRow(data: Record<string, any>) {
    return this.send({ cmd: 'remove_asset_row' }, data);
  }



  // Logbook
  async logPresign(data: Record<string, any>) {
    return this.send({ cmd: 'asset_log_presign' }, data);
  }

  async logCreate(data: Record<string, any>) {
    return this.send({ cmd: 'asset_log_create' }, data);
  }

  async logList(data: Record<string, any>) {
    return this.send({ cmd: 'asset_log_list' }, data);
  }

  async logSummary(data: Record<string, any>) {
    return this.send({ cmd: 'asset_log_summary' }, data);
  }

  async logMine(data: Record<string, any>) {
    return this.send({ cmd: 'asset_log_mine' }, data);
  }

  async logDueMine(data: Record<string, any>) {
    return this.send({ cmd: 'asset_log_due_mine' }, data);
  }

  async logRemove(data: Record<string, any>) {
    return this.send({ cmd: 'asset_log_remove' }, data);
  }
}
