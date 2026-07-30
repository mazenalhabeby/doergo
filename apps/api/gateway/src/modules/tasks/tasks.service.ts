import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

/**
 * Service for direct microservice communication with task-service
 *
 * Used for READ operations (findAll, findOne, getTimeline, getComments)
 * which don't need BullMQ's exactly-once processing guarantees.
 *
 * WRITE operations (create, update, delete, assign, updateStatus, addComment)
 * still use TasksQueueService for exactly-once processing.
 */
@Injectable()
export class TasksService extends BaseGatewayService {
  constructor(
    @Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy,
  ) {
    super(taskClient, TasksService.name);
  }

  // ============ Read Operations (Direct Microservice) ============

  /**
   * Get all tasks with pagination and filters
   */
  async findAll(data: Record<string, any>) {
    this.logger.debug('Finding all tasks via direct microservice call');
    return this.send({ cmd: 'find_all_tasks' }, data);
  }

  /**
   * Get a single task by ID
   */
  async findOne(data: Record<string, any>) {
    this.logger.debug(`Finding task ${data.id} via direct microservice call`);
    return this.send({ cmd: 'find_task' }, data);
  }

  /**
   * Get task timeline/activity
   */
  async getTimeline(data: Record<string, any>) {
    this.logger.debug(`Getting timeline for task ${data.id} via direct microservice call`);
    return this.send({ cmd: 'get_task_timeline' }, data);
  }

  /**
   * Get task comments
   */
  async getComments(data: Record<string, any>) {
    this.logger.debug(`Getting comments for task ${data.taskId} via direct microservice call`);
    return this.send({ cmd: 'get_comments' }, data);
  }

  /**
   * Get task counts grouped by status
   */
  async getStatusCounts(data: Record<string, any>) {
    this.logger.debug('Getting status counts via direct microservice call');
    return this.send({ cmd: 'get_status_counts' }, data);
  }

  /**
   * Get suggested employees for a task with scoring
   */
  async getSuggestedEmployees(data: Record<string, any>) {
    this.logger.debug(`Getting suggested employees for task ${data.taskId} via direct microservice call`);
    return this.send({ cmd: 'get_suggested_technicians' }, data);
  }

  /**
   * Get task attachments
   */
  async getAttachments(data: Record<string, any>) {
    this.logger.debug(`Getting attachments for task ${data.taskId} via direct microservice call`);
    return this.send({ cmd: 'get_attachments' }, data);
  }

  /**
   * Get subtasks of a task
   */
  async getSubtasks(data: Record<string, any>) {
    this.logger.debug(`Getting subtasks for task ${data.taskId} via direct microservice call`);
    return this.send({ cmd: 'get_subtasks' }, data);
  }

  /**
   * Get task assignees
   */
  async getAssignees(data: Record<string, any>) {
    this.logger.debug(`Getting assignees for task ${data.taskId} via direct microservice call`);
    return this.send({ cmd: 'get_task_assignees' }, data);
  }

  /**
   * Get task checklist items
   */
  async getChecklist(data: Record<string, any>) {
    this.logger.debug(`Getting checklist for task ${data.taskId} via direct microservice call`);
    return this.send({ cmd: 'get_task_checklist' }, data);
  }

  /**
   * Re-sync every task in a space onto that space's workflow (admin maintenance).
   */
  async resyncSpaceWorkflow(data: { spaceId: string; organizationId: string }) {
    this.logger.debug(`Re-syncing tasks for space ${data.spaceId} to its workflow`);
    return this.send({ cmd: 'resync_space_workflow' }, data);
  }
}
