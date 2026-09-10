import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AssetsService } from './assets.service';
import { AssetCatalogService } from './asset-catalog.service';
import { AssetRowsService } from './asset-rows.service';
import { AssetLedgerService } from './asset-ledger.service';
import { AssetActivityService } from './asset-activity.service';
import { AssetUsageService } from './asset-usage.service';
import { AssetCustodyService } from './asset-custody.service';
import { AssetExpenseService } from './asset-expense.service';
import { AssetContractService } from './asset-contract.service';

@Controller()
export class AssetsController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly catalog: AssetCatalogService,
    private readonly rows: AssetRowsService,
    private readonly ledger: AssetLedgerService,
    private readonly activity: AssetActivityService,
    private readonly usage: AssetUsageService,
    private readonly custody: AssetCustodyService,
    private readonly expenses: AssetExpenseService,
    private readonly contracts: AssetContractService,
  ) {}

  // ============================================
  // CATEGORIES (READ operations via MessagePattern)
  // ============================================

  @MessagePattern({ cmd: 'find_all_asset_categories' })
  async findAllCategories(@Payload() data: any) {
    return this.catalog.findAllCategories(data);
  }

  // ============================================
  // TYPES (READ operations via MessagePattern)
  // ============================================

  @MessagePattern({ cmd: 'find_types_by_category' })
  async findTypesByCategory(@Payload() data: any) {
    return this.catalog.findTypesByCategory(data);
  }

  // ============================================
  // ASSETS (READ operations via MessagePattern)
  // ============================================

  @MessagePattern({ cmd: 'find_all_assets' })
  async findAll(@Payload() data: any) {
    return this.assetsService.findAll(data);
  }

  @MessagePattern({ cmd: 'find_asset' })
  async findOne(@Payload() data: any) {
    return this.assetsService.findOne(data);
  }

  /** Assets in no space — invisible on every screen, still on the bill. */
  @MessagePattern({ cmd: 'list_orphan_assets' })
  async listOrphans(@Payload() data: any) {
    return this.assetsService.listOrphans(data);
  }

  /** Billable assets per space — the counts only; pricing is shared. */
  @MessagePattern({ cmd: 'asset_billing_usage' })
  async billingUsage(@Payload() data: any) {
    return this.usage.count(data.organizationId);
  }

  @MessagePattern({ cmd: 'get_asset_maintenance_history' })
  async getMaintenanceHistory(@Payload() data: any) {
    return this.assetsService.getMaintenanceHistory(data);
  }

  @MessagePattern({ cmd: 'list_asset_activities' })
  async listActivities(@Payload() data: any) {
    return this.activity.listActivities(data);
  }

  @MessagePattern({ cmd: 'add_asset_activity' })
  async addActivity(@Payload() data: any) {
    return this.activity.addActivity(data);
  }

  @MessagePattern({ cmd: 'list_asset_money' })
  async listMoney(@Payload() data: any) {
    return this.ledger.listMoney(data);
  }

  @MessagePattern({ cmd: 'add_asset_money' })
  async addMoney(@Payload() data: any) {
    return this.ledger.addMoney(data);
  }

  @MessagePattern({ cmd: 'remove_asset_money' })
  async removeMoney(@Payload() data: any) {
    return this.ledger.removeMoney(data);
  }

  // ============================================
  // CUSTODY — who held it, and when
  // ============================================

  @MessagePattern({ cmd: 'asset_custody_timeline' })
  async custodyTimeline(@Payload() data: any) {
    return this.custody.timeline(data);
  }

  /*
    A write, and it goes STRAIGHT to the service rather than through the queue —
    the same choice as a money entry or a note. The queue exists to make task
    creation exactly-once under a burst; a handover is one person pressing one
    button and waiting to see the result, and a round trip through Redis buys
    nothing but latency on a screen somebody is watching.
  */
  @MessagePattern({ cmd: 'asset_custody_handover' })
  async handOver(@Payload() data: any) {
    return this.custody.handOver(data);
  }

  @MessagePattern({ cmd: 'asset_custody_for_member' })
  async custodyForMember(@Payload() data: any) {
    return this.custody.forMember(data);
  }

  /** What the CALLER holds — the phone opens on this. */
  @MessagePattern({ cmd: 'asset_custody_mine' })
  async custodyMine(@Payload() data: any) {
    return this.custody.mine(data);
  }

  // ============================================
  // EXPENSES — a member spends, the office accepts
  // ============================================

  @MessagePattern({ cmd: 'asset_expense_presign' })
  async expensePresign(@Payload() data: any) {
    return this.expenses.presignReceipt(data);
  }

  @MessagePattern({ cmd: 'asset_expense_submit' })
  async expenseSubmit(@Payload() data: any) {
    return this.expenses.submit(data);
  }

  @MessagePattern({ cmd: 'asset_expense_mine' })
  async expenseMine(@Payload() data: any) {
    return this.expenses.mine(data);
  }

  @MessagePattern({ cmd: 'asset_expense_pending' })
  async expensePending(@Payload() data: any) {
    return this.expenses.pending(data);
  }

  @MessagePattern({ cmd: 'asset_expense_review' })
  async expenseReview(@Payload() data: any) {
    return this.expenses.review(data);
  }

  @MessagePattern({ cmd: 'asset_expense_receipt_url' })
  async expenseReceiptUrl(@Payload() data: any) {
    return this.expenses.receiptUrl(data);
  }

  // ============================================
  // CONTRACTS — read one, then propose, then apply
  // ============================================

  @MessagePattern({ cmd: 'asset_contract_read' })
  async contractRead(@Payload() data: any) {
    return this.contracts.read(data);
  }

  @MessagePattern({ cmd: 'asset_contract_preview' })
  async contractPreview(@Payload() data: any) {
    return this.contracts.preview(data);
  }

  /*
    A write, straight to the service like the handover — one person pressing one
    button and watching for the result. It is a transaction either way; a round
    trip through Redis would only add latency to a screen somebody is looking at.
  */
  @MessagePattern({ cmd: 'asset_contract_apply' })
  async contractApply(@Payload() data: any) {
    return this.contracts.apply(data);
  }

  @MessagePattern({ cmd: 'list_asset_rows' })
  async listRows(@Payload() data: any) {
    return this.rows.listRows(data);
  }

  @MessagePattern({ cmd: 'add_asset_row' })
  async addRow(@Payload() data: any) {
    return this.rows.addRow(data);
  }

  @MessagePattern({ cmd: 'update_asset_row' })
  async updateRow(@Payload() data: any) {
    return this.rows.updateRow(data);
  }

  @MessagePattern({ cmd: 'remove_asset_row' })
  async removeRow(@Payload() data: any) {
    return this.rows.removeRow(data);
  }


}
