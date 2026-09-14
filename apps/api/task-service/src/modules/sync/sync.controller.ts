import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SyncPullService, type PullRequest } from './sync-pull.service';

@Controller()
export class SyncController {
  constructor(private readonly pull: SyncPullService) {}

  @MessagePattern({ cmd: 'sync_pull' })
  pullScope(@Payload() data: PullRequest) {
    return this.pull.pull(data);
  }
}
