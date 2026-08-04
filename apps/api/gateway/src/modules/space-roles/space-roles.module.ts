import { Module } from '@nestjs/common';
import { SpaceRolesController } from './space-roles.controller';
import { SpaceRolesService } from './space-roles.service';

// SERVICE_NAMES.TASK ClientProxy is provided globally (MicroservicesModule).
@Module({
  controllers: [SpaceRolesController],
  providers: [SpaceRolesService],
})
export class SpaceRolesModule {}
