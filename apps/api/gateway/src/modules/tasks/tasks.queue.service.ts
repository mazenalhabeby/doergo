import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES, TASK_JOB_TYPES, BaseQueueService } from '@hbcfield/shared';

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

  async deleteAttachment(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.DELETE_ATTACHMENT, data);
  }

  async getPresignedUrl(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.GET_PRESIGNED_URL, data);
  }

  // ============ Avatar S3 Operations ============

  async getAvatarPresignedUrl(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.AVATAR_PRESIGNED_URL, data);
  }

  async deleteAvatarFromS3(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.AVATAR_DELETE_S3, data);
  }

  // ============ Assignee Operations ============

  async addAssignee(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.ADD_ASSIGNEE, data);
  }

  async removeAssignee(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.REMOVE_ASSIGNEE, data);
  }

  // ============ Subtask & Dependency Operations ============

  async createSubtask(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.CREATE_SUBTASK, data);
  }

  async addDependency(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.ADD_DEPENDENCY, data);
  }

  async removeDependency(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.REMOVE_DEPENDENCY, data);
  }

  // ============ Checklist Operations ============

  async addChecklistItem(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.ADD_CHECKLIST_ITEM, data);
  }

  async updateChecklistItem(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.UPDATE_CHECKLIST_ITEM, data);
  }

  async deleteChecklistItem(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.DELETE_CHECKLIST_ITEM, data);
  }

  async reorderChecklist(data: Record<string, any>) {
    return this.addJobAndWait(TASK_JOB_TYPES.REORDER_CHECKLIST, data);
  }
}
