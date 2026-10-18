import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES, TASK_JOBS, BaseQueueService, type JobData } from '@hbcfield/shared';

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
  constructor(@InjectQueue(QUEUE_NAMES.TASKS) tasksQueue: Queue, configService: ConfigService) {
    super(tasksQueue, configService, QUEUE_NAMES.TASKS, TasksQueueService.name);
  }

  // ============ Task Write Operations (BullMQ) ============
  // READ operations (findAll, findOne, getTimeline, getComments) are in TasksService

  async createTask(data: JobData<typeof TASK_JOBS.create>) {
    return this.runJob(TASK_JOBS.create, data);
  }

  async updateTask(data: JobData<typeof TASK_JOBS.update>) {
    return this.runJob(TASK_JOBS.update, data);
  }

  async assignTask(data: JobData<typeof TASK_JOBS.assign>) {
    return this.runJob(TASK_JOBS.assign, data);
  }

  async updateTaskStatus(data: JobData<typeof TASK_JOBS.updateStatus>) {
    return this.runJob(TASK_JOBS.updateStatus, data);
  }

  async declineTask(data: JobData<typeof TASK_JOBS.decline>) {
    return this.runJob(TASK_JOBS.decline, data);
  }

  async deleteTask(data: JobData<typeof TASK_JOBS.remove>) {
    return this.runJob(TASK_JOBS.remove, data);
  }

  // ============ Comment Write Operations (BullMQ) ============

  async addComment(data: JobData<typeof TASK_JOBS.addComment>) {
    return this.runJob(TASK_JOBS.addComment, data);
  }

  async resumeWork(data: JobData<typeof TASK_JOBS.resumeWork>) {
    return this.runJob(TASK_JOBS.resumeWork, data);
  }

  async addHandover(data: JobData<typeof TASK_JOBS.addHandover>) {
    return this.runJob(TASK_JOBS.addHandover, data);
  }

  // ============ A crew on one job ============

  async crewJoin(data: JobData<typeof TASK_JOBS.crewJoin>) {
    return this.runJob(TASK_JOBS.crewJoin, data);
  }

  async crewLeave(data: JobData<typeof TASK_JOBS.crewLeave>) {
    return this.runJob(TASK_JOBS.crewLeave, data);
  }

  async crewSelfIssue(data: JobData<typeof TASK_JOBS.crewSelfIssue>) {
    return this.runJob(TASK_JOBS.crewSelfIssue, data);
  }

  async crewSelfResume(data: JobData<typeof TASK_JOBS.crewSelfResume>) {
    return this.runJob(TASK_JOBS.crewSelfResume, data);
  }

  async crewChangeLead(data: JobData<typeof TASK_JOBS.crewChangeLead>) {
    return this.runJob(TASK_JOBS.crewChangeLead, data);
  }

  // ============ Attachment Operations ============

  async addAttachment(data: JobData<typeof TASK_JOBS.addAttachment>) {
    return this.runJob(TASK_JOBS.addAttachment, data);
  }

  async deleteAttachment(data: JobData<typeof TASK_JOBS.deleteAttachment>) {
    return this.runJob(TASK_JOBS.deleteAttachment, data);
  }

  async getPresignedUrl(data: JobData<typeof TASK_JOBS.getPresignedUrl>) {
    return this.runJob(TASK_JOBS.getPresignedUrl, data);
  }

  // ============ Assignee Operations ============

  async addAssignee(data: JobData<typeof TASK_JOBS.addAssignee>) {
    return this.runJob(TASK_JOBS.addAssignee, data);
  }

  async removeAssignee(data: JobData<typeof TASK_JOBS.removeAssignee>) {
    return this.runJob(TASK_JOBS.removeAssignee, data);
  }

  // ============ Subtask & Dependency Operations ============

  async createSubtask(data: JobData<typeof TASK_JOBS.createSubtask>) {
    return this.runJob(TASK_JOBS.createSubtask, data);
  }

  async addDependency(data: JobData<typeof TASK_JOBS.addDependency>) {
    return this.runJob(TASK_JOBS.addDependency, data);
  }

  async removeDependency(data: JobData<typeof TASK_JOBS.removeDependency>) {
    return this.runJob(TASK_JOBS.removeDependency, data);
  }

  // ============ Checklist Operations ============

  async addChecklistItem(data: JobData<typeof TASK_JOBS.addChecklistItem>) {
    return this.runJob(TASK_JOBS.addChecklistItem, data);
  }

  async updateChecklistItem(data: JobData<typeof TASK_JOBS.updateChecklistItem>) {
    return this.runJob(TASK_JOBS.updateChecklistItem, data);
  }

  async deleteChecklistItem(data: JobData<typeof TASK_JOBS.deleteChecklistItem>) {
    return this.runJob(TASK_JOBS.deleteChecklistItem, data);
  }

  async reorderChecklist(data: JobData<typeof TASK_JOBS.reorderChecklist>) {
    return this.runJob(TASK_JOBS.reorderChecklist, data);
  }
}
