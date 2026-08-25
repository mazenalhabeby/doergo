import { Controller, Get, Post, Patch, Delete, Body, Param, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { isAdmin, accessAllows, type PermissionSet, type ResolvedAccess } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { SpaceRolesService } from './space-roles.service';

/**
 * True if the caller may manage THIS space — org-wide `canManageUsers`, or the
 * space-manager delegation: `canManageUsers` granted within this exact space
 * (from their SpaceAssignment role, resolved into access.perSpace). The spaceId
 * is the route param = the resource being acted on, so this is not a
 * confused-deputy — permission is checked against the very space in the URL.
 */
function canManageSpace(user: any, spaceId: string): boolean {
  if (isAdmin(user)) return true;
  if (user?.canManageUsers === true) return true;
  const access = user?.access as ResolvedAccess | undefined;
  return accessAllows(access, 'canManageUsers', spaceId);
}
function assertCanManageSpace(user: any, spaceId: string) {
  if (!canManageSpace(user, spaceId)) {
    throw new ForbiddenException('You do not manage this space');
  }
}

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
  @RequirePermission('canManageWorkspaces')
  @ApiOperation({ summary: 'List the org\'s dynamic space sub-roles' })
  listRoles(@Request() req: any) {
    return this.service.listRoles({ organizationId: req.user.organizationId });
  }

  @Post('space-roles')
  @RequirePermission('canManageWorkspaces')
  @ApiOperation({ summary: 'Create a space sub-role' })
  createRole(
    @Body()
    body: { name: string; description?: string; color?: string; permissions?: PermissionSet },
    @Request() req: any,
  ) {
    return this.service.createRole({ ...body, organizationId: req.user.organizationId });
  }

  @Patch('space-roles/:id')
  @RequirePermission('canManageWorkspaces')
  @ApiOperation({ summary: 'Update a space sub-role' })
  updateRole(
    @Param('id') roleId: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      color?: string;
      permissions?: PermissionSet;
      isActive?: boolean;
    },
    @Request() req: any,
  ) {
    return this.service.updateRole({ ...body, roleId, organizationId: req.user.organizationId });
  }

  @Delete('space-roles/:id')
  @RequirePermission('canManageWorkspaces')
  @ApiOperation({ summary: 'Delete a custom space sub-role' })
  deleteRole(@Param('id') roleId: string, @Request() req: any) {
    return this.service.deleteRole({ roleId, organizationId: req.user.organizationId });
  }

  // Member endpoints allow EITHER org canManageUsers OR the space-manager
  // delegation (canManageUsers within THIS space). Enforced manually against the
  // route's spaceId — so the generic org-only guard is intentionally omitted.

  @Get('spaces/:spaceId/members')
  @ApiOperation({ summary: 'List members of a space with their roles + routing' })
  listMembers(@Param('spaceId') spaceId: string, @Request() req: any) {
    assertCanManageSpace(req.user, spaceId);
    return this.service.listMembers({ spaceId, organizationId: req.user.organizationId });
  }

  @Post('spaces/:spaceId/members')
  @ApiOperation({ summary: 'Assign a member to a space with a role' })
  assignMember(
    @Param('spaceId') spaceId: string,
    @Body() body: { userId: string; spaceRoleId?: string | null },
    @Request() req: any,
  ) {
    assertCanManageSpace(req.user, spaceId);
    return this.service.assignMember({
      spaceId,
      userId: body.userId,
      spaceRoleId: body.spaceRoleId ?? null,
      organizationId: req.user.organizationId,
      createdById: req.user.id,
    });
  }

  @Delete('spaces/:spaceId/members/:memberId')
  @ApiOperation({ summary: 'Remove a member from a space' })
  removeMember(
    @Param('spaceId') spaceId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ) {
    assertCanManageSpace(req.user, spaceId);
    return this.service.removeMember({ spaceId, memberId, organizationId: req.user.organizationId });
  }

  @Patch('spaces/:spaceId/members/:memberId/routing')
  @ApiOperation({ summary: 'Set who is notified about / who this member may contact, in this space' })
  updateMemberRouting(
    @Param('spaceId') spaceId: string,
    @Param('memberId') memberId: string,
    @Body() body: { notifyRoleIds?: string[]; notifyUserIds?: string[]; contactRoleIds?: string[]; contactUserIds?: string[] },
    @Request() req: any,
  ) {
    assertCanManageSpace(req.user, spaceId);
    return this.service.updateMemberRouting({ ...body, spaceId, memberId, organizationId: req.user.organizationId });
  }
}
