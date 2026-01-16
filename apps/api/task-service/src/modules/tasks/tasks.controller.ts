import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { TasksService } from './tasks.service';

@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @MessagePattern({ cmd: 'create_task' })
  async create(@Payload() data: any) {
    return this.tasksService.create(data);
  }

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

  @MessagePattern({ cmd: 'update_task' })
  async update(@Payload() data: any) {
    return this.tasksService.update(data);
  }

  @MessagePattern({ cmd: 'assign_task' })
  async assign(
    @Payload() data: { id: string; workerId: string; userId: string; userRole: string; organizationId: string },
  ) {
    return this.tasksService.assign(data);
  }

  @MessagePattern({ cmd: 'update_task_status' })
  async updateStatus(
    @Payload() data: { id: string; status: string; technicianId: string; reason?: string },
  ) {
    return this.tasksService.updateStatus(data);
  }

  @MessagePattern({ cmd: 'delete_task' })
  async remove(@Payload() data: { id: string; userId: string; userRole: string; organizationId: string }) {
    return this.tasksService.remove(data);
  }

  @MessagePattern({ cmd: 'get_task_timeline' })
  async getTimeline(
    @Payload() data: { id: string; userId: string; userRole: string; organizationId: string },
  ) {
    return this.tasksService.getTimeline(data);
  }

  @MessagePattern({ cmd: 'add_comment' })
  async addComment(
    @Payload()
    data: {
      taskId: string;
      content: string;
      userId: string;
      userRole: string;
      organizationId: string;
    },
  ) {
    return this.tasksService.addComment(data);
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
}
