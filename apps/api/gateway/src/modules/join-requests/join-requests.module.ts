import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { createClientOptions, SERVICE_NAMES } from '@hbcfield/shared';
import { JoinRequestsController } from './join-requests.controller';

@Module({
  imports: [
  ],
  controllers: [JoinRequestsController],
})
export class JoinRequestsModule {}
