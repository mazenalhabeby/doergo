import { WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { buildJobError } from '@hbcfield/shared';

/**
 * A BullMQ processor: run the job, and turn a failure into the structured error
 * the gateway parses — a 4xx becomes an UnrecoverableError, so a deterministic
 * business refusal is not retried three times (H3).
 *
 * Six processors carried this wrapper word for word. A subclass names its queue
 * with `@Processor(...)` and routes jobs in `handleJob`; the logging and the
 * error contract live here once.
 */
export abstract class JobProcessor extends WorkerHost {
  protected readonly logger = new Logger(this.constructor.name);

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);
    try {
      return await this.handleJob(job);
    } catch (error: any) {
      this.logger.error(`Job ${job.id} failed: ${error?.message}`, error?.stack);
      throw buildJobError(error);
    }
  }

  /** Route the job by `job.name` to the service method that does the work. */
  protected abstract handleJob(job: Job<any, any, string>): Promise<any>;
}
