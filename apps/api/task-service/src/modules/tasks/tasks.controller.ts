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
  async findOne(@Payload() data: { id: string }) {
    return this.tasksService.findOne(data.id);
  }

  @MessagePattern({ cmd: 'update_task' })
  async update(@Payload() data: any) {
    const { id, ...updateData } = data;
    return this.tasksService.update(id, updateData);
  }

  @MessagePattern({ cmd: 'assign_task' })
  async assign(@Payload() data: { id: string; workerId: string; assignedById: string }) {
    return this.tasksService.assign(data.id, data.workerId, data.assignedById);
  }

  @MessagePattern({ cmd: 'update_task_status' })
  async updateStatus(@Payload() data: { id: string; status: string; reason?: string; userId: string }) {
    return this.tasksService.updateStatus(data.id, data.status, data.userId, data.reason);
  }

  @MessagePattern({ cmd: 'delete_task' })
  async remove(@Payload() data: { id: string }) {
    return this.tasksService.remove(data.id);
  }

  @MessagePattern({ cmd: 'get_task_timeline' })
  async getTimeline(@Payload() data: { id: string }) {
    return this.tasksService.getTimeline(data.id);
  }
}
