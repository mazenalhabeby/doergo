import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { TasksService } from './tasks.service';
import { RolePoolService } from './assignment/role-pool.service';
import { RoleOfferService } from './assignment/role-offer.service';
import { TaskReportService } from './report/task-report.service';
import { RoleTakeService } from './assignment/role-take.service';
import { RoleStatsService } from './assignment/role-stats.service';
import { JobPauseReadService } from './handover/job-pause-read.service';
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
  taskHealth,
  findAllTasks,
  findTaskSpace,
  findTask,
  taskFullReport,
  getTaskSubmissions,
  getTaskTimeline,
  getTaskTime,
  getJobTimeReport,
  getMyHandovers,
  getComments,
  getStatusCounts,
  getSuggestedTechnicians,
  getTaskAssignees,
  getTaskChecklist,
  resyncSpaceWorkflow,
  resyncAllSpaces,
  portalListRequests,
  portalListRequestsByPortal,
  portalListWaitingRequests,
  portalGetRequest,
  portalTriageRequest,
  getSubtasks,
} from '@hbcfield/shared/microservices';

/**
 * Microservice Controller for Task READ Operations
 *
 * Handles direct Redis microservice calls for READ operations only.
 * These don't need BullMQ's exactly-once guarantees.
 *
 * WRITE operations (create, update, delete, assign, updateStatus, addComment)
 * are handled by TasksProcessor via BullMQ for exactly-once processing.
 */
