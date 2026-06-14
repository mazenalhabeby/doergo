import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

/**
 * Gateway service for Status Workflow operations.
 * Uses direct microservice communication (no BullMQ needed for simple CRUD).
 */
@Injectable()
export class WorkflowsService extends BaseGatewayService {
  constructor(
    @Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy,
  ) {
    super(taskClient, WorkflowsService.name);
  }

  async findAll(data: { organizationId: string }) {
    return this.send({ cmd: 'find_all_workflows' }, data);
  }

  async findOne(data: { id: string; organizationId: string }) {
    return this.send({ cmd: 'find_workflow' }, data);
  }

  async create(data: Record<string, any>) {
    return this.send({ cmd: 'create_workflow' }, data);
  }

  async update(data: Record<string, any>) {
    return this.send({ cmd: 'update_workflow' }, data);
  }

  async remove(data: { id: string; organizationId: string }) {
    return this.send({ cmd: 'delete_workflow' }, data);
  }

  async setDefault(data: { id: string; organizationId: string }) {
    return this.send({ cmd: 'set_default_workflow' }, data);
  }

  async addStatus(data: Record<string, any>) {
    return this.send({ cmd: 'add_workflow_status' }, data);
  }

  async updateStatus(data: Record<string, any>) {
    return this.send({ cmd: 'update_workflow_status' }, data);
  }

  async removeStatus(data: { workflowId: string; statusId: string; organizationId: string }) {
    return this.send({ cmd: 'delete_workflow_status' }, data);
  }

  // Definition of Done
  async getDefinitionOfDone(data: { organizationId: string; workflowId?: string }) {
    return this.send({ cmd: 'get_definition_of_done' }, data);
  }

  async upsertDefinitionOfDone(data: Record<string, any>) {
    return this.send({ cmd: 'upsert_definition_of_done' }, data);
  }

  async removeDefinitionOfDone(data: { id: string; organizationId: string }) {
    return this.send({ cmd: 'delete_definition_of_done' }, data);
  }
}
