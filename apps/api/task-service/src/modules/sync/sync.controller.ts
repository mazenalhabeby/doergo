import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SyncPullService, type PullRequest } from './sync-pull.service';
import type { TaskVisibilityFacts } from '../tasks/task-visibility';

@Controller()
export class SyncController {
  constructor(private readonly pull: SyncPullService) {}

  @MessagePattern({ cmd: 'sync_pull' })
  pullScope(@Payload() data: PullRequest) {
    return this.pull.pull(data);
  }

  @MessagePattern({ cmd: 'sync_media_links' })
  mediaLinks(@Payload() data: TaskVisibilityFacts & { ids: string[] }) {
    return this.pull.mediaLinks(data);
  }
}