@Controller()
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly pausedJobs: JobPauseReadService,
    private readonly rolePool: RolePoolService,
    private readonly roleOffers: RoleOfferService,
    private readonly roleStats: RoleStatsService,
    private readonly roleTake: RoleTakeService,
    private readonly taskReport: TaskReportService,
  ) {}

  // ============ A task open to a WORK role (shared tasks/role-pool.ts) ============
  // Direct, not through the queue: taking a place is ONE conditional update in
  // the database, which is the guarantee — a queue in front would only add wait.

  @MessagePattern(pattern(roleTasksOpenForMe))
  async roleTasksOpenForMe(@Payload() data: RpcRequest<typeof roleTasksOpenForMe>) {
    return this.rolePool.openForMe(data);
  }

  @MessagePattern(pattern(roleTaskTake))
  async roleTaskTake(@Payload() data: RpcRequest<typeof roleTaskTake>) {
    return this.roleTake.take(data);
  }

  @MessagePattern(pattern(roleTaskReturn))
  async roleTaskReturn(@Payload() data: RpcRequest<typeof roleTaskReturn>) {
    return this.rolePool.returnToRole(data);
  }

  @MessagePattern(pattern(roleTaskSetOpen))
  async roleTaskSetOpen(@Payload() data: RpcRequest<typeof roleTaskSetOpen>) {
    return this.rolePool.setOpenRole(data);
  }

  @MessagePattern(pattern(roleTaskOptions))
  async roleTaskOptions(@Payload() data: RpcRequest<typeof roleTaskOptions>) {
    return this.roleOffers.roleOptions(data);
  }

  @MessagePattern(pattern(roleTaskPreview))
  async roleTaskPreview(@Payload() data: RpcRequest<typeof roleTaskPreview>) {
    return this.roleOffers.preview(data);
  }

  @MessagePattern(pattern(roleTaskStats))
  async roleTaskStats(@Payload() data: RpcRequest<typeof roleTaskStats>) {
    return this.roleStats.stats(data);
  }

  // Its OWN pattern: on the shared Redis transport a common 'health' was answered
  // by whichever service replied first, so the gateway could not tell who was up.
  @MessagePattern(pattern(taskHealth))
  async health() {
    return { status: 'ok', service: 'task-service', timestamp: new Date().toISOString() };
  }

  // ============ READ Operations (Direct Microservice) ============
  // WRITE operations are handled by TasksProcessor via BullMQ

  @MessagePattern(pattern(findAllTasks))
  async findAll(@Payload() data: RpcRequest<typeof findAllTasks>) {
    return this.tasksService.findAll(data);
  }

  /*
    Which workspace a task lives in — for the gateway's ModuleGuard only.
    ⚠️ Not `find_task`, which asks who is reading and refuses a caller the guard
    cannot name. The space id and nothing else, scoped to the organization.
  */
  @MessagePattern(pattern(findTaskSpace))
  async findSpace(@Payload() data: RpcRequest<typeof findTaskSpace>) {
    return this.tasksService.spaceOf(data);
  }

  @MessagePattern(pattern(findTask))
  async findOne(
    @Payload()
    data: RpcRequest<typeof findTask>,
  ) {
    return this.tasksService.findOne(data);
  }

  /**
   * The full report for one job (shared tasks/task-report.ts) — `copy` office or
   * client. The client copy is cut here, in the service, never by the reader.
   */
  @MessagePattern(pattern(taskFullReport))
  async fullReport(@Payload() data: RpcRequest<typeof taskFullReport>) {
    return this.taskReport.build(data);
  }

  /** The step forms answered on this job — gated like reading the task. */
  @MessagePattern(pattern(getTaskSubmissions))
  async getSubmissions(@Payload() data: RpcRequest<typeof getTaskSubmissions>) {
    return this.tasksService.getSubmissions(data);
  }

  @MessagePattern(pattern(getTaskTimeline))
  async getTimeline(
    @Payload()
    data: RpcRequest<typeof getTaskTimeline>,
  ) {
    return this.tasksService.getTimeline(data);
  }

  /** The member's own: jobs in work, notes owed, jobs paused on them. */
  @MessagePattern(pattern(getTaskTime))
  async jobTime(@Payload() data: RpcRequest<typeof getTaskTime>) {
    return this.tasksService.getJobTime(data);
  }

  @MessagePattern(pattern(getJobTimeReport))
  async jobTimeReport(@Payload() data: RpcRequest<typeof getJobTimeReport>) {
    return this.tasksService.getJobTimeReport(data);
  }

  @MessagePattern(pattern(getMyHandovers))
  async myHandovers(@Payload() data: RpcRequest<typeof getMyHandovers>) {
    return this.pausedJobs.mine(data);
  }

  @MessagePattern(pattern(getComments))
  async getComments(
    @Payload()
    data: RpcRequest<typeof getComments>,
  ) {
    return this.tasksService.getComments(data);
  }

  @MessagePattern(pattern(getStatusCounts))
  async getStatusCounts(
    @Payload()
    data: RpcRequest<typeof getStatusCounts>,
  ) {
    return this.tasksService.getStatusCounts(data);
  }

  @MessagePattern(pattern(getSuggestedTechnicians))
  async getSuggestedTechnicians(
    @Payload()
    data: RpcRequest<typeof getSuggestedTechnicians>,
  ) {
    return this.tasksService.getSuggestedTechnicians(data);
  }

  @MessagePattern(pattern(getTaskAssignees))
  async getAssignees(
    @Payload()
    data: RpcRequest<typeof getTaskAssignees>,
  ) {
    return this.tasksService.getAssignees(data);
  }

  @MessagePattern(pattern(getTaskChecklist))
  async getChecklist(
    @Payload()
    data: RpcRequest<typeof getTaskChecklist>,
  ) {
    return this.tasksService.getChecklist(data);
  }

  // ============ Space Workflow Re-sync (Admin) ============

  // One-shot admin maintenance op: re-point every task in a space onto the
  // space's workflow and remap statuses. Not high-frequency, so a direct
  // microservice call (not BullMQ) is sufficient.
  @MessagePattern(pattern(resyncSpaceWorkflow))
  async resyncSpaceWorkflow(@Payload() data: RpcRequest<typeof resyncSpaceWorkflow>) {
    return this.tasksService.resyncSpaceWorkflow(data);
  }

  @MessagePattern(pattern(resyncAllSpaces))
  async resyncAllSpaces(@Payload() data: RpcRequest<typeof resyncAllSpaces>) {
    return this.tasksService.resyncAllSpaces(data);
  }

  // ============ Customer Portal (customer-scoped reads) ============

  @MessagePattern(pattern(portalListRequests))
  async listPortalRequests(@Payload() data: RpcRequest<typeof portalListRequests>) {
    return this.tasksService.listPortalRequests(data);
  }

  @MessagePattern(pattern(portalListWaitingRequests))
  async listWaitingPortalRequests(@Payload() data: RpcRequest<typeof portalListWaitingRequests>) {
    return this.tasksService.listWaitingPortalRequests(data);
  }

  @MessagePattern(pattern(portalListRequestsByPortal))
  async listPortalRequestsByPortal(@Payload() data: RpcRequest<typeof portalListRequestsByPortal>) {
    return this.tasksService.listPortalRequestsByPortal(data);
  }

  @MessagePattern(pattern(portalGetRequest))
  async getPortalRequest(@Payload() data: RpcRequest<typeof portalGetRequest>) {
    return this.tasksService.getPortalRequest(data);
  }

  @MessagePattern(pattern(portalTriageRequest))
  async triageRequest(
    @Payload()
    data: RpcRequest<typeof portalTriageRequest>,
  ) {
    return this.tasksService.triageRequest(data);
  }

  // ============ Subtask READ Operations ============

  @MessagePattern(pattern(getSubtasks))
  async getSubtasks(
    @Payload()
    data: RpcRequest<typeof getSubtasks>,
  ) {
    return this.tasksService.getSubtasks(data);
  }
}
