import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncPushService } from './sync-push.service';
import { SyncPullGatewayService } from './sync-pull.gateway.service';

@Module({
  controllers: [SyncController],
  providers: [SyncPushService, SyncPullGatewayService],
})
export class SyncModule {}
