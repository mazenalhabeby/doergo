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

  async structure(data: Record<string, any>) {
    return this.send({ cmd: 'asset_structure' }, data);
  }

  async setParent(data: Record<string, any>) {
    return this.send({ cmd: 'set_asset_parent' }, data);
  }
}
