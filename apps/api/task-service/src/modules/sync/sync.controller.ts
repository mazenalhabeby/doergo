import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SyncPullService, type PullRequest } from './sync-pull.service';
import type { TaskVisibilityFacts } from '../tasks/task-visibility';
import { pattern, type RpcRequest, syncPull, syncMediaLinks } from '@hbcfield/shared/microservices';

@Controller()
export class SyncController {
  constructor(private readonly pull: SyncPullService) {}

  @MessagePattern(pattern(syncPull))
  pullScope(@Payload() data: RpcRequest<typeof syncPull>) {
    return this.pull.pull(data);
  }

  @MessagePattern(pattern(syncMediaLinks))
  mediaLinks(@Payload() data: RpcRequest<typeof syncMediaLinks>) {
    return this.pull.mediaLinks(data);
  }
}
