import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrgMembersController } from './org-members.controller';
import { MemberManagementController } from './member-management.controller';
import { OrgRolesController } from './org-roles.controller';
import { AuditLogController } from './audit-log.controller';
import { ChatModule } from '../chat/chat.module';

@Module({
  // The Managers list says whether the caller may message each person (chat's rule).
  imports: [ChatModule],
  controllers: [
    OrganizationsController,
    OrgMembersController,
    MemberManagementController,
    OrgRolesController,
    AuditLogController,
  ],
})
export class OrganizationsModule {}
