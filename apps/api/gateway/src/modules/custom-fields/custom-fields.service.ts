import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

/**
 * Gateway service for Custom Field operations.
 * Uses direct microservice communication (no BullMQ needed for simple CRUD).
 */
@Injectable()
export class CustomFieldsService extends BaseGatewayService {
  constructor(
    @Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy,
  ) {
    super(taskClient, CustomFieldsService.name);
  }

  async findAll(data: { organizationId: string; forWorkflow?: string }) {
    return this.send({ cmd: 'find_all_custom_fields' }, data);
  }

  async create(data: Record<string, any>) {
    return this.send({ cmd: 'create_custom_field' }, data);
  }

  async update(data: Record<string, any>) {
    return this.send({ cmd: 'update_custom_field' }, data);
  }

  async remove(data: { id: string; organizationId: string }) {
    return this.send({ cmd: 'delete_custom_field' }, data);
  }

  async getTaskValues(data: { taskId: string; organizationId: string }) {
    return this.send({ cmd: 'get_task_custom_fields' }, data);
  }

  async setTaskValues(data: { taskId: string; organizationId: string; values: any[] }) {
    return this.send({ cmd: 'set_task_custom_fields' }, data);
  }
}
