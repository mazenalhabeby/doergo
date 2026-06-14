import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

/**
 * Gateway service for Recurring Task Template operations.
 * Uses direct microservice communication (no BullMQ needed for simple CRUD).
 */
@Injectable()
export class RecurringTasksService extends BaseGatewayService {
  constructor(
    @Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy,
  ) {
    super(taskClient, RecurringTasksService.name);
  }

  async findAll(data: { organizationId: string }) {
    return this.send({ cmd: 'find_all_recurring_tasks' }, data);
  }

  async create(data: Record<string, any>) {
    return this.send({ cmd: 'create_recurring_task' }, data);
  }

  async update(data: Record<string, any>) {
    return this.send({ cmd: 'update_recurring_task' }, data);
  }

  async remove(data: { id: string; organizationId: string }) {
    return this.send({ cmd: 'delete_recurring_task' }, data);
  }

  async generate(data: { id: string; organizationId: string; userId: string }) {
    return this.send({ cmd: 'generate_recurring_task' }, data);
  }
}
