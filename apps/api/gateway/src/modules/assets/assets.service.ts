import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@doergo/shared';

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

  async getMaintenanceHistory(data: Record<string, any>) {
    return this.send({ cmd: 'get_asset_maintenance_history' }, data);
  }
}
