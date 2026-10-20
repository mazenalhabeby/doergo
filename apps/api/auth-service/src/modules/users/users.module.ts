import { MemberOffboardingModule } from '../../common/member-offboarding/member-offboarding.module';
import { SessionEventsModule } from '../../common/session-events/session-events.module';
import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { USERS_SERVICES } from './users-services';
import { SpaceRoleWritesController } from './space-role-writes.controller';
import { SpaceRoleWritesService } from './space-role-writes.service';

@Module({
  // A client to task-service so a watcher change can publish the cache
  // invalidation for it — the routing cache lives there, the write lands here.
  imports: [
    SessionEventsModule,
    MemberOffboardingModule,
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.TASK)]),
  ],
  controllers: [UsersController, SpaceRoleWritesController],
  // The facade and its collaborators — see users-services.ts.
  providers: [...USERS_SERVICES, SpaceRoleWritesService],
  exports: [UsersService],
})
export class UsersModule {}
