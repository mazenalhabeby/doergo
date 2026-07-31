import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { TasksService } from './tasks.service';

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
  constructor(private readonly tasksService: TasksService) {}

  @MessagePattern({ cmd: 'health' })
  async health() {
    return { status: 'ok', service: 'task-service', timestamp: new Date().toISOString() };
  }

  // ============ READ Operations (Direct Microservice) ============
  // WRITE operations are handled by TasksProcessor via BullMQ

  @MessagePattern({ cmd: 'find_all_tasks' })
  async findAll(@Payload() data: any) {
    return this.tasksService.findAll(data);
  }

  @MessagePattern({ cmd: 'find_task' })
  async findOne(
    @Payload() data: { id: string; userId: string; userRole: string; organizationId: string },
  ) {
    return this.tasksService.findOne(data);
  }

  @MessagePattern({ cmd: 'get_task_timeline' })
  async getTimeline(
    @Payload() data: { id: string; userId: string; userRole: string; organizationId: string },
  ) {
    return this.tasksService.getTimeline(data);
  }

  @MessagePattern({ cmd: 'get_comments' })
  async getComments(
    @Payload()
    data: {
      taskId: string;
      userId: string;
      userRole: string;
      organizationId: string;
    },
  ) {
    return this.tasksService.getComments(data);
  }

  @MessagePattern({ cmd: 'get_status_counts' })
  async getStatusCounts(
    @Payload()
    data: {
      userId: string;
      userRole: string;
      organizationId: string;
      spaceId?: string;
    },
  ) {
    return this.tasksService.getStatusCounts(data);
  }

  @MessagePattern({ cmd: 'get_suggested_technicians' })
  async getSuggestedTechnicians(
    @Payload()
    data: {
      taskId: string;
      userId: string;
      userRole: string;
      organizationId: string;
    },
  ) {
    return this.tasksService.getSuggestedTechnicians(data);
  }

  @MessagePattern({ cmd: 'get_task_assignees' })
  async getAssignees(
    @Payload()
    data: {
      taskId: string;
      userId: string;
      userRole: string;
      organizationId: string;
    },
  ) {
    return this.tasksService.getAssignees(data);
  }

  @MessagePattern({ cmd: 'get_task_checklist' })
  async getChecklist(
    @Payload()
    data: {
      taskId: string;
      userId: string;
      userRole: string;
      organizationId: string;
    },
  ) {
    return this.tasksService.getChecklist(data);
  }

  // ============ Space Workflow Re-sync (Admin) ============

  // One-shot admin maintenance op: re-point every task in a space onto the
  // space's workflow and remap statuses. Not high-frequency, so a direct
  // microservice call (not BullMQ) is sufficient.
  @MessagePattern({ cmd: 'resync_space_workflow' })
  async resyncSpaceWorkflow(
    @Payload() data: { spaceId: string; organizationId: string },
  ) {
    return this.tasksService.resyncSpaceWorkflow(data);
  }

  @MessagePattern({ cmd: 'resync_all_spaces' })
  async resyncAllSpaces(@Payload() data: { organizationId: string }) {
    return this.tasksService.resyncAllSpaces(data);
  }

  // ============ Customer Portal (customer-scoped reads) ============

  @MessagePattern({ cmd: 'portal_list_requests' })
  async listPortalRequests(@Payload() data: { organizationId: string; customerId: string }) {
    return this.tasksService.listPortalRequests(data);
  }

  @MessagePattern({ cmd: 'portal_list_requests_by_portal' })
  async listPortalRequestsByPortal(
    @Payload() data: { organizationId: string; portalId: string },
  ) {
    return this.tasksService.listPortalRequestsByPortal(data);
  }

  @MessagePattern({ cmd: 'portal_get_request' })
  async getPortalRequest(
    @Payload() data: { id: string; organizationId: string; customerId: string },
  ) {
    return this.tasksService.getPortalRequest(data);
  }

  // ============ Subtask READ Operations ============

  @MessagePattern({ cmd: 'get_subtasks' })
  async getSubtasks(
    @Payload()
    data: {
      taskId: string;
      userId: string;
      userRole: string;
      organizationId: string;
    },
  ) {
    return this.tasksService.getSubtasks(data);
  }
}
