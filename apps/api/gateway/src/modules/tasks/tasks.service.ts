import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
  pattern,
  type RpcRequest,
  roleTasksOpenForMe,
  roleTaskTake,
  roleTaskReturn,
  roleTaskSetOpen,
  roleTaskOptions,
  roleTaskPreview,
  roleTaskStats,
  findAllTasks,
  findTask,
  getTaskSubmissions,
  taskFullReport,
  getTaskTimeline,
  getTaskTime,
  getJobTimeReport,
  getMyHandovers,
  getComments,
  getStatusCounts,
  getSuggestedTechnicians,
  getAttachments,
  getSubtasks,
  getTaskAssignees,
  getTaskChecklist,
  resyncSpaceWorkflow,
  resyncAllSpaces,
} from '@hbcfield/shared/microservices';

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
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, TasksService.name);
  }

  // ============ Read Operations (Direct Microservice) ============

  // ── A task open to a WORK role (shared tasks/role-pool.ts) ──
  roleTasksOpenForMe(data: RpcRequest<typeof roleTasksOpenForMe>) {
    return this.send(pattern(roleTasksOpenForMe), data);
  }
  roleTaskTake(data: RpcRequest<typeof roleTaskTake>) {
    return this.send(pattern(roleTaskTake), data);
  }
  roleTaskReturn(data: RpcRequest<typeof roleTaskReturn>) {
    return this.send(pattern(roleTaskReturn), data);
  }
  roleTaskSetOpen(data: RpcRequest<typeof roleTaskSetOpen>) {
    return this.send(pattern(roleTaskSetOpen), data);
  }
  roleTaskOptions(data: RpcRequest<typeof roleTaskOptions>) {
    return this.send(pattern(roleTaskOptions), data);
  }
  roleTaskPreview(data: RpcRequest<typeof roleTaskPreview>) {
    return this.send(pattern(roleTaskPreview), data);
  }
  roleTaskStats(data: RpcRequest<typeof roleTaskStats>) {
    return this.send(pattern(roleTaskStats), data);
  }

  /**
   * Get all tasks with pagination and filters
   */
  async findAll(data: RpcRequest<typeof findAllTasks>) {
    this.logger.debug('Finding all tasks via direct microservice call');
    return this.send(pattern(findAllTasks), data);
  }

  /**
   * Get a single task by ID
   */
  async findOne(data: RpcRequest<typeof findTask>) {
    this.logger.debug(`Finding task ${data.id} via direct microservice call`);
    return this.send(pattern(findTask), data);
  }

  /**
   * The step-form submissions of one task (its reports)
   */
  async getSubmissions(data: RpcRequest<typeof getTaskSubmissions>) {
    return this.send(pattern(getTaskSubmissions), data);
  }

  /** The full report for one job (shared tasks/task-report.ts). */
  async fullReport(data: RpcRequest<typeof taskFullReport>) {
    return this.send(pattern(taskFullReport), data);
  }

  /**
   * Get task timeline/activity
   */
  async getTimeline(data: RpcRequest<typeof getTaskTimeline>) {
    this.logger.debug(`Getting timeline for task ${data.id} via direct microservice call`);
    return this.send(pattern(getTaskTimeline), data);
  }

  /**
   * Get task comments
   */
  async jobTime(data: RpcRequest<typeof getTaskTime>) {
    return this.send(pattern(getTaskTime), data);
  }

  async jobTimeReport(data: RpcRequest<typeof getJobTimeReport>) {
    return this.send(pattern(getJobTimeReport), data);
  }

  async myHandovers(data: RpcRequest<typeof getMyHandovers>) {
    return this.send(pattern(getMyHandovers), data);
  }

  async getComments(data: RpcRequest<typeof getComments>) {
    this.logger.debug(`Getting comments for task ${data.taskId} via direct microservice call`);
    return this.send(pattern(getComments), data);
  }

  /**
   * Get task counts grouped by status
   */
  async getStatusCounts(data: RpcRequest<typeof getStatusCounts>) {
    this.logger.debug('Getting status counts via direct microservice call');
    return this.send(pattern(getStatusCounts), data);
  }

  /**
   * Get suggested employees for a task with scoring
   */
  async getSuggestedEmployees(data: RpcRequest<typeof getSuggestedTechnicians>) {
    this.logger.debug(`Getting suggested employees for task ${data.taskId} via direct microservice call`);
    return this.send(pattern(getSuggestedTechnicians), data);
  }

  /**
   * Get task attachments
   */
  async getAttachments(data: RpcRequest<typeof getAttachments>) {
    this.logger.debug(`Getting attachments for task ${data.taskId} via direct microservice call`);
    return this.send(pattern(getAttachments), data);
  }

  /**
   * Get subtasks of a task
   */
  async getSubtasks(data: RpcRequest<typeof getSubtasks>) {
    this.logger.debug(`Getting subtasks for task ${data.taskId} via direct microservice call`);
    return this.send(pattern(getSubtasks), data);
  }

  /**
   * Get task assignees
   */
  async getAssignees(data: RpcRequest<typeof getTaskAssignees>) {
    this.logger.debug(`Getting assignees for task ${data.taskId} via direct microservice call`);
    return this.send(pattern(getTaskAssignees), data);
  }

  /**
   * Get task checklist items
   */
  async getChecklist(data: RpcRequest<typeof getTaskChecklist>) {
    this.logger.debug(`Getting checklist for task ${data.taskId} via direct microservice call`);
    return this.send(pattern(getTaskChecklist), data);
  }

  /**
   * Re-sync every task in a space onto that space's workflow (admin maintenance).
   */
  async resyncSpaceWorkflow(data: RpcRequest<typeof resyncSpaceWorkflow>) {
    this.logger.debug(`Re-syncing tasks for space ${data.spaceId} to its workflow`);
    return this.send(pattern(resyncSpaceWorkflow), data);
  }

  async resyncAllSpaces(organizationId: string) {
    this.logger.debug(`Re-syncing all spaces for org ${organizationId}`);
    return this.send(pattern(resyncAllSpaces), { organizationId } satisfies RpcRequest<typeof resyncAllSpaces>);
  }
}
