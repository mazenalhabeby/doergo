import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  ForbiddenException,
  UseInterceptors,
} from '@nestjs/common';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { isAdmin, mayViewLabourCost, type PermissionSet, type RoleKindValue, ownAccess } from '@hbcfield/shared';
import { assertMayGrant } from './space-member-access';
import { MergeRoleDto, RateHistoryQueryDto, SetDayRateDto } from './space-roles.dto';
import { RequirePermission } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { canManageSpace, assertCanManageSpace } from './space-roles-controller-helpers';
import { SpaceRolesControllerBase } from './space-roles-controller.base';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
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
export class SpaceRolesController extends SpaceRolesControllerBase {
  @Get('space-roles')
  @RequirePermission('canManageWorkspaces')
  @ApiOperation({ summary: "List the org's dynamic space sub-roles" })
  listRoles(@Request() req: AuthedRequest) {
    return this.service.listRoles({ organizationId: callerOrgId(req.user) });
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
    @Request() req: AuthedRequest,
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
      organizationId: callerOrgId(req.user),
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
    @Request() req: AuthedRequest,
  ) {
    if (body.permissions !== undefined) assertMayGrant(req.user, body.permissions);
    return this.thenRebill(
      req,
      this.service.updateRole({
        name: body.name,
        description: body.description,
        color: body.color,
        permissions: body.permissions,
        isActive: body.isActive,
        kind: body.kind,
        roleId,
        organizationId: callerOrgId(req.user),
        // The ceiling also applies to what the role ALREADY grants: editing a role
        // you could not have authored would otherwise let you rename it, hand it
        // out, and keep every permission you were never allowed to give.
        requesterPerms: isAdmin(req.user) ? null : (ownAccess(req.user?.access)?.org ?? {}),
      }),
    );
  }

  @Delete('space-roles/:id')
  @RequirePermission('canManageWorkspaces')
  @ApiOperation({ summary: 'Delete a custom space sub-role' })
  deleteRole(@Param('id') roleId: string, @Request() req: AuthedRequest) {
    return this.thenRebill(req, this.service.deleteRole({ roleId, organizationId: callerOrgId(req.user) }));
  }

  /**
   * The roles as THIS workspace sees them: who holds each one here, and each
   * work role's day rate here — now, scheduled and past.
   */
  @Get('spaces/:spaceId/roles')
  @ApiOperation({ summary: "Roles in a workspace: holders here, and work roles' day rates here" })
  listSpaceRoles(@Param('spaceId') spaceId: string, @Request() req: AuthedRequest) {
    assertCanManageSpace(req.user, spaceId);
    return this.service.listSpaceRoles({ spaceId, organizationId: callerOrgId(req.user) });
  }

  /**
   * A work role's day rate in this workspace, from a day.
   *
   * ⚠️ Never written over: every day already worked keeps the rate it was
   * worked at. `canManageSpace`, like the hourly rate per member — it is a term
   * of the agreement with THIS client.
   */
  @Put('spaces/:spaceId/roles/:roleId/day-rate')
  @ApiOperation({ summary: "Set (or schedule) a work role's day rate in this workspace" })
  setRoleDayRate(
    @Param('spaceId') spaceId: string,
    @Param('roleId') roleId: string,
    @Body() body: SetDayRateDto,
    @Request() req: AuthedRequest,
  ) {
    assertCanManageSpace(req.user, spaceId);
    return this.service.setRoleDayRate({
      spaceId,
      roleId,
      cents: body.cents,
      effectiveFrom: body.effectiveFrom,
      organizationId: callerOrgId(req.user),
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
  setRoleDefaultDayRate(@Param('roleId') roleId: string, @Body() body: SetDayRateDto, @Request() req: AuthedRequest) {
    return this.service.setRoleDayRate({
      spaceId: null,
      roleId,
      cents: body.cents,
      effectiveFrom: body.effectiveFrom,
      organizationId: callerOrgId(req.user),
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
  useWorkRole(@Param('spaceId') spaceId: string, @Param('roleId') roleId: string, @Request() req: AuthedRequest) {
    assertCanManageSpace(req.user, spaceId);
    return this.service.setWorkRoleHere({ spaceId, roleId, active: true, organizationId: callerOrgId(req.user) });
  }

  /** Switch it off here only — refused while somebody here holds it. */
  @Delete('spaces/:spaceId/work-roles/:roleId')
  @ApiOperation({ summary: 'Stop using a work role in this workspace' })
  dropWorkRole(@Param('spaceId') spaceId: string, @Param('roleId') roleId: string, @Request() req: AuthedRequest) {
    assertCanManageSpace(req.user, spaceId);
    return this.service.setWorkRoleHere({ spaceId, roleId, active: false, organizationId: callerOrgId(req.user) });
  }

  @Post('space-roles/:roleId/merge')
  @RequirePermission('canManageWorkspaces')
  @ApiOperation({ summary: 'Merge a work role into another (holders and day rates move; the role is deleted)' })
  mergeRole(@Param('roleId') roleId: string, @Body() body: MergeRoleDto, @Request() req: AuthedRequest) {
    return this.thenRebill(
      req,
      this.service.mergeRole({ roleId, intoRoleId: body.intoRoleId, organizationId: callerOrgId(req.user) }),
    );
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
  listRateHistory(@Query() q: RateHistoryQueryDto, @Request() req: AuthedRequest) {
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
      organizationId: callerOrgId(u),
      target: q.target,
      targetId: q.targetId,
      spaceId: q.spaceId,
      kinds: mayViewLabourCost(u) ? ['BILL_HOUR', 'COST_HOUR', 'COST_DAY'] : ['BILL_HOUR'],
    });
  }
}
