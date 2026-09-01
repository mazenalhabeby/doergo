import { Controller, Get, Post, Patch, Delete, Body, Param, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  isAdmin,
  accessAllows,
  permissionsExceed,
  permissionsFromOrgRole,
  type PermissionSet,
  type ResolvedAccess,
} from '@hbcfield/shared';
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
 * Everything the caller holds when acting on THIS space: org-wide grants plus
 * whatever their assignment in this space adds.
 *
 * Read from `access`, which validateToken resolves server-side from the
 * caller's own roles — never from the request. It is the ceiling for what they
 * may hand to somebody else.
 */
function actorPermsForSpace(user: any, spaceId: string): PermissionSet {
  const access = user?.access as ResolvedAccess | undefined;
  return { ...(access?.org ?? {}), ...(access?.perSpace?.[spaceId] ?? {}) };
}

/**
 * Nobody may grant what they do not hold.
 *
 * The org paths have enforced this for a while (role authoring, member role
 * changes, invitation pre-assignment). The SPACE paths never did, and until
 * today it barely showed: a space role could carry four attendance permissions,
 * so the worst a space manager could do was make somebody else an approver of
 * overtime.
 *
 * A space role can now carry sixteen — including managing this space's members,
 * deleting assets, the CRM client grants and location tracking. Assigning one is
 * now a real transfer of authority, so it needs the ceiling the org side has:
 * a space manager cannot mint themselves asset deletion by assigning a role
 * that happens to include it.
 *
 * Admins bypass, exactly as they do everywhere else — they already hold every
 * permission, so the check could never fire for them anyway.
 */
function assertMayGrant(user: any, rolePerms: unknown, spaceId?: string) {
  if (isAdmin(user)) return;
  // No spaceId = authoring a role DEFINITION, which is org-wide and usable in
  // any space, so it is measured against org grants alone. A space manager's
  // extra powers in one workspace must not let them mint a role carrying those
  // powers everywhere.
  const ceiling = spaceId ? actorPermsForSpace(user, spaceId) : (user?.access?.org ?? {});
  if (permissionsExceed(ceiling, permissionsFromOrgRole(rolePerms))) {
    throw new ForbiddenException('You cannot grant permissions beyond your own');
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
    assertMayGrant(req.user, body.permissions);
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
    if (body.permissions !== undefined) assertMayGrant(req.user, body.permissions);
    return this.service.updateRole({
      ...body,
      roleId,
      organizationId: req.user.organizationId,
      // The ceiling also applies to what the role ALREADY grants: editing a role
      // you could not have authored would otherwise let you rename it, hand it
      // out, and keep every permission you were never allowed to give.
      requesterPerms: isAdmin(req.user) ? null : (req.user?.access?.org ?? {}),
    });
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
      // The role being handed out is loaded in the service, so the ceiling is
      // checked there. Null means "no ceiling" and is set ONLY for an admin,
      // who holds everything and could never trip it.
      requesterPerms: isAdmin(req.user) ? null : actorPermsForSpace(req.user, spaceId),
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
    @Body()
    body: {
      notifyRoleIds?: string[];
      notifyUserIds?: string[];
      contactRoleIds?: string[];
      contactUserIds?: string[];
      approveRoleIds?: string[];
      approveUserIds?: string[];
    },
    @Request() req: any,
  ) {
    assertCanManageSpace(req.user, spaceId);
    return this.service.updateMemberRouting({ ...body, spaceId, memberId, organizationId: req.user.organizationId });
  }
}
