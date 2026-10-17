import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { BaseGatewayService, SERVICE_NAMES } from '@hbcfield/shared';
import { pattern, type RpcRequest, syncPull, syncMediaLinks } from '@hbcfield/shared/microservices';

/** Gateway → task-service: what changed in a member's world since their cursor. */
@Injectable()
export class SyncPullGatewayService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, SyncPullGatewayService.name);
  }

  pull(data: RpcRequest<typeof syncPull>) {
    return this.send(pattern(syncPull), data);
  }

  mediaLinks(data: RpcRequest<typeof syncMediaLinks>) {
    return this.send(pattern(syncMediaLinks), data);
  }
}
