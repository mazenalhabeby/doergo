/**
 * Base Queue Service
 *
 * Provides common BullMQ job processing pattern for WRITE operations.
 * Extend this class in your gateway queue services to avoid code duplication.
 *
 * @example
 * @Injectable()
 * export class TasksQueueService extends BaseQueueService {
 *   constructor(
 *     @InjectQueue(QUEUE_NAMES.TASKS) queue: Queue,
 *     configService: ConfigService,
 *   ) {
 *     super(queue, configService, QUEUE_NAMES.TASKS, 'TasksQueueService');
 *   }
 *
 *   async createTask(data: Record<string, any>) {
 *     return this.addJobAndWait(TASK_JOB_TYPES.CREATE, data);
 *   }
 * }
 */
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Queue, QueueEvents, Job } from 'bullmq';
import { DEFAULT_JOB_OPTIONS } from './constants';

interface JobError {
  message?: string;
  statusCode?: number;
}

interface ConfigServiceLike {
  get<T = unknown>(propertyPath: string, defaultValue?: T): T | undefined;
}

export abstract class BaseQueueService {
  protected readonly logger: Logger;
  protected readonly queueEvents: QueueEvents;

  constructor(
    protected readonly queue: Queue,
    configService: ConfigServiceLike,
    queueName: string,
    serviceName: string,
  ) {
    this.logger = new Logger(serviceName);

    // Initialize QueueEvents for listening to job completion
    const redisHost = configService.get<string>('REDIS_HOST', 'localhost') || 'localhost';
    const redisPort = configService.get<number>('REDIS_PORT', 6379) || 6379;

    this.queueEvents = new QueueEvents(queueName, {
      connection: {
        host: redisHost,
        port: redisPort,
      },
    });

    this.logger.log(`${serviceName} initialized`);
  }

  /**
   * Add a job to the queue and wait for the result
   * This provides synchronous request-response over async job processing
   */
  protected async addJobAndWait<T>(
    jobType: string,
    data: Record<string, unknown>,
    timeoutMs: number = 30000,
  ): Promise<T> {
    const job = await this.queue.add(jobType, data, {
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
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Job ${job.id} failed: ${error.message}`);

      // Check if job failed or timed out
      const failedJob = await Job.fromId(this.queue, job.id!);
      if (failedJob?.failedReason) {
        // Parse error from worker if it's a structured error
        try {
          const errorData = JSON.parse(failedJob.failedReason) as JobError;
          throw new HttpException(
            errorData.message || failedJob.failedReason,
            errorData.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
          );
        } catch (parseError) {
          // If parsing fails, use the raw error message
          if (parseError instanceof HttpException) throw parseError;
          throw new HttpException(failedJob.failedReason, HttpStatus.INTERNAL_SERVER_ERROR);
        }
      }

      throw new HttpException(
        'Request timed out or failed',
        HttpStatus.REQUEST_TIMEOUT,
      );
    }
  }
}
