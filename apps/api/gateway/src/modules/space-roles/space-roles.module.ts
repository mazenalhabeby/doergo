import { Module } from '@nestjs/common';
import { SpaceRolesController } from './space-roles.controller';
import { SpaceMembersController } from './space-members.controller';
import { SpaceMemberPermissionsController } from './space-member-permissions.controller';
import { SpaceRolesService } from './space-roles.service';

// SERVICE_NAMES.TASK ClientProxy is provided globally (MicroservicesModule).
@Module({
  controllers: [SpaceRolesController, SpaceMembersController, SpaceMemberPermissionsController],
  providers: [SpaceRolesService],
})
export class SpaceRolesModule {}
