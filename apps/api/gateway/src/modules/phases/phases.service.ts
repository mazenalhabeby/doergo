import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

/**
 * Gateway service for Phase operations.
 * Uses direct microservice communication (no BullMQ needed for simple CRUD).
 */
@Injectable()
export class PhasesService extends BaseGatewayService {
  constructor(
    @Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy,
  ) {
    super(taskClient, PhasesService.name);
  }

  async findAll(data: { organizationId: string }) {
    return this.send({ cmd: 'find_all_phases' }, data);
  }

  async create(data: Record<string, any>) {
    return this.send({ cmd: 'create_phase' }, data);
  }

  async update(data: Record<string, any>) {
    return this.send({ cmd: 'update_phase' }, data);
  }

  async remove(data: { id: string; organizationId: string }) {
    return this.send({ cmd: 'delete_phase' }, data);
  }
}
