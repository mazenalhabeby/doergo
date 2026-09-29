import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { JoinRequestsController } from './join-requests.controller';

@Module({
  imports: [
  ],
  controllers: [JoinRequestsController],
})
export class JoinRequestsModule {}
