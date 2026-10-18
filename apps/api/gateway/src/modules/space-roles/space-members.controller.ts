import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  ForbiddenException,
  UseInterceptors,
} from '@nestjs/common';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  assertAnyAuthority,
  grantCeiling,
  managesMembersOrgWide,
  outrankCeiling,
  spaceMemberAuthority,
} from './space-member-access';
import { UpdateMemberRateDto, UpdateMemberRolesDto } from './space-roles.dto';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { assertCanManageSpace } from './space-roles-controller-helpers';
import { SpaceRolesControllerBase } from './space-roles-controller.base';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
import { AssignSpaceMemberDto, MemberRoutingDto } from './dto/role-bodies.dto';
/**
 * /spaces/:spaceId/members — a workspace's people: the list, assigning, their
 * roles, their routing, their rate, removing.
 */
@ApiTags('space-roles')
@ApiBearerAuth()
@RequirePlan('shift_scheduling')
@UseInterceptors(LabourCostInterceptor)
@Controller()
export class SpaceMembersController extends SpaceRolesControllerBase {
  // Member endpoints allow EITHER org canManageUsers OR the space-manager
  // delegation (canManageUsers within THIS space). Enforced manually against the
  // route's spaceId — so the generic org-only guard is intentionally omitted.

  @Get('spaces/:spaceId/members')
  @ApiOperation({ summary: 'List members of a space with their roles + routing' })
  listMembers(@Param('spaceId') spaceId: string, @Request() req: AuthedRequest) {
    assertCanManageSpace(req.user, spaceId);
    // ⚠️ Cost rates are stripped by LabourCostInterceptor for anyone without
    // canViewLabourCost: managing a workspace's people is not the same as being
    // allowed to see what their hours cost the company.
    return this.service.listMembers({ spaceId, organizationId: callerOrgId(req.user) });
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
  @ApiOperation({ summary: "Set a member's work role, management role and billing in this workspace" })
  updateMemberRoles(
    @Param('spaceId') spaceId: string,
    @Param('memberId') memberId: string,
    @Body() body: UpdateMemberRolesDto,
    @Request() req: AuthedRequest,
  ) {
    const authority = spaceMemberAuthority(req.user, spaceId);
    assertAnyAuthority(authority);
    return this.thenRebill(
      req,
      this.service.updateMemberRoles({
        spaceId,
        memberId,
        organizationId: callerOrgId(req.user),
        workRoleId: body.workRoleId,
        managementRoleId: body.managementRoleId,
        allowSecondRole: body.allowSecondRole,
        billBy: body.billBy,
        hoursBasis: body.hoursBasis,
        // The management role is authority: same ceiling as assigning one.
        requesterPerms: grantCeiling(req.user, spaceId),
        authority,
        outrankCheck: !managesMembersOrgWide(req.user),
      }),
    );
  }

  /**
   * Put somebody into this workspace (with a role), or change the role they
   * hold here. Adding needs `canAddSpaceMembers` here, a management role
   * `canGrantSpaceRoles` (ceiling applies), a trade `canManageUsers` here —
   * decided in the service, where the role's kind is known.
   */
  @Post('spaces/:spaceId/members')
  @ApiOperation({ summary: 'Assign a member to a space with a role' })
  assignMember(@Param('spaceId') spaceId: string, @Body() body: AssignSpaceMemberDto, @Request() req: AuthedRequest) {
    const authority = spaceMemberAuthority(req.user, spaceId);
    assertAnyAuthority(authority);
    return this.thenRebill(
      req,
      this.service.assignMember({
        spaceId,
        userId: body.userId,
        spaceRoleId: body.spaceRoleId ?? null,
        organizationId: callerOrgId(req.user),
        createdById: req.user.id,
        // The role being handed out is loaded in the service, so the ceiling is
        // checked there. Null means "no ceiling" and is set ONLY for an admin,
        // who holds everything and could never trip it.
        requesterPerms: grantCeiling(req.user, spaceId),
        authority,
        outrankCheck: !managesMembersOrgWide(req.user),
      }),
    );
  }

  /** Take somebody off this workspace — `canAddSpaceMembers` here, never somebody who holds more than you. */
  @Delete('spaces/:spaceId/members/:memberId')
  @ApiOperation({ summary: 'Remove a member from a space' })
  removeMember(@Param('spaceId') spaceId: string, @Param('memberId') memberId: string, @Request() req: AuthedRequest) {
    if (!spaceMemberAuthority(req.user, spaceId).addMembers) {
      throw new ForbiddenException('You do not have permission to remove people from this workspace');
    }
    return this.thenRebill(
      req,
      this.service.removeMember({
        spaceId,
        memberId,
        organizationId: callerOrgId(req.user),
        outrankPerms: outrankCeiling(req.user, spaceId),
      }),
    );
  }

  @Patch('spaces/:spaceId/members/:memberId/routing')
  @ApiOperation({ summary: 'Set who is notified about / who this member may contact, in this space' })
  updateMemberRouting(
    @Param('spaceId') spaceId: string,
    @Param('memberId') memberId: string,
    @Body()
    body: MemberRoutingDto,
    @Request() req: AuthedRequest,
  ) {
    assertCanManageSpace(req.user, spaceId);
    return this.service.updateMemberRouting({ ...body, spaceId, memberId, organizationId: callerOrgId(req.user) });
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
    @Request() req: AuthedRequest,
  ) {
    assertCanManageSpace(req.user, spaceId);
    // A cost from somebody who may not see costs is refused by LabourCostInterceptor.
    return this.service.updateMemberRate({
      spaceId,
      memberId,
      organizationId: callerOrgId(req.user),
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
