import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, QueueEvents, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES, TASK_JOB_TYPES, DEFAULT_JOB_OPTIONS } from '@doergo/shared';

/**
 * Service for managing task-related WRITE jobs via BullMQ
 *
 * This service provides exactly-once job processing with synchronous request-response.
 * Jobs are added to the queue and we wait for completion using QueueEvents.
 *
 * IMPORTANT: Only WRITE operations (create, update, delete, assign, updateStatus, addComment)
 * use this queue service. READ operations (findAll, findOne, getTimeline, getComments)
 * use TasksService for direct microservice communication (faster, no queue overhead).
 */
@Injectable()
export class TasksQueueService {
  private readonly logger = new Logger(TasksQueueService.name);
  private queueEvents: QueueEvents;

  constructor(
    @InjectQueue(QUEUE_NAMES.TASKS) private readonly tasksQueue: Queue,
    private readonly configService: ConfigService,
  ) {
    // Initialize QueueEvents for listening to job completion
    const redisHost = this.configService.get('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get('REDIS_PORT', 6379);

    this.queueEvents = new QueueEvents(QUEUE_NAMES.TASKS, {
      connection: {
        host: redisHost,
        port: redisPort,
      },
    });

    this.logger.log('TasksQueueService initialized');
  }

  /**
   * Add a job to the queue and wait for the result
   * This provides synchronous request-response over async job processing
   */
  private async addJobAndWait<T>(
    jobType: string,
    data: Record<string, any>,
    timeoutMs: number = 30000,
  ): Promise<T> {
    const job = await this.tasksQueue.add(jobType, data, {
      ...DEFAULT_JOB_OPTIONS.CRITICAL,
      // Add unique job ID to prevent duplicates from rapid retries
      jobId: `${jobType}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    });

    this.logger.debug(`Job ${job.id} added to queue: ${jobType}`);

    try {
      // Wait for job completion with timeout
      const result = await job.waitUntilFinished(this.queueEvents, timeoutMs);
      this.logger.debug(`Job ${job.id} completed successfully`);
      return result as T;
    } catch (error) {
      this.logger.error(`Job ${job.id} failed: ${error.message}`);

      // Check if job failed or timed out
      const failedJob = await Job.fromId(this.tasksQueue, job.id!);
      if (failedJob?.failedReason) {
        // Parse error from worker if it's a structured error
        try {
          const errorData = JSON.parse(failedJob.failedReason);
          throw new HttpException(
            errorData.message || failedJob.failedReason,
            errorData.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
          );
        } catch {
          throw new HttpException(failedJob.failedReason, HttpStatus.INTERNAL_SERVER_ERROR);
        }
      }

      throw new HttpException(
        'Request timed out or failed',
        HttpStatus.REQUEST_TIMEOUT,
      );
    }
  }

  // ============ Task Write Operations (BullMQ) ============
  // READ operations (findAll, findOne, getTimeline, getComments) are in TasksService

  async createTask(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.CREATE, data);
  }

  async updateTask(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.UPDATE, data);
  }

  async assignTask(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.ASSIGN, data);
  }

  async updateTaskStatus(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.UPDATE_STATUS, data);
  }

  async deleteTask(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.DELETE, data);
  }

  // ============ Comment Write Operations (BullMQ) ============

  async addComment(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.ADD_COMMENT, data);
  }

  // ============ Attachment Operations ============

  async addAttachment(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.ADD_ATTACHMENT, data);
  }

  async getAttachments(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.GET_ATTACHMENTS, data);
  }

  async deleteAttachment(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.DELETE_ATTACHMENT, data);
  }

  async getPresignedUrl(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.GET_PRESIGNED_URL, data);
  }
}
