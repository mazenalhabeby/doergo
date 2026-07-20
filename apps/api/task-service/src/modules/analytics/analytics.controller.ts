import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AnalyticsService } from './analytics.service';
import { ReportDefinition } from './query-engine';

@Controller()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @MessagePattern({ cmd: 'analytics_catalog' })
  catalog() {
    return this.analytics.getCatalog();
  }

  @MessagePattern({ cmd: 'analytics_run' })
  run(@Payload() data: { organizationId: string; definition: ReportDefinition }) {
    return this.analytics.run(data);
  }

  @MessagePattern({ cmd: 'analytics_list_saved' })
  listSaved(@Payload() data: { organizationId: string; userId: string }) {
    return this.analytics.listSaved(data);
  }

  @MessagePattern({ cmd: 'analytics_create_saved' })
  createSaved(@Payload() data: { organizationId: string; userId: string; name: string; description?: string; config: ReportDefinition; isShared?: boolean }) {
    return this.analytics.createSaved(data);
  }

  @MessagePattern({ cmd: 'analytics_update_saved' })
  updateSaved(@Payload() data: { id: string; organizationId: string; userId: string; name?: string; description?: string; config?: ReportDefinition; isShared?: boolean }) {
    return this.analytics.updateSaved(data);
  }

  @MessagePattern({ cmd: 'analytics_delete_saved' })
  deleteSaved(@Payload() data: { id: string; organizationId: string }) {
    return this.analytics.deleteSaved(data);
  }
}
