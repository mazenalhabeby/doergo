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
}
