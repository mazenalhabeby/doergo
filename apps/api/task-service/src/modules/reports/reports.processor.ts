import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, REPORT_JOB_TYPES } from '@doergo/shared';
import { ReportsService } from './reports.service';

/**
 * BullMQ Processor for Reports Queue
 *
 * Handles WRITE report jobs with exactly-once processing semantics.
 * Each job type is routed to the appropriate service method.
 *
 * NOTE: READ operations (findByTaskId, findByAssetId) are handled
 * via direct microservice communication (MessagePattern) for better performance.
 * Only WRITE operations go through BullMQ for exactly-once guarantees.
 */
@Processor(QUEUE_NAMES.REPORTS)
export class ReportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportsProcessor.name);

  constructor(private readonly reportsService: ReportsService) {
    super();
  }

  /**
   * Process incoming jobs from the queue
   * Routes each job to the appropriate handler based on job name
   */
  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.debug(`Processing job ${job.id}: ${job.name}`);

    try {
      const result = await this.handleJob(job);
      this.logger.debug(`Job ${job.id} completed successfully`);
      return result;
    } catch (error) {
      this.logger.error(`Job ${job.id} failed: ${error.message}`);
      // Throw structured error for gateway to parse
      throw new Error(
        JSON.stringify({
          message: error.message,
          statusCode: error.status || error.statusCode || 500,
        }),
      );
    }
  }

  /**
   * Route job to appropriate handler based on job name
   */
  private async handleJob(job: Job<any, any, string>): Promise<any> {
    const { name, data } = job;

    switch (name) {
      // ============ Report Write Operations ============
      case REPORT_JOB_TYPES.CREATE:
        return this.reportsService.create(data);

      case REPORT_JOB_TYPES.UPDATE:
        return this.reportsService.update(data);

      // ============ Attachment Operations ============
      case REPORT_JOB_TYPES.ADD_ATTACHMENT:
        return this.reportsService.addAttachment(data);

      case REPORT_JOB_TYPES.DELETE_ATTACHMENT:
        return this.reportsService.deleteAttachment(data);

      case REPORT_JOB_TYPES.GET_PRESIGNED_URL:
        return this.reportsService.getPresignedUrl(data);

      // ============ Parts Operations ============
      case REPORT_JOB_TYPES.ADD_PART:
        return this.reportsService.addPart(data);

      case REPORT_JOB_TYPES.UPDATE_PART:
        return this.reportsService.updatePart(data);

      case REPORT_JOB_TYPES.DELETE_PART:
        return this.reportsService.deletePart(data);

      default:
        this.logger.warn(`Unknown job type: ${name}`);
        throw new Error(`Unknown job type: ${name}`);
    }
  }
}
