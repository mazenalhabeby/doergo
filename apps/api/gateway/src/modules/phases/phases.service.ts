import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
  pattern,
  createPhase,
  deletePhase,
  findAllPhases,
  updatePhase,
  type RpcRequest,
} from '@hbcfield/shared/microservices';

/**
 * Gateway service for Phase operations.
 * Uses direct microservice communication (no BullMQ needed for simple CRUD).
 */
@Injectable()
export class PhasesService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, PhasesService.name);
  }

  async findAll(data: { organizationId: string }) {
    return this.send(pattern(findAllPhases), data satisfies RpcRequest<typeof findAllPhases>);
  }

  async create(data: RpcRequest<typeof createPhase>) {
    return this.send(pattern(createPhase), data);
  }

  async update(data: RpcRequest<typeof updatePhase>) {
    return this.send(pattern(updatePhase), data);
  }

  async remove(data: { id: string; organizationId: string }) {
    return this.send(pattern(deletePhase), data satisfies RpcRequest<typeof deletePhase>);
  }
}
