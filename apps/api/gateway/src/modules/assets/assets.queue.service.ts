import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES, ASSET_JOB_TYPES, BaseQueueService } from '@doergo/shared';

@Injectable()
export class AssetsQueueService extends BaseQueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.ASSETS) assetsQueue: Queue,
    configService: ConfigService,
  ) {
    super(assetsQueue, configService, QUEUE_NAMES.ASSETS, AssetsQueueService.name);
  }

  // Categories
  async createCategory(data: Record<string, any>) {
    return this.addJobAndWait(ASSET_JOB_TYPES.CREATE_CATEGORY, data);
  }

  async updateCategory(data: Record<string, any>) {
    return this.addJobAndWait(ASSET_JOB_TYPES.UPDATE_CATEGORY, data);
  }

  async deleteCategory(data: Record<string, any>) {
    return this.addJobAndWait(ASSET_JOB_TYPES.DELETE_CATEGORY, data);
  }

  // Types
  async createType(data: Record<string, any>) {
    return this.addJobAndWait(ASSET_JOB_TYPES.CREATE_TYPE, data);
  }

  async updateType(data: Record<string, any>) {
    return this.addJobAndWait(ASSET_JOB_TYPES.UPDATE_TYPE, data);
  }

  async deleteType(data: Record<string, any>) {
    return this.addJobAndWait(ASSET_JOB_TYPES.DELETE_TYPE, data);
  }

  // Assets
  async create(data: Record<string, any>) {
    return this.addJobAndWait(ASSET_JOB_TYPES.CREATE, data);
  }

  async update(data: Record<string, any>) {
    return this.addJobAndWait(ASSET_JOB_TYPES.UPDATE, data);
  }

  async delete(data: Record<string, any>) {
    return this.addJobAndWait(ASSET_JOB_TYPES.DELETE, data);
  }
}
