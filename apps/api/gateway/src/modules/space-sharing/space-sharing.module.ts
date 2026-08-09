import { Module } from '@nestjs/common';
import { SpaceSharingController } from './space-sharing.controller';

@Module({
  controllers: [SpaceSharingController],
})
export class SpaceSharingModule {}
