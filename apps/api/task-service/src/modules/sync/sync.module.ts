import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncPullService } from './sync-pull.service';

@Module({
  controllers: [SyncController],
  providers: [SyncPullService],
})
export class SyncModule {}
