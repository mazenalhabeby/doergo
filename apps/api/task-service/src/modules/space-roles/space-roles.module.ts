import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { RoleWriter } from './role-writer.service';
import { SpaceRolesController } from './space-roles.controller';
import { SpaceRolesService } from './space-roles.service';
import { RoleAdminService } from './role-admin.service';
import { SpaceMembersService } from './space-members.service';
import { MemberRolesService } from './member-roles.service';
import { MemberTermsService } from './member-terms.service';

@Module({
  // auth-service owns AccessRole: RoleWriter asks it to write workspace roles (data-ownership group D).
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.AUTH)])],
  controllers: [SpaceRolesController],
  providers: [
    RoleWriter,
    SpaceRolesService,
    RoleAdminService,
    SpaceMembersService,
    MemberRolesService,
    MemberTermsService,
  ],
  exports: [SpaceRolesService, RoleAdminService, SpaceMembersService, MemberRolesService, MemberTermsService],
})
export class SpaceRolesModule {}
