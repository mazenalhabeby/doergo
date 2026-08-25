import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // A client to task-service so a watcher change can publish the cache
  // invalidation for it — the routing cache lives there, the write lands here.
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.TASK)])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
