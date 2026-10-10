import { Processor } from '@nestjs/bullmq';
import { JobProcessor } from '../../common/queue/job-processor';
import { Job } from 'bullmq';
import { QUEUE_NAMES, ASSET_JOB_TYPES } from '@hbcfield/shared';
import { AssetsService } from './assets.service';
import { AssetCatalogService } from './asset-catalog.service';

@Processor(QUEUE_NAMES.ASSETS)
export class AssetsProcessor extends JobProcessor {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly catalog: AssetCatalogService,
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
        return this.catalog.createType(job.data);

      case ASSET_JOB_TYPES.UPDATE_TYPE:
        return this.catalog.updateType(job.data);

      case ASSET_JOB_TYPES.DELETE_TYPE:
        return this.catalog.deleteType(job.data);

      // Assets
      case ASSET_JOB_TYPES.CREATE:
        return this.assetsService.create(job.data);

      case ASSET_JOB_TYPES.UPDATE:
        return this.assetsService.update(job.data);

      case ASSET_JOB_TYPES.DELETE:
        return this.assetsService.delete(job.data);

      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }
}
