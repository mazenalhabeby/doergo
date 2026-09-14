import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncPushService } from './sync-push.service';

@Module({
  controllers: [SyncController],
  providers: [SyncPushService],
})
export class SyncModule {}
