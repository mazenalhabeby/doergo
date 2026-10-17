import { Controller, ForbiddenException } from '@nestjs/common';
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
import { AssetProposalService } from './asset-proposal.service';
import { AssetLogService } from './asset-log.service';
import { AssetAccessService } from './asset-access.service';
import { ProposalReviewService } from './proposal-review.service';
import { AssetTypesService } from './asset-types.service';

@Controller()
export class AssetsController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly catalog: AssetCatalogService,
    private readonly assetTypes: AssetTypesService,
    private readonly rows: AssetRowsService,
    private readonly ledger: AssetLedgerService,
    private readonly activity: AssetActivityService,
    private readonly usage: AssetUsageService,
    private readonly custody: AssetCustodyService,
    private readonly expenses: AssetExpenseService,
    private readonly contracts: AssetContractService,
    private readonly proposals: AssetProposalService,
    private readonly proposalReview: ProposalReviewService,
    private readonly logs: AssetLogService,
    private readonly access: AssetAccessService,
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
    return this.assetTypes.findTypesByCategory(data);
  }

  // ============================================
  // ASSETS (READ operations via MessagePattern)
  // ============================================

  @MessagePattern({ cmd: 'find_all_assets' })
  async findAll(@Payload() data: any) {
    return this.assetsService.findAll(data);
  }

  /*
    Which workspace an asset lives in — for the gateway's ModuleGuard only.

    ⚠️ Not `find_asset`. That is a READ on a member's behalf and asks who is
    reading; the guard has no reader to name, so it was refused, the guard fell
    back to the organization's modules, and every asset edit in an organization
    that runs assets per workspace was refused with "not switched on". This
    returns the space id and nothing else, scoped to the organization.
  */
  @MessagePattern({ cmd: 'find_asset_space' })
  async findSpace(@Payload() data: { id: string; organizationId: string }) {
    return this.assetsService.spaceOf(data);
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
    // The bill's counts, every workspace's: an org-wide reader only.
    if (this.access.scope(data, 'view') !== null) {
      throw new ForbiddenException('Only someone who sees every workspace’s assets can read these counts');
    }
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
}
