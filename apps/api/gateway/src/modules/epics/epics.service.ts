import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

/**
 * Gateway service for Epic operations.
 * Uses direct microservice communication (no BullMQ needed for simple CRUD).
 */
@Injectable()
export class EpicsService extends BaseGatewayService {
  constructor(
    @Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy,
  ) {
    super(taskClient, EpicsService.name);
  }

  async findAll(data: { organizationId: string }) {
    return this.send({ cmd: 'find_all_epics' }, data);
  }

  async create(data: Record<string, any>) {
    return this.send({ cmd: 'create_epic' }, data);
  }

  async update(data: Record<string, any>) {
    return this.send({ cmd: 'update_epic' }, data);
  }

  async remove(data: { id: string; organizationId: string }) {
    return this.send({ cmd: 'delete_epic' }, data);
  }
}
