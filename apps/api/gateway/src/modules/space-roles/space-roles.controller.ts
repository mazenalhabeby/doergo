import { Controller, Get, Post, Patch, Put, Delete, Body, Param, Query, Request, ForbiddenException, UseInterceptors } from '@nestjs/common';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  isAdmin,
  mayViewLabourCost,
  mayManageSpaceMembers,
  type PermissionSet,
  type BillByValue,
  type RoleKindValue,
} from '@hbcfield/shared';
import {
  assertMayGrant,
  assertAnyAuthority,
  grantCeiling,
  managesMembersOrgWide,
  outrankCeiling,
  spaceMemberAuthority,
} from './space-member-access';
import { MergeRoleDto, RateHistoryQueryDto, SetDayRateDto, UpdateMemberRateDto, UpdateMemberRolesDto } from './space-roles.dto';
import { RequirePermission } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { SpaceRolesService } from './space-roles.service';
import { RebillService } from '../../common/billing/rebill.service';

/**
 * May the caller manage THIS space's people — the one shared rule
 * (`mayManageSpaceMembers`: admin, org-wide `canManageUsers`, or `canManageUsers`
 * granted in this exact space). The spaceId is the route param = the resource
 * being acted on, so this is not a confused-deputy. It was a local copy of the
 * same rule; one definition means the roster's bill-rate strip and these routes
 * cannot drift apart.
 */
const canManageSpace = (user: any, spaceId: string): boolean => mayManageSpaceMembers(user, spaceId);
function assertCanManageSpace(user: any, spaceId: string) {
  if (!canManageSpace(user, spaceId)) {
    throw new ForbiddenException('You do not manage this space');
  }
}

