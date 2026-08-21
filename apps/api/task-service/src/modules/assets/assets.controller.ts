import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AssetsService } from './assets.service';
import { AssetCatalogService } from './asset-catalog.service';
import { AssetRowsService } from './asset-rows.service';
import { AssetLedgerService } from './asset-ledger.service';
import { AssetActivityService } from './asset-activity.service';
import { AssetUsageService } from './asset-usage.service';

@Controller()
export class AssetsController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly catalog: AssetCatalogService,
    private readonly rows: AssetRowsService,
    private readonly ledger: AssetLedgerService,
    private readonly activity: AssetActivityService,
    private readonly usage: AssetUsageService,
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
