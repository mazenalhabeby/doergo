import { Controller, Get, Post, Patch, Put, Delete, Body, Param, Query, Request, ForbiddenException, UseInterceptors } from '@nestjs/common';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  isAdmin,
  accessAllows,
  permissionsExceed,
  permissionsFromOrgRole,
  mayViewLabourCost,
  type PermissionSet,
  type ResolvedAccess,
  type BillByValue,
  type RoleKindValue,
} from '@hbcfield/shared';
import { RateHistoryQueryDto, SetDayRateDto, UpdateMemberRateDto, UpdateMemberRolesDto } from './space-roles.dto';
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
@UseInterceptors(LabourCostInterceptor)
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
    body: {
      name: string;
      description?: string;
      color?: string;
      permissions?: PermissionSet;
      kind?: RoleKindValue;
    },
    @Request() req: any,
  ) {
    assertMayGrant(req.user, body.permissions);
    return this.service.createRole({
      name: body.name,
      description: body.description,
      color: body.color,
      permissions: body.permissions,
      kind: body.kind,
      organizationId: req.user.organizationId,
    });
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
      kind?: RoleKindValue;
    },
    @Request() req: any,
  ) {
    if (body.permissions !== undefined) assertMayGrant(req.user, body.permissions);
    return this.service.updateRole({
      name: body.name,
      description: body.description,
      color: body.color,
      permissions: body.permissions,
      isActive: body.isActive,
      kind: body.kind,
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
    // ⚠️ Cost rates are stripped by LabourCostInterceptor for anyone without
    // canViewLabourCost: managing a workspace's people is not the same as being
    // allowed to see what their hours cost the company.
    return this.service.listMembers({ spaceId, organizationId: req.user.organizationId });
  }

  /**
   * The roles as THIS workspace sees them: who holds each one here, and each
   * work role's day rate here — now, scheduled and past.
   */
  @Get('spaces/:spaceId/roles')
  @ApiOperation({ summary: 'Roles in a workspace: holders here, and work roles\' day rates here' })
  listSpaceRoles(@Param('spaceId') spaceId: string, @Request() req: any) {
    assertCanManageSpace(req.user, spaceId);
    return this.service.listSpaceRoles({ spaceId, organizationId: req.user.organizationId });
  }

  /**
   * A work role's day rate in this workspace, from a day.
   *
   * ⚠️ Never written over: every day already worked keeps the rate it was
   * worked at. `canManageSpace`, like the hourly rate per member — it is a term
   * of the agreement with THIS client.
   */
  @Put('spaces/:spaceId/roles/:roleId/day-rate')
  @ApiOperation({ summary: 'Set (or schedule) a work role\'s day rate in this workspace' })
  setRoleDayRate(
    @Param('spaceId') spaceId: string,
    @Param('roleId') roleId: string,
    @Body() body: SetDayRateDto,
    @Request() req: any,
  ) {
    assertCanManageSpace(req.user, spaceId);
    return this.service.setRoleDayRate({
      spaceId,
      roleId,
      cents: body.cents,
      effectiveFrom: body.effectiveFrom,
      organizationId: req.user.organizationId,
      createdById: req.user.id,
    });
  }

  /**
   * A work role's DEFAULT day rate — for every workspace that has not set its
   * own. Org-wide, so the org-wide workspace permission, like the role itself.
   */
  @Put('space-roles/:roleId/day-rate')
  @RequirePermission('canManageWorkspaces')
  @ApiOperation({ summary: "Set (or schedule) a work role's default day rate for every workspace" })
  setRoleDefaultDayRate(@Param('roleId') roleId: string, @Body() body: SetDayRateDto, @Request() req: any) {
    return this.service.setRoleDayRate({
      spaceId: null,
      roleId,
      cents: body.cents,
      effectiveFrom: body.effectiveFrom,
      organizationId: req.user.organizationId,
      createdById: req.user.id,
    });
  }

  /**
   * One rate's dated history, for the "rate history" panel beside it.
   *
   * ⚠️ Read with the SAME right as writing that rate: the organization default
   * is the owner's, a workspace's is whoever manages it, a member's is whoever
   * manages people, a member-at-a-client is that workspace's manager. Cost rows
   * only for somebody who may see labour cost.
   */
  @Get('rate-history')
  @ApiOperation({ summary: 'The dated history of one hourly rate' })
  listRateHistory(@Query() q: RateHistoryQueryDto, @Request() req: any) {
    const u = req.user;
    const allowed =
      q.target === 'ORGANIZATION'
        ? isAdmin(u) && q.targetId === u.organizationId
        : q.target === 'SPACE'
          ? u?.canManageWorkspaces === true || canManageSpace(u, q.targetId)
          : q.target === 'MEMBER'
            ? isAdmin(u) || u?.canManageUsers === true
            : !!q.spaceId && canManageSpace(u, q.spaceId);
    if (!allowed) throw new ForbiddenException('You cannot read this rate');
    return this.service.listRateHistory({
      organizationId: u.organizationId,
      target: q.target,
      targetId: q.targetId,
      spaceId: q.spaceId,
      kinds: mayViewLabourCost(u) ? ['BILL_HOUR', 'COST_HOUR'] : ['BILL_HOUR'],
    });
  }

  /** A member's trade, management role, two-role switch and billing here. */
  @Patch('spaces/:spaceId/members/:memberId/roles')
  @ApiOperation({ summary: 'Set a member\'s work role, management role and billing in this workspace' })
  updateMemberRoles(
    @Param('spaceId') spaceId: string,
    @Param('memberId') memberId: string,
    @Body() body: UpdateMemberRolesDto,
    @Request() req: any,
  ) {
    assertCanManageSpace(req.user, spaceId);
    return this.service.updateMemberRoles({
      spaceId,
      memberId,
      organizationId: req.user.organizationId,
      workRoleId: body.workRoleId,
      managementRoleId: body.managementRoleId,
      allowSecondRole: body.allowSecondRole,
      billBy: body.billBy,
      // The management role is authority: same ceiling as assigning one.
      requesterPerms: isAdmin(req.user) ? null : actorPermsForSpace(req.user, spaceId),
    });
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

  /**
   * What this member is billed at, AT THIS CLIENT.
   *
   * ⚠️ This is where a customer-facing rate belongs, and putting it on the
   * member record was the mistake. What somebody COSTS is a fact about the
   * person — it follows them everywhere. What a client PAYS for their hour is a
   * fact about that client, and the same engineer is routinely worth €45 at one
   * customer and €60 at another. One field on the person cannot express that,
   * and asking somebody to fork the person's record per customer is worse.
   *
   * ⚠️ `canManageSpace`, not the invoicing permission: this is a term of the
   * agreement with THIS customer, set by whoever runs that customer's
   * workspace. Null clears it back to inherit.
   */
  @Patch('spaces/:spaceId/members/:memberId/rate')
  @ApiOperation({ summary: 'Set what this member is billed at for this client' })
  updateMemberRate(
    @Param('spaceId') spaceId: string,
    @Param('memberId') memberId: string,
    @Body() body: UpdateMemberRateDto,
    @Request() req: any,
  ) {
    assertCanManageSpace(req.user, spaceId);
    // A cost from somebody who may not see costs is refused by LabourCostInterceptor.
    return this.service.updateMemberRate({
      spaceId,
      memberId,
      organizationId: req.user.organizationId,
      effectiveFrom: body.effectiveFrom,
      createdById: req.user.id,
      billRateCents: body.billRateCents,
      /*
        ⚠️ A per-client COST is only accepted from somebody who may see costs at
        all. It is rare and real — a contractor who charges more for one site —
        but writing it must not be a way to learn it.
      */
      costRateCents: body.costRateCents,
    });
  }
}
