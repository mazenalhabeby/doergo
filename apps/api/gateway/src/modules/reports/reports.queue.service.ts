import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES, REPORT_JOB_TYPES, BaseQueueService } from '@doergo/shared';

/**
 * Service for managing report-related WRITE jobs via BullMQ
 *
 * This service provides exactly-once job processing with synchronous request-response.
 * Jobs are added to the queue and we wait for completion using QueueEvents.
 *
 * IMPORTANT: Only WRITE operations (create, update, addAttachment, addPart, etc.)
 * use this queue service. READ operations (getTaskReport, getAssetReports)
 * use ReportsService for direct microservice communication (faster, no queue overhead).
 */
@Injectable()
export class ReportsQueueService extends BaseQueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.REPORTS) reportsQueue: Queue,
    configService: ConfigService,
  ) {
    super(reportsQueue, configService, QUEUE_NAMES.REPORTS, ReportsQueueService.name);
  }

  // ============ Report Write Operations (BullMQ) ============

  /**
   * Complete a task with a service report
   */
  async completeTask(data: Record<string, any>) {
    return this.addJobAndWait(REPORT_JOB_TYPES.CREATE, data);
  }

  /**
   * Update an existing report
   */
  async updateReport(data: Record<string, any>) {
    return this.addJobAndWait(REPORT_JOB_TYPES.UPDATE, data);
  }

  // ============ Attachment Operations ============

  /**
   * Add an attachment to a report
   */
  async addAttachment(data: Record<string, any>) {
    return this.addJobAndWait(REPORT_JOB_TYPES.ADD_ATTACHMENT, data);
  }

  /**
   * Delete an attachment from a report
   */
  async deleteAttachment(data: Record<string, any>) {
    return this.addJobAndWait(REPORT_JOB_TYPES.DELETE_ATTACHMENT, data);
  }

  /**
   * Get presigned URL for uploading attachment
   */
  async getPresignedUrl(data: Record<string, any>) {
    return this.addJobAndWait(REPORT_JOB_TYPES.GET_PRESIGNED_URL, data);
  }

  // ============ Parts Operations ============

  /**
   * Add a part to a report
   */
  async addPart(data: Record<string, any>) {
    return this.addJobAndWait(REPORT_JOB_TYPES.ADD_PART, data);
  }

  /**
   * Update a part on a report
   */
  async updatePart(data: Record<string, any>) {
    return this.addJobAndWait(REPORT_JOB_TYPES.UPDATE_PART, data);
  }

  /**
   * Delete a part from a report
   */
  async deletePart(data: Record<string, any>) {
    return this.addJobAndWait(REPORT_JOB_TYPES.DELETE_PART, data);
  }
}
