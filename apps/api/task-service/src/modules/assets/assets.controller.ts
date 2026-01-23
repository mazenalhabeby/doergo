import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AssetsService } from './assets.service';

@Controller()
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  // ============================================
  // CATEGORIES (READ operations via MessagePattern)
  // ============================================

  @MessagePattern({ cmd: 'find_all_asset_categories' })
  async findAllCategories(@Payload() data: any) {
    return this.assetsService.findAllCategories(data);
  }

  // ============================================
  // TYPES (READ operations via MessagePattern)
  // ============================================

  @MessagePattern({ cmd: 'find_types_by_category' })
  async findTypesByCategory(@Payload() data: any) {
    return this.assetsService.findTypesByCategory(data);
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

  @MessagePattern({ cmd: 'get_asset_maintenance_history' })
  async getMaintenanceHistory(@Payload() data: any) {
    return this.assetsService.getMaintenanceHistory(data);
  }
}