// The ceiling (`actorPermsForSpace` / `assertMayGrant`) and the three trusts over
// a workspace's people live in ./space-member-access, shared with the builder
// and the location member routes.

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
  constructor(
    private readonly service: SpaceRolesService,
    private readonly billing: RebillService,
  ) {}

  /**
   * Run a change that can move the bill, then re-price the organization.
   *
   * An external member's seat is priced from the permissions their SPACE role
   * grants (an Observer €2, a Supervisor €9.99), so giving, changing or taking a
   * space role — or editing what a role grants — changes what is owed. These
   * routes did not re-bill; the change reached Stripe only with the nightly
   * sweep. Only after success: a refused change moved nothing.
   */
  private async thenRebill<T>(req: any, change: Promise<T>): Promise<T> {
    const result = await change;
    this.billing.rebill(req.user?.organizationId);
    return result;
  }

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
      /** Made from a workspace: a work role is switched on there at once. */
      spaceId?: string;
    },
    @Request() req: any,
  ) {
    assertMayGrant(req.user, body.permissions);
    if (body.spaceId) assertCanManageSpace(req.user, body.spaceId);
    return this.service.createRole({
      spaceId: typeof body.spaceId === 'string' ? body.spaceId : undefined,
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
    return this.thenRebill(req, this.service.updateRole({
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
    }));
  }

  @Delete('space-roles/:id')
  @RequirePermission('canManageWorkspaces')
  @ApiOperation({ summary: 'Delete a custom space sub-role' })
  deleteRole(@Param('id') roleId: string, @Request() req: any) {
    return this.thenRebill(req, this.service.deleteRole({ roleId, organizationId: req.user.organizationId }));
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
   * Fold a duplicate work role into another: its holders and day rates move,
   * it is deleted. Org-wide, like creating a role — the workspace permission.
   */
  /** Switch a company work role on in this workspace (it then shows here and in its pickers). */
  @Put('spaces/:spaceId/work-roles/:roleId')
  @ApiOperation({ summary: 'Use a company work role in this workspace' })
  useWorkRole(@Param('spaceId') spaceId: string, @Param('roleId') roleId: string, @Request() req: any) {
    assertCanManageSpace(req.user, spaceId);
    return this.service.setWorkRoleHere({ spaceId, roleId, active: true, organizationId: req.user.organizationId });
  }

  /** Switch it off here only — refused while somebody here holds it. */
  @Delete('spaces/:spaceId/work-roles/:roleId')
  @ApiOperation({ summary: 'Stop using a work role in this workspace' })
  dropWorkRole(@Param('spaceId') spaceId: string, @Param('roleId') roleId: string, @Request() req: any) {
    assertCanManageSpace(req.user, spaceId);
    return this.service.setWorkRoleHere({ spaceId, roleId, active: false, organizationId: req.user.organizationId });
  }

  @Post('space-roles/:roleId/merge')
  @RequirePermission('canManageWorkspaces')
  @ApiOperation({ summary: 'Merge a work role into another (holders and day rates move; the role is deleted)' })
  mergeRole(@Param('roleId') roleId: string, @Body() body: MergeRoleDto, @Request() req: any) {
    return this.thenRebill(req, this.service.mergeRole({ roleId, intoRoleId: body.intoRoleId, organizationId: req.user.organizationId }));
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
      kinds: mayViewLabourCost(u) ? ['BILL_HOUR', 'COST_HOUR', 'COST_DAY'] : ['BILL_HOUR'],
    });
  }

  /**
   * A member's trade, management role, two-role switch and billing here.
   *
   * Two trusts on one route: the management role needs `canGrantSpaceRoles`
   * here (ceiling applies), the trade and the billing terms need managing this
   * space's people (`canManageUsers` here — never an external member). The
   * service decides per field with the authority sent below.
   */
  @Patch('spaces/:spaceId/members/:memberId/roles')
  @ApiOperation({ summary: 'Set a member\'s work role, management role and billing in this workspace' })
  updateMemberRoles(
    @Param('spaceId') spaceId: string,
    @Param('memberId') memberId: string,
    @Body() body: UpdateMemberRolesDto,
    @Request() req: any,
  ) {
    const authority = spaceMemberAuthority(req.user, spaceId);
    assertAnyAuthority(authority);
    return this.thenRebill(req, this.service.updateMemberRoles({
      spaceId,
      memberId,
      organizationId: req.user.organizationId,
      workRoleId: body.workRoleId,
      managementRoleId: body.managementRoleId,
      allowSecondRole: body.allowSecondRole,
      billBy: body.billBy,
      hoursBasis: body.hoursBasis,
      // The management role is authority: same ceiling as assigning one.
      requesterPerms: grantCeiling(req.user, spaceId),
      authority,
      outrankCheck: !managesMembersOrgWide(req.user),
    }));
  }

  /**
   * Put somebody into this workspace (with a role), or change the role they
   * hold here. Adding needs `canAddSpaceMembers` here, a management role
   * `canGrantSpaceRoles` (ceiling applies), a trade `canManageUsers` here —
   * decided in the service, where the role's kind is known.
   */
  @Post('spaces/:spaceId/members')
  @ApiOperation({ summary: 'Assign a member to a space with a role' })
  assignMember(
    @Param('spaceId') spaceId: string,
    @Body() body: { userId: string; spaceRoleId?: string | null },
    @Request() req: any,
  ) {
    const authority = spaceMemberAuthority(req.user, spaceId);
    assertAnyAuthority(authority);
    return this.thenRebill(req, this.service.assignMember({
      spaceId,
      userId: body.userId,
      spaceRoleId: body.spaceRoleId ?? null,
      organizationId: req.user.organizationId,
      createdById: req.user.id,
      // The role being handed out is loaded in the service, so the ceiling is
      // checked there. Null means "no ceiling" and is set ONLY for an admin,
      // who holds everything and could never trip it.
      requesterPerms: grantCeiling(req.user, spaceId),
      authority,
      outrankCheck: !managesMembersOrgWide(req.user),
    }));
  }

  /** Take somebody off this workspace — `canAddSpaceMembers` here, never somebody who holds more than you. */
  @Delete('spaces/:spaceId/members/:memberId')
  @ApiOperation({ summary: 'Remove a member from a space' })
  removeMember(
    @Param('spaceId') spaceId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ) {
    if (!spaceMemberAuthority(req.user, spaceId).addMembers) {
      throw new ForbiddenException('You do not have permission to remove people from this workspace');
    }
    return this.thenRebill(req, this.service.removeMember({
      spaceId,
      memberId,
      organizationId: req.user.organizationId,
      outrankPerms: outrankCeiling(req.user, spaceId),
    }));
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
      costDayCents: body.costDayCents,
    });
  }
}
