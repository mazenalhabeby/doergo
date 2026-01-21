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
}
