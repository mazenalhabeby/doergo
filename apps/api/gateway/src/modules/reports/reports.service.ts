import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@doergo/shared';

/**
 * Service for direct microservice communication with task-service for Reports
 *
 * Used for READ operations (getTaskReport, getAssetReports)
 * which don't need BullMQ's exactly-once processing guarantees.
 *
 * WRITE operations (create, update, addAttachment, addPart, etc.)
 * still use ReportsQueueService for exactly-once processing.
 */
@Injectable()
export class ReportsService extends BaseGatewayService {
  constructor(
    @Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy,
  ) {
    super(taskClient, ReportsService.name);
  }

  // ============ Read Operations (Direct Microservice) ============

  /**
   * Get service report for a task
   */
  async getTaskReport(data: {
    taskId: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.logger.debug(`Getting report for task ${data.taskId} via direct microservice call`);
    return this.send({ cmd: 'get_task_report' }, data);
  }

  /**
   * Get all service reports for an asset (maintenance history)
   */
  async getAssetReports(data: {
    assetId: string;
    page?: number;
    limit?: number;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.logger.debug(`Getting reports for asset ${data.assetId} via direct microservice call`);
    return this.send({ cmd: 'get_asset_reports' }, data);
  }
}
