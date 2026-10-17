import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
  pattern,
  createCustomField,
  deleteCustomField,
  findAllCustomFields,
  getTaskCustomFields,
  setTaskCustomFields,
  updateCustomField,
  findTask,
  type RpcRequest,
} from '@hbcfield/shared/microservices';

/**
 * Gateway service for Custom Field operations.
 * Uses direct microservice communication (no BullMQ needed for simple CRUD).
 */
@Injectable()
export class CustomFieldsService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, CustomFieldsService.name);
  }

  /** One task through task-service's gate — for the external-member write check. */
  async findTask(data: RpcRequest<typeof findTask>) {
    return this.send(pattern(findTask), data);
  }

  async findAll(data: RpcRequest<typeof findAllCustomFields>) {
    return this.send(pattern(findAllCustomFields), data);
  }

  async create(data: RpcRequest<typeof createCustomField>) {
    return this.send(pattern(createCustomField), data);
  }

  async update(data: RpcRequest<typeof updateCustomField>) {
    return this.send(pattern(updateCustomField), data);
  }

  async remove(data: RpcRequest<typeof deleteCustomField>) {
    return this.send(pattern(deleteCustomField), data);
  }

  async getTaskValues(data: RpcRequest<typeof getTaskCustomFields>) {
    return this.send(pattern(getTaskCustomFields), data);
  }

  async setTaskValues(data: RpcRequest<typeof setTaskCustomFields>) {
    return this.send(pattern(setTaskCustomFields), data);
  }
}
