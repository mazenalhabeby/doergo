import { Module } from '@nestjs/common';
import { SpaceSharingController } from './space-sharing.controller';
import { SpaceSharingService } from './space-sharing.service';

@Module({
  controllers: [SpaceSharingController],
  providers: [SpaceSharingService],
  exports: [SpaceSharingService],
})
export class SpaceSharingModule {}
