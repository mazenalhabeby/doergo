import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
  pattern,
  completeSprint,
  createSprint,
  deleteSprint,
  findAllSprints,
  findSprint,
  getSprintReport,
  getVelocity,
  startSprint,
  updateSprint,
  type RpcRequest,
} from '@hbcfield/shared/microservices';

/**
 * Gateway service for Sprint operations.
 * Uses direct microservice communication (no BullMQ needed for simple CRUD).
 */
@Injectable()
export class SprintsService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, SprintsService.name);
  }

  async findAll(data: { organizationId: string; status?: string }) {
    return this.send(pattern(findAllSprints), data satisfies RpcRequest<typeof findAllSprints>);
  }

  async findOne(data: { id: string; organizationId: string }) {
    return this.send(pattern(findSprint), data satisfies RpcRequest<typeof findSprint>);
  }

  async create(data: RpcRequest<typeof createSprint>) {
    return this.send(pattern(createSprint), data);
  }

  async update(data: RpcRequest<typeof updateSprint>) {
    return this.send(pattern(updateSprint), data);
  }

  async start(data: { id: string; organizationId: string }) {
    return this.send(pattern(startSprint), data satisfies RpcRequest<typeof startSprint>);
  }

  async complete(data: { id: string; organizationId: string }) {
    return this.send(pattern(completeSprint), data satisfies RpcRequest<typeof completeSprint>);
  }

  async remove(data: { id: string; organizationId: string }) {
    return this.send(pattern(deleteSprint), data satisfies RpcRequest<typeof deleteSprint>);
  }

  async getReport(data: { id: string; organizationId: string }) {
    return this.send(pattern(getSprintReport), data satisfies RpcRequest<typeof getSprintReport>);
  }

  async getVelocity(data: { organizationId: string; limit?: number }) {
    return this.send(pattern(getVelocity), data satisfies RpcRequest<typeof getVelocity>);
  }
}
