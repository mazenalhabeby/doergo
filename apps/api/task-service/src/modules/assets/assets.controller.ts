import { Controller, ForbiddenException } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  pattern,
  addAssetActivity,
  assetBillingUsage,
  findAllAssetCategories,
  findAllAssets,
  findAsset,
  findAssetSpace,
  findTypesByCategory,
  getAssetMaintenanceHistory,
  listAssetActivities,
  listOrphanAssets,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
import { AssetsService } from './assets.service';
import { AssetCatalogService } from './asset-catalog.service';
import { AssetActivityService } from './asset-activity.service';
import { AssetUsageService } from './asset-usage.service';
import { AssetAccessService } from './asset-access.service';
import { AssetTypesService } from './asset-types.service';

@Controller()
export class AssetsController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly catalog: AssetCatalogService,
    private readonly assetTypes: AssetTypesService,
    private readonly activity: AssetActivityService,
    private readonly usage: AssetUsageService,
    private readonly access: AssetAccessService,
  ) {}

  // ============================================
  // CATEGORIES (READ operations via MessagePattern)
  // ============================================

  @MessagePattern(pattern(findAllAssetCategories))
  async findAllCategories(@Payload() data: RpcRequest<typeof findAllAssetCategories>) {
    return this.catalog.findAllCategories(data);
  }

  // ============================================
  // TYPES (READ operations via MessagePattern)
  // ============================================

  @MessagePattern(pattern(findTypesByCategory))
  async findTypesByCategory(@Payload() data: RpcRequest<typeof findTypesByCategory>) {
    return this.assetTypes.findTypesByCategory(data);
  }

  // ============================================
  // ASSETS (READ operations via MessagePattern)
  // ============================================

  @MessagePattern(pattern(findAllAssets))
  async findAll(@Payload() data: RpcRequest<typeof findAllAssets>) {
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
  @MessagePattern(pattern(findAssetSpace))
  async findSpace(@Payload() data: RpcRequest<typeof findAssetSpace>) {
    return this.assetsService.spaceOf(data);
  }

  @MessagePattern(pattern(findAsset))
  async findOne(@Payload() data: RpcRequest<typeof findAsset>) {
    return this.assetsService.findOne(data);
  }

  /** Assets in no space — invisible on every screen, still on the bill. */
  @MessagePattern(pattern(listOrphanAssets))
  async listOrphans(@Payload() data: RpcRequest<typeof listOrphanAssets>) {
    return this.assetsService.listOrphans(data);
  }

  /** Billable assets per space — the counts only; pricing is shared. */
  @MessagePattern(pattern(assetBillingUsage))
  async billingUsage(@Payload() data: RpcRequest<typeof assetBillingUsage>) {
    // The bill's counts, every workspace's: an org-wide reader only.
    if (this.access.scope(data, 'view') !== null) {
      throw new ForbiddenException('Only someone who sees every workspace’s assets can read these counts');
    }
    return this.usage.count(data.organizationId);
  }

  @MessagePattern(pattern(getAssetMaintenanceHistory))
  async getMaintenanceHistory(@Payload() data: RpcRequest<typeof getAssetMaintenanceHistory>) {
    return this.assetsService.getMaintenanceHistory(data);
  }

  @MessagePattern(pattern(listAssetActivities))
  async listActivities(@Payload() data: RpcRequest<typeof listAssetActivities>) {
    return this.activity.listActivities(data);
  }

  @MessagePattern(pattern(addAssetActivity))
  async addActivity(@Payload() data: RpcRequest<typeof addAssetActivity>) {
    return this.activity.addActivity(data);
  }
}
