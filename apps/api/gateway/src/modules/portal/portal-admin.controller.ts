import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  Inject,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RequirePermission } from '@hbcfield/shared';

/**
 * Office-facing multi-portal management (staff, canManageUsers). Org always from
 * the token. An org can run several portals; categories & residents belong to a
 * portal (portalId in the body/query).
 */
@ApiTags('portal-admin')
@ApiBearerAuth()
@Controller('portal/admin')
export class PortalAdminController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject('TASK_SERVICE') private readonly taskClient: ClientProxy,
  ) {}

  private auth(cmd: string, payload: any) {
    return firstValueFrom(this.authClient.send({ cmd }, payload));
  }

  // ── Portals ──

  @Get('portals')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'List the org’s portals' })
  listPortals(@Request() req: any) {
    return this.auth('portal_list', { organizationId: req.user.organizationId });
  }

  @Post('portals')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Create a portal (from a template)' })
  createPortal(@Body() body: { templateKey?: string; name?: string }, @Request() req: any) {
    return this.auth('portal_create', { ...body, organizationId: req.user.organizationId });
  }

  @Get('portals/:id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Get a portal (config + categories)' })
  getPortal(@Param('id') id: string, @Request() req: any) {
    return this.auth('portal_get', { id, organizationId: req.user.organizationId });
  }

  @Get('portals/:id/requests')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'List every request in a portal (all clients)' })
  portalRequests(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'portal_list_requests_by_portal' },
        { organizationId: req.user.organizationId, portalId: id },
      ),
    );
  }

  @Patch('portals/:id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Update a portal (name / switch type)' })
  updatePortal(@Param('id') id: string, @Body() body: { name?: string; templateKey?: string; reseed?: boolean }, @Request() req: any) {
    return this.auth('portal_update', { ...body, id, organizationId: req.user.organizationId });
  }

  @Delete('portals/:id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Delete a portal' })
  deletePortal(@Param('id') id: string, @Request() req: any) {
    return this.auth('portal_delete', { id, organizationId: req.user.organizationId });
  }

  // ── Intake categories (per portal) ──

  @Post('categories')
  @RequirePermission('canManageUsers')
  createCategory(@Body() body: any, @Request() req: any) {
    return this.auth('portal_create_category', { ...body, organizationId: req.user.organizationId });
  }

  @Patch('categories/:id')
  @RequirePermission('canManageUsers')
  updateCategory(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.auth('portal_update_category', { ...body, id, organizationId: req.user.organizationId });
  }

  @Delete('categories/:id')
  @RequirePermission('canManageUsers')
  deleteCategory(@Param('id') id: string, @Request() req: any) {
    return this.auth('portal_delete_category', { id, organizationId: req.user.organizationId });
  }

  @Post('categories/reorder')
  @RequirePermission('canManageUsers')
  reorderCategories(@Body() body: { portalId: string; orderedIds: string[] }, @Request() req: any) {
    return this.auth('portal_reorder_categories', { ...body, organizationId: req.user.organizationId });
  }

  // ── Residents (B2C, per portal) ──

  @Get('residents')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'List a portal’s residents' })
  residents(@Query('portalId') portalId: string | undefined, @Query('search') search: string | undefined, @Request() req: any) {
    return this.auth('list_customers', { organizationId: req.user.organizationId, portalResident: true, portalId, search, limit: 100 });
  }

  @Post('residents')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Invite a resident into a portal (customer + unit + invite code)' })
  async inviteResident(
    @Body() body: { portalId: string; name?: string; email?: string; unitName: string; unitAddress?: string },
    @Request() req: any,
  ) {
    const orgId = req.user.organizationId;
    // Name is optional — the resident sets their own name when they register
    // (synced onto this customer on accept). Until then we label the record by
    // its unit/reference so the office can still recognise it.
    const initialName = body.name?.trim() || body.unitName?.trim() || 'Pending client';
    const customerRes: any = await this.auth('create_customer', {
      organizationId: orgId,
      dto: { name: initialName, email: body.email, isPortalResident: true, portalId: body.portalId },
    });
    const customer = customerRes?.data ?? customerRes;
    const unit: any = await this.auth('portal_create_unit', {
      organizationId: orgId,
      customerId: customer.id,
      portalId: body.portalId,
      name: body.unitName,
      address: body.unitAddress,
    });
    const inviteRes: any = await this.auth('create_invitation', {
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
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: "Re-send a pending client's invite by email" })
  async resendResidentInvite(@Param('customerId') customerId: string, @Request() req: any) {
    return this.auth('resend_invitation', {
      organizationId: req.user.organizationId,
      customerId,
    });
  }

  // ── Unit CRUD (per resident) ──

  @Post('units')
  @RequirePermission('canManageUsers')
  createUnit(@Body() body: any, @Request() req: any) {
    return this.auth('portal_create_unit', { ...body, organizationId: req.user.organizationId });
  }

  @Patch('units/:id')
  @RequirePermission('canManageUsers')
  updateUnit(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.auth('portal_update_unit', { ...body, id, organizationId: req.user.organizationId });
  }

  @Delete('units/:id')
  @RequirePermission('canManageUsers')
  deleteUnit(@Param('id') id: string, @Request() req: any) {
    return this.auth('portal_delete_unit', { id, organizationId: req.user.organizationId });
  }

  @Get('units')
  @RequirePermission('canManageUsers')
  listUnits(@Query('customerId') customerId: string | undefined, @Request() req: any) {
    return this.auth('portal_admin_list_units', { organizationId: req.user.organizationId, customerId });
  }

  // ── A resident's requests (office view) ──

  @Get('requests')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: "List a resident's portal requests" })
  requests(@Query('customerId') customerId: string, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'portal_list_requests' }, { organizationId: req.user.organizationId, customerId }),
    );
  }
}
