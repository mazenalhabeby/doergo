import { Module } from '@nestjs/common';
import { SpaceRolesController } from './space-roles.controller';
import { SpaceRolesService } from './space-roles.service';

@Module({
  controllers: [SpaceRolesController],
  providers: [SpaceRolesService],
  exports: [SpaceRolesService],
})
export class SpaceRolesModule {}
