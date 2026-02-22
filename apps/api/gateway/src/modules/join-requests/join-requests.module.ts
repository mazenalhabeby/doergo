import { Module } from '@nestjs/common';
import { JoinRequestsController } from './join-requests.controller';

@Module({
  controllers: [JoinRequestsController],
})
export class JoinRequestsModule {}
