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
import { sanitizeErrorMessage } from '../api/prisma-error';
import { idempotentJobId } from './idempotency-context';

interface JobError {
  message?: string;
  statusCode?: number;
  /** Machine-readable reason (e.g. TASK_STATE_CONFLICT) for the client's language. */
  code?: string;
  /** Structured detail, e.g. the server's current version of an entity on a conflict. */
  params?: Record<string, unknown>;
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
    // Password (H14): omitted unless set, so open dev Redis still connects.
    const redisPassword = configService.get<string>('REDIS_PASSWORD') || undefined;

    this.queueEvents = new QueueEvents(queueName, {
      connection: {
        host: redisHost,
        port: redisPort,
        ...(redisPassword ? { password: redisPassword } : {}),
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
    const idempotentId = idempotentJobId(jobType);
    if (idempotentId) {
      /*
        ⚠️ Re-adding an id BullMQ still holds returns that job as it is. A
        FINISHED one is exactly what a retry wants (its answer); a FAILED one
        would hand back the same failure for a day — so a transient error could
        never be retried. The failed attempt is removed and the work runs again.
      */
      const previous = await Job.fromId(this.queue, idempotentId);
      if (previous && (await previous.isFailed())) await previous.remove().catch(() => undefined);
    }
    const job = await this.queue.add(jobType, data, {
      ...DEFAULT_JOB_OPTIONS.CRITICAL,
      /*
        A request with an Idempotency-Key gets a job id derived from it, so a
        retry after a timed-out wait JOINS the job still running (or finished)
        rather than running the write again. Without a key, every call is a
        distinct job, as before.
      */
      jobId: idempotentId ?? `${jobType}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
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
          // Scrub raw Prisma dumps that a processor may have thrown unguarded, so
          // clean text (not "Unique constraint failed on the fields: …") reaches
          // the toast. Intentional messages pass through unchanged.
          const clean = sanitizeErrorMessage(
            errorData.message || failedJob.failedReason,
            errorData.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
          );
          // The code and detail survive the queue — a phone told only "conflict"
          // in English cannot say which conflict, in the member's language.
          throw new HttpException(
            {
              message: clean.message,
              statusCode: clean.status,
              ...(errorData.code ? { code: errorData.code } : {}),
              ...(errorData.params && typeof errorData.params === 'object' ? { params: errorData.params } : {}),
            },
            clean.status,
          );
        } catch (parseError) {
          // If parsing fails, the raw error message IS the failedReason — sanitize it.
          if (parseError instanceof HttpException) throw parseError;
          const clean = sanitizeErrorMessage(failedJob.failedReason, HttpStatus.INTERNAL_SERVER_ERROR);
          throw new HttpException(clean.message, clean.status);
        }
      }

      throw new HttpException(
        'Request timed out or failed',
        HttpStatus.REQUEST_TIMEOUT,
      );
    }
  }
}
