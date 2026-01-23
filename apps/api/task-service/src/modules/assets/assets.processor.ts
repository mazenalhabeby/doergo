import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, ASSET_JOB_TYPES } from '@doergo/shared';
import { AssetsService } from './assets.service';

@Processor(QUEUE_NAMES.ASSETS)
export class AssetsProcessor extends WorkerHost {
  private readonly logger = new Logger(AssetsProcessor.name);

  constructor(private readonly assetsService: AssetsService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing job ${job.id} of type ${job.name}`);

    try {
      return await this.handleJob(job);
    } catch (error) {
      this.logger.error(`Job ${job.id} failed: ${error.message}`);
      // Wrap error for gateway parsing
      throw new Error(
        JSON.stringify({
          message: error.message,
          statusCode: error.status || 500,
        }),
      );
    }
  }

  private async handleJob(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      // Categories
      case ASSET_JOB_TYPES.CREATE_CATEGORY:
        return this.assetsService.createCategory(job.data);

      case ASSET_JOB_TYPES.UPDATE_CATEGORY:
        return this.assetsService.updateCategory(job.data);

      case ASSET_JOB_TYPES.DELETE_CATEGORY:
        return this.assetsService.deleteCategory(job.data);

      // Types
      case ASSET_JOB_TYPES.CREATE_TYPE:
        return this.assetsService.createType(job.data);

      case ASSET_JOB_TYPES.UPDATE_TYPE:
        return this.assetsService.updateType(job.data);

      case ASSET_JOB_TYPES.DELETE_TYPE:
        return this.assetsService.deleteType(job.data);

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
