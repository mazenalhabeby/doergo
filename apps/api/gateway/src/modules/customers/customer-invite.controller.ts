import { Controller, Post, Body, Param, Request, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DenyExternal } from '../../common/decorators';
import { CustomersControllerBase } from './customers-controller.base';
import {
  portalListUnits,
  portalGet,
  portalEnsureForSpace,
  portalCreateUnit,
  createInvitation,
  updateCustomer,
  resendInvitation,
} from '@hbcfield/shared/microservices';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
import { InviteCustomerDto } from './dto/customer-bodies.dto';
/** /customers/:id — inviting a client into the portal, and sending the invitation again. */
@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomerInviteController extends CustomersControllerBase {
  @Post(':id/invite')
  // Bringing a client into the app is the organization's act, not a workspace's.
  @DenyExternal()
  @ApiOperation({ summary: 'Invite this customer to the app (B2C Portal) — returns a code' })
  async invite(@Param('id') id: string, @Body() body: InviteCustomerDto, @Request() req: AuthedRequest) {
    const orgId = callerOrgId(req.user);
    /*
      Both reads and the write below carry the CALLER, like every other CRM
      route: customers.service decides with the caller's CRM caps and their
      ownership of THIS record. Without it the invite was judged as nobody in
      particular, so the route-level permission was the only check on whose
      client could be flipped into a portal resident.
    */
    const caller = this.caller(req);
    const customer = await this.managedCustomer(id, orgId, caller);
    if (!customer.spaceId) throw new BadRequestException('Customer is not attached to a space');
    await this.requireSpaceModule(customer.spaceId, orgId, 'b2c_portal');

    const email = body.email?.trim() || customer.email;
    if (!email) throw new BadRequestException('An email is required to invite this customer');

    // Which portal (= which entity + which categories the client will see)?
    // Priority: (1) the customer's assigned unit's OWN portal — the apartment
    // they hold decides their portal; (2) an explicitly-chosen portalId from the
    // caller (validated to belong to this customer's space); (3) the space's
    // default portal (single-portal spaces / no choice needed).
    const units: any[] = (await this.auth(portalListUnits, { organizationId: orgId, customerId: id })) || [];
    let unit: any = units.find((u) => u.isPrimary) ?? units[0];
    let portalId: string | undefined = unit?.portalId ?? undefined;
    if (!portalId && body.portalId) {
      const p: any = await this.auth(portalGet, { id: body.portalId, organizationId: orgId });
      const portal = p?.data ?? p;
      if (!portal || portal.spaceId !== customer.spaceId) {
        throw new BadRequestException('Invalid portal for this customer');
      }
      portalId = body.portalId;
    }
    if (!portalId) {
      const portalRes: any = await this.auth(portalEnsureForSpace, {
        organizationId: orgId,
        spaceId: customer.spaceId,
      });
      portalId = portalRes?.data?.id ?? portalRes?.id;
    }
    if (!unit) {
      unit = await this.auth(portalCreateUnit, {
        organizationId: orgId,
        customerId: id,
        portalId,
        name: customer.name,
        address: customer.address,
      });
    }
    const inviteRes: any = await this.auth(createInvitation, {
      targetRole: 'CUSTOMER',
      organizationId: orgId,
      createdById: req.user.id,
      creatorRole: req.user.role,
      customerId: id,
      unitId: unit.id,
      portalId,
      email,
    });
    // Flip the CRM record into a portal resident + advance the stage to Customer
    // (an invited app user has converted). Status change is auto-logged.
    await this.auth(updateCustomer, {
      id,
      organizationId: orgId,
      actorId: req.user.id,
      caller,
      dto: { isPortalResident: true, portalId, status: 'CUSTOMER' },
    });
    return { data: { code: inviteRes?.data?.code, email } };
  }

  @Post(':id/resend-invite')
  @DenyExternal()
  @ApiOperation({ summary: "Re-send a customer's app invite" })
  async resendInvite(@Param('id') id: string, @Request() req: AuthedRequest) {
    // The same door as the invite: manage where the client is filed. It used to
    // re-send for any client id on the org-wide flag alone.
    await this.managedCustomer(id, callerOrgId(req.user), this.caller(req));
    return this.auth(resendInvitation, { organizationId: callerOrgId(req.user), customerId: id });
  }
}
