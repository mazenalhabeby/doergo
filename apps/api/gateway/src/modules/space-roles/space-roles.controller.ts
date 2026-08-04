import { Controller, Get, Post, Patch, Delete, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { SpaceRolePermissions } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { SpaceRolesService } from './space-roles.service';

/**
 * Dynamic per-space sub-roles ("Shift Leader", "Team Leader", …) and space
 * membership. All mutations require canManageUsers; the organizationId is always
 * taken from the caller's token, never the body. Tier-gated Professional+
 * (writes 402 under-tier; reads pass).
 */
@ApiTags('space-roles')
@ApiBearerAuth()
@RequirePlan('shift_scheduling')
@Controller()
export class SpaceRolesController {
  constructor(private readonly service: SpaceRolesService) {}

  @Get('space-roles')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'List the org\'s dynamic space sub-roles' })
  listRoles(@Request() req: any) {
    return this.service.listRoles({ organizationId: req.user.organizationId });
  }

  @Post('space-roles')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Create a space sub-role' })
  createRole(
    @Body()
    body: { name: string; description?: string; color?: string; permissions?: Partial<SpaceRolePermissions> },
    @Request() req: any,
  ) {
    return this.service.createRole({ ...body, organizationId: req.user.organizationId });
  }

  @Patch('space-roles/:id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Update a space sub-role' })
  updateRole(
    @Param('id') roleId: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      color?: string;
      permissions?: Partial<SpaceRolePermissions>;
      isActive?: boolean;
    },
    @Request() req: any,
  ) {
    return this.service.updateRole({ ...body, roleId, organizationId: req.user.organizationId });
  }

  @Delete('space-roles/:id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Delete a custom space sub-role' })
  deleteRole(@Param('id') roleId: string, @Request() req: any) {
    return this.service.deleteRole({ roleId, organizationId: req.user.organizationId });
  }

  @Get('spaces/:spaceId/members')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'List members of a space with their sub-roles' })
  listMembers(@Param('spaceId') spaceId: string, @Request() req: any) {
    return this.service.listMembers({ spaceId, organizationId: req.user.organizationId });
  }

  @Post('spaces/:spaceId/members')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Assign a member to a space with a sub-role' })
  assignMember(
    @Param('spaceId') spaceId: string,
    @Body() body: { userId: string; spaceRoleId?: string | null },
    @Request() req: any,
  ) {
    return this.service.assignMember({
      spaceId,
      userId: body.userId,
      spaceRoleId: body.spaceRoleId ?? null,
      organizationId: req.user.organizationId,
      createdById: req.user.id,
    });
  }

  @Delete('spaces/:spaceId/members/:memberId')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Remove a member from a space' })
  removeMember(
    @Param('spaceId') spaceId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ) {
    return this.service.removeMember({ spaceId, memberId, organizationId: req.user.organizationId });
  }
}
