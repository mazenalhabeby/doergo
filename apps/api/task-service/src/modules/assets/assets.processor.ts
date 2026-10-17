import { Processor } from '@nestjs/bullmq';
import { JobProcessor } from '../../common/queue/job-processor';
import { Job } from 'bullmq';
import { QUEUE_NAMES, ASSET_JOB_TYPES } from '@hbcfield/shared';
import { AssetsService } from './assets.service';
import { AssetCatalogService } from './asset-catalog.service';
import { AssetCreateService } from './asset-create.service';
import { AssetUpdateService } from './asset-update.service';
import { AssetTypesService } from './asset-types.service';

@Processor(QUEUE_NAMES.ASSETS)
export class AssetsProcessor extends JobProcessor {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly assetUpdate: AssetUpdateService,
    private readonly assetCreate: AssetCreateService,
    private readonly catalog: AssetCatalogService,
    private readonly assetTypes: AssetTypesService,
  ) {
    super();
  }

  protected async handleJob(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      // Categories
      case ASSET_JOB_TYPES.CREATE_CATEGORY:
        return this.catalog.createCategory(job.data);

      case ASSET_JOB_TYPES.UPDATE_CATEGORY:
        return this.catalog.updateCategory(job.data);

      case ASSET_JOB_TYPES.DELETE_CATEGORY:
        return this.catalog.deleteCategory(job.data);

      // Types
      case ASSET_JOB_TYPES.CREATE_TYPE:
        return this.assetTypes.createType(job.data);

      case ASSET_JOB_TYPES.UPDATE_TYPE:
        return this.assetTypes.updateType(job.data);

      case ASSET_JOB_TYPES.DELETE_TYPE:
        return this.assetTypes.deleteType(job.data);

      // Assets
      case ASSET_JOB_TYPES.CREATE:
        return this.assetCreate.create(job.data);

      case ASSET_JOB_TYPES.UPDATE:
        return this.assetUpdate.update(job.data);

      case ASSET_JOB_TYPES.DELETE:
        return this.assetsService.delete(job.data);

      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }
}
