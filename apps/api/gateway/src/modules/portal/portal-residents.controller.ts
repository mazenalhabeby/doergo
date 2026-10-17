import { DenyExternal } from '../../common/decorators';
import { Controller, Get, Post, Delete, Body, Param, Query, Request, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RequirePermissionInSpace } from '@hbcfield/shared';
import { portalScope } from '../../common/portal-scope';
import { PortalAdminControllerBase } from './portal-admin-controller.base';
import {
  listCustomers,
  portalListAvailableUnits,
  portalListAssignableCustomers,
  updateCustomer,
  createCustomer,
  portalUpdateUnit,
  portalCreateUnit,
  createInvitation,
  resendInvitation,
  portalRemoveClient,
} from '@hbcfield/shared/microservices';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
/** /portal/admin — residents: who can be invited, inviting, sending again, removing. */
@ApiTags('portal-admin')
@ApiBearerAuth()
@Controller('portal/admin')
export class PortalResidentsController extends PortalAdminControllerBase {
  // ── Residents (B2C, per portal) ──

  @Get('residents')
  // The resident register (names, email, phone) is the portal's management
  // surface — the invite/remove screen — not the request inbox. Answerers see
  // who sent a request on the request itself.
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: 'List a portal’s residents' })
  async residents(
    @Query('portalId') portalId: string | undefined,
    @Query('search') search: string | undefined,
    @Request() req: AuthedRequest,
  ) {
    const scopeSpaceIds = portalScope(req.user, 'canManagePortals');
    if (scopeSpaceIds !== undefined) {
      // Workspace-scoped: the CRM list below knows nothing about portal reach,
      // so the portal is checked HERE first — and without one, "every resident
      // of every portal" is an org-wide question.
      if (!portalId) throw new BadRequestException('Pick a portal');
      await this.assertManageReach(req, { portalId });
    }
    return this.auth(listCustomers, {
      organizationId: callerOrgId(req.user),
      portalResident: true,
      portalId,
      search,
      limit: 100,
    });
  }

  @Get('portals/:id/available-units')
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: "Vacant apartments in the portal's space, for the invite picker" })
  availableUnits(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.auth(portalListAvailableUnits, {
      organizationId: callerOrgId(req.user),
      portalId: id,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Get('portals/:id/available-customers')
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: "Existing CRM customers (non-residents) in the portal's space, for the invite picker" })
  availableCustomers(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.auth(portalListAssignableCustomers, {
      organizationId: callerOrgId(req.user),
      portalId: id,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Post('residents')
  // Closed to externals: this creates (or promotes) a client record AND issues a
  // customer ACCOUNT invitation — the organization deciding who gets into its
  // app. Workspace-scoped internal managers may, for a portal in reach.
  @RequirePermissionInSpace('canManagePortals')
  @DenyExternal()
  @ApiOperation({
    summary: 'Invite a resident into a portal (assign an existing apartment or create one + invite code)',
  })
  async inviteResident(
    @Body()
    body: {
      portalId: string;
      customerId?: string;
      name?: string;
      email?: string;
      unitId?: string;
      unitName?: string;
      unitAddress?: string;
    },
    @Request() req: AuthedRequest,
  ) {
    const orgId = callerOrgId(req.user);
    const scopeSpaceIds = portalScope(req.user, 'canManagePortals');
    // Every id the body names, in reach, BEFORE anything is created: the CRM and
    // invitation calls below are org-scoped only.
    if (!body?.portalId) throw new BadRequestException('Pick a portal');
    await this.assertManageReach(req, { portalId: body.portalId, customerId: body.customerId, unitId: body.unitId });
    // Promote an EXISTING CRM customer into the portal, or create a new one.
    // Name is optional for new — the resident sets their own name on register.
    let customer: any;
    if (body.customerId) {
      const updRes: any = await this.auth(updateCustomer, {
        id: body.customerId,
        organizationId: orgId,
        actorId: req.user.id,
        dto: { isPortalResident: true, portalId: body.portalId, ...(body.email ? { email: body.email } : {}) },
      });
      customer = updRes?.data ?? updRes;
    } else {
      const initialName = body.name?.trim() || body.unitName?.trim() || 'Pending client';
      const customerRes: any = await this.auth(createCustomer, {
        organizationId: orgId,
        dto: { name: initialName, email: body.email, isPortalResident: true, portalId: body.portalId },
      });
      customer = customerRes?.data ?? customerRes;
    }
    // Assign an EXISTING vacant apartment, or create a new one from free text.
    const unit: any = body.unitId
      ? await this.auth(portalUpdateUnit, {
          id: body.unitId,
          organizationId: orgId,
          customerId: customer.id,
          portalId: body.portalId,
          isPrimary: true,
          scopeSpaceIds,
        })
      : await this.auth(portalCreateUnit, {
          organizationId: orgId,
          customerId: customer.id,
          portalId: body.portalId,
          name: body.unitName?.trim() || 'Unit',
          address: body.unitAddress,
          scopeSpaceIds,
        });
    const inviteRes: any = await this.auth(createInvitation, {
      targetRole: 'CUSTOMER',
      organizationId: orgId,
      createdById: req.user.id,
      creatorRole: req.user.role,
      customerId: customer.id,
      unitId: unit.id,
      portalId: body.portalId,
      email: body.email,
    });
    return { customer, unit, code: inviteRes?.data?.code, invite: inviteRes };
  }

  @Post('residents/:customerId/resend-invite')
  // Closed to externals: sends a customer-account invitation (see above).
  @RequirePermissionInSpace('canManagePortals')
  @DenyExternal()
  @ApiOperation({ summary: "Re-send a pending client's invite by email" })
  async resendResidentInvite(@Param('customerId') customerId: string, @Request() req: AuthedRequest) {
    await this.assertManageReach(req, { customerId });
    return this.auth(resendInvitation, {
      organizationId: callerOrgId(req.user),
      customerId,
    });
  }

  @Delete('residents/:customerId')
  // Closed to externals: revokes a customer ACCOUNT (their app login).
  @RequirePermissionInSpace('canManagePortals')
  @DenyExternal()
  @ApiOperation({ summary: 'Remove a client from the portal (revokes app access, detaches, vacates units)' })
  async removeResident(@Param('customerId') customerId: string, @Request() req: AuthedRequest) {
    const result: any = await this.auth(portalRemoveClient, {
      organizationId: callerOrgId(req.user),
      customerId,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
    // Instantly revoke the deactivated logins (don't wait for the 60s token-cache TTL).
    const ids: string[] = result?.data?.deactivatedUserIds ?? [];
    await Promise.all(ids.map((uid) => this.authCache.invalidateUser(uid).catch(() => undefined)));
    return result;
  }
}
