import { Injectable, Inject, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES } from '@doergo/shared';
import { firstValueFrom, timeout, catchError } from 'rxjs';

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
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private readonly TIMEOUT_MS = 10000; // 10 second timeout for read operations

  constructor(
    @Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy,
  ) {}

  /**
   * Send a message to task-service and wait for response
   */
  private async send<T>(pattern: { cmd: string }, data: any): Promise<T> {
    try {
      const result = await firstValueFrom(
        this.taskClient.send<T>(pattern, data).pipe(
          timeout(this.TIMEOUT_MS),
          catchError((error) => {
            this.logger.error(`Task service error: ${error.message}`);
            throw error;
          }),
        ),
      );
      return result;
    } catch (error) {
      if (error.name === 'TimeoutError') {
        throw new HttpException('Task service timeout', HttpStatus.REQUEST_TIMEOUT);
      }
      // Re-throw HTTP exceptions from task-service
      if (error.status && error.message) {
        throw new HttpException(error.message, error.status);
      }
      throw new HttpException(
        error.message || 'Task service error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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
