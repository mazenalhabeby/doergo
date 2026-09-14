import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { BaseGatewayService, SERVICE_NAMES } from '@hbcfield/shared';

/** Gateway → task-service: what changed in a member's world since their cursor. */
@Injectable()
export class SyncPullGatewayService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, SyncPullGatewayService.name);
  }

  pull(data: Record<string, unknown>) {
    return this.send({ cmd: 'sync_pull' }, data);
  }

  mediaLinks(data: Record<string, unknown>) {
    return this.send({ cmd: 'sync_media_links' }, data);
  }
}
