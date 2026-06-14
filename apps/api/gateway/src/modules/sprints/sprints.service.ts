import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

/**
 * Gateway service for Sprint operations.
 * Uses direct microservice communication (no BullMQ needed for simple CRUD).
 */
@Injectable()
export class SprintsService extends BaseGatewayService {
  constructor(
    @Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy,
  ) {
    super(taskClient, SprintsService.name);
  }

  async findAll(data: { organizationId: string; status?: string }) {
    return this.send({ cmd: 'find_all_sprints' }, data);
  }

  async findOne(data: { id: string; organizationId: string }) {
    return this.send({ cmd: 'find_sprint' }, data);
  }

  async create(data: Record<string, any>) {
    return this.send({ cmd: 'create_sprint' }, data);
  }

  async update(data: Record<string, any>) {
    return this.send({ cmd: 'update_sprint' }, data);
  }

  async start(data: { id: string; organizationId: string }) {
    return this.send({ cmd: 'start_sprint' }, data);
  }

  async complete(data: { id: string; organizationId: string }) {
    return this.send({ cmd: 'complete_sprint' }, data);
  }

  async remove(data: { id: string; organizationId: string }) {
    return this.send({ cmd: 'delete_sprint' }, data);
  }

  async getReport(data: { id: string; organizationId: string }) {
    return this.send({ cmd: 'get_sprint_report' }, data);
  }

  async getVelocity(data: { organizationId: string; limit?: number }) {
    return this.send({ cmd: 'get_velocity' }, data);
  }
}
