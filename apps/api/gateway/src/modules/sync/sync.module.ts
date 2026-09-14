import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncPushService } from './sync-push.service';
import { SyncPullGatewayService } from './sync-pull.gateway.service';
import { SyncHealthStore } from './sync-health.store';

@Module({
  controllers: [SyncController],
  providers: [SyncPushService, SyncPullGatewayService, SyncHealthStore],
})
export class SyncModule {}
