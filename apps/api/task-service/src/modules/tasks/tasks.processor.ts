import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, TASK_JOB_TYPES } from '@hbcfield/shared';
import { TasksService } from './tasks.service';
import { AttachmentsService } from '../attachments/attachments.service';

/**
 * BullMQ Processor for Task Queue
 *
 * Handles WRITE task jobs with exactly-once processing semantics.
 * Each job type is routed to the appropriate service method.
 *
 * NOTE: READ operations (findAll, findOne, getTimeline, getComments, getAttachments)
 * are handled via direct microservice communication (MessagePattern) for better performance.
 * Only WRITE operations go through BullMQ for exactly-once guarantees.
 */
@Processor(QUEUE_NAMES.TASKS)
export class TasksProcessor extends WorkerHost {
  private readonly logger = new Logger(TasksProcessor.name);

  constructor(
    private readonly tasksService: TasksService,
    private readonly attachmentsService: AttachmentsService,
  ) {
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
      // ============ Task Write Operations ============
      // READ operations (findAll, findOne, getTimeline, getComments) use direct microservice calls
      case TASK_JOB_TYPES.CREATE:
        return this.tasksService.create(data);

      case TASK_JOB_TYPES.UPDATE:
        return this.tasksService.update(data);

      case TASK_JOB_TYPES.ASSIGN:
        return this.tasksService.assign(data);

      case TASK_JOB_TYPES.DECLINE:
        return this.tasksService.decline(data);

      case TASK_JOB_TYPES.UPDATE_STATUS:
        return this.tasksService.updateStatus(data);

      case TASK_JOB_TYPES.DELETE:
        return this.tasksService.remove(data);

      // ============ Comment Write Operations ============
      case TASK_JOB_TYPES.ADD_COMMENT:
        return this.tasksService.addComment(data);

      // ============ Attachment Write Operations ============
      case TASK_JOB_TYPES.ADD_ATTACHMENT:
        return this.attachmentsService.create(data);

      case TASK_JOB_TYPES.DELETE_ATTACHMENT:
        return this.attachmentsService.remove(data);

      case TASK_JOB_TYPES.GET_PRESIGNED_URL:
        return this.attachmentsService.getPresignedUrl(data);

      // ============ Avatar S3 Operations ============
      case TASK_JOB_TYPES.AVATAR_PRESIGNED_URL:
        return this.attachmentsService.getAvatarPresignedUrl(data);

      case TASK_JOB_TYPES.AVATAR_DELETE_S3:
        return this.attachmentsService.deleteAvatarFromS3(data);

      default:
        this.logger.warn(`Unknown job type: ${name}`);
        throw new Error(`Unknown job type: ${name}`);
    }
  }
}
