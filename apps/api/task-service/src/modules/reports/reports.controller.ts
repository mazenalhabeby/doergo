import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ReportReadService } from './report-read.service';

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
  constructor(private readonly reportRead: ReportReadService) {}

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
    return this.reportRead.findByTaskId(data);
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
      canViewAllTasks?: boolean;
      organizationId: string;
    },
  ) {
    return this.reportRead.findByAssetId(data);
  }
}
