import { Module } from '@nestjs/common';
import { JoinRequestsController } from './join-requests.controller';

@Module({
  imports: [
  ],
  controllers: [JoinRequestsController],
})
export class JoinRequestsModule {}
