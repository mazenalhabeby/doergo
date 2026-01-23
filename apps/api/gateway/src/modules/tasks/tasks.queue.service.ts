import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES, TASK_JOB_TYPES, BaseQueueService } from '@doergo/shared';

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
export class TasksQueueService extends BaseQueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.TASKS) tasksQueue: Queue,
    configService: ConfigService,
  ) {
    super(tasksQueue, configService, QUEUE_NAMES.TASKS, TasksQueueService.name);
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

  async declineTask(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.DECLINE, data);
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
