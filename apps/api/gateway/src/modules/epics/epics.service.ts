import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
  pattern,
  createEpic,
  deleteEpic,
  findAllEpics,
  updateEpic,
  type RpcRequest,
} from '@hbcfield/shared/microservices';

/**
 * Gateway service for Epic operations.
 * Uses direct microservice communication (no BullMQ needed for simple CRUD).
 */
@Injectable()
export class EpicsService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, EpicsService.name);
  }

  async findAll(data: { organizationId: string }) {
    return this.send(pattern(findAllEpics), data satisfies RpcRequest<typeof findAllEpics>);
  }

  async create(data: RpcRequest<typeof createEpic>) {
    return this.send(pattern(createEpic), data);
  }

  async update(data: RpcRequest<typeof updateEpic>) {
    return this.send(pattern(updateEpic), data);
  }

  async remove(data: { id: string; organizationId: string }) {
    return this.send(pattern(deleteEpic), data satisfies RpcRequest<typeof deleteEpic>);
  }
}
