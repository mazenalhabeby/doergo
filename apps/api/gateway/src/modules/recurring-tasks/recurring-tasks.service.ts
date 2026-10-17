import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
  pattern,
  type RpcRequest,
  findAllRecurringTasks,
  createRecurringTask,
  updateRecurringTask,
  deleteRecurringTask,
  generateRecurringTask,
} from '@hbcfield/shared/microservices';

/**
 * Gateway service for Recurring Task Template operations.
 * Uses direct microservice communication (no BullMQ needed for simple CRUD).
 */
@Injectable()
export class RecurringTasksService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, RecurringTasksService.name);
  }

  async findAll(data: RpcRequest<typeof findAllRecurringTasks>) {
    return this.send(pattern(findAllRecurringTasks), data);
  }

  async create(data: RpcRequest<typeof createRecurringTask>) {
    return this.send(pattern(createRecurringTask), data);
  }

  async update(data: RpcRequest<typeof updateRecurringTask>) {
    return this.send(pattern(updateRecurringTask), data);
  }

  async remove(data: RpcRequest<typeof deleteRecurringTask>) {
    return this.send(pattern(deleteRecurringTask), data);
  }

  async generate(data: RpcRequest<typeof generateRecurringTask>) {
    return this.send(pattern(generateRecurringTask), data);
  }
}
