import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @MessagePattern({ cmd: 'find_user' })
  async findOne(@Payload() data: { id: string }) {
    return this.usersService.findOne(data.id);
  }

  @MessagePattern({ cmd: 'get_profile' })
  async getProfile(@Payload() data: { userId: string }) {
    return this.usersService.findOne(data.userId);
  }

  @MessagePattern({ cmd: 'get_workers' })
  async getWorkers(@Payload() data: { organizationId?: string }) {
    return this.usersService.getWorkers(data.organizationId);
  }

  @MessagePattern({ cmd: 'get_worker_tasks' })
  async getWorkerTasks(@Payload() data: { workerId: string }) {
    return this.usersService.getWorkerTasks(data.workerId);
  }
}
