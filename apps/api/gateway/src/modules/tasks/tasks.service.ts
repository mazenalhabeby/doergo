import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@doergo/shared';

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
   * Get suggested technicians for a task with scoring
   */
  async getSuggestedTechnicians(data: Record<string, any>) {
    this.logger.debug(`Getting suggested technicians for task ${data.taskId} via direct microservice call`);
    return this.send({ cmd: 'get_suggested_technicians' }, data);
  }
}
