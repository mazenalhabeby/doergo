import { Module } from '@nestjs/common';
import { SpaceRolesController } from './space-roles.controller';
import { SpaceRolesService } from './space-roles.service';
import { RoleAdminService } from './role-admin.service';
import { SpaceMembersService } from './space-members.service';
import { MemberRolesService } from './member-roles.service';
import { MemberTermsService } from './member-terms.service';

@Module({
  controllers: [SpaceRolesController],
  providers: [SpaceRolesService, RoleAdminService, SpaceMembersService, MemberRolesService, MemberTermsService],
  exports: [SpaceRolesService, RoleAdminService, SpaceMembersService, MemberRolesService, MemberTermsService],
})
export class SpaceRolesModule {}
