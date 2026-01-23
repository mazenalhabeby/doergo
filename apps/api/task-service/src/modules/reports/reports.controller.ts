import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ReportsService } from './reports.service';

/**
 * Microservice Controller for Report READ Operations
 *
 * Handles direct Redis microservice calls for READ operations only.
 * These don't need BullMQ's exactly-once guarantees.
 *
 * WRITE operations (create, update, addAttachment, addPart, etc.)
 * are handled by ReportsProcessor via BullMQ for exactly-once processing.
 */
@Controller()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ============ READ Operations (Direct Microservice) ============

  @MessagePattern({ cmd: 'get_task_report' })
  async findByTaskId(
    @Payload()
    data: {
      taskId: string;
      userId: string;
      userRole: string;
      organizationId: string;
    },
  ) {
    return this.reportsService.findByTaskId(data);
  }

  @MessagePattern({ cmd: 'get_asset_reports' })
  async findByAssetId(
    @Payload()
    data: {
      assetId: string;
      page?: number;
      limit?: number;
      userId: string;
      userRole: string;
      organizationId: string;
    },
  ) {
    return this.reportsService.findByAssetId(data);
  }
}
