import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { pattern, getAssetReports, getTaskReport, type RpcRequest } from '@hbcfield/shared/microservices';
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

  @MessagePattern(pattern(getTaskReport))
  async findByTaskId(
    @Payload()
    data: RpcRequest<typeof getTaskReport>,
  ) {
    return this.reportRead.findByTaskId(data);
  }

  @MessagePattern(pattern(getAssetReports))
  async findByAssetId(
    @Payload()
    data: RpcRequest<typeof getAssetReports>,
  ) {
    return this.reportRead.findByAssetId(data);
  }
}
