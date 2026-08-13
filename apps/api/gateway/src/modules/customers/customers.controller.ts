import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  Request,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { RequirePermission } from '../../common/decorators';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';

interface CustomerDto {
  name?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive?: boolean;
  spaceId?: string | null; // per-space CRM
  ownerId?: string | null; // sales owner
  status?: string; // CRM lifecycle stage
}

/**
 * Customers. Two overlapping uses on ONE model:
 *  - org-level customer CRUD (portal residents management — reads with
 *    canViewAllTasks, existing behaviour), and
 *  - per-space CRM: a space's Customers list (?spaceId=), gated on the space's
 *    `crm` module. "Invite to app" (B2C Portal module) reuses the portal flow.
 */
@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject('TASK_SERVICE') private readonly taskClient: ClientProxy,
    private readonly authCache: AuthTokenCache,
  ) {}

  private auth(cmd: string, payload: any) {
    return firstValueFrom(this.authClient.send({ cmd }, payload));
  }

  /** Assert the space has a module enabled (per-space gate; defence in depth). */
  private async requireSpaceModule(spaceId: string | null | undefined, organizationId: string, mod: string) {
    if (!spaceId) throw new BadRequestException('spaceId is required');
    const res: any = await firstValueFrom(
      this.taskClient.send({ cmd: 'get_effective_modules' }, { id: spaceId, organizationId }),
    );
    const mods: string[] = res?.data?.enabledModules ?? res?.enabledModules ?? [];
    if (!mods.includes(mod)) {
      throw new ForbiddenException(`This space does not have the ${mod === 'crm' ? 'CRM' : 'B2C Portal'} module enabled`);
    }
  }

  @Get()
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'List customers (org-wide, or a space via ?spaceId=)' })
  async list(
    @Request() req: any,
    @Query('search') search?: string,
    @Query('status') status?: 'active' | 'inactive' | 'all',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('portalResident') portalResident?: string,
    @Query('spaceId') spaceId?: string,
  ) {
    return this.auth('list_customers', {
      organizationId: req.user.organizationId,
      search,
      status,
      spaceId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      // 'false' → B2B customers only; 'true' → residents only; omitted → all.
      portalResident: portalResident === undefined ? undefined : portalResident === 'true',
    });
  }

  @Get(':id')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get a customer' })
  async get(@Param('id') id: string, @Request() req: any) {
    return this.auth('get_customer', { id, organizationId: req.user.organizationId });
  }

  @Post()
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Create a customer (CRM record; ?spaceId scopes it to a space)' })
  async create(@Body() dto: CustomerDto, @Request() req: any) {
    const orgId = req.user.organizationId;
    if (dto.spaceId) {
      await this.requireSpaceModule(dto.spaceId, orgId, 'crm');
      dto = { ...dto, ownerId: dto.ownerId ?? req.user.id };
    }
    return this.auth('create_customer', { organizationId: orgId, dto });
  }

  @Patch(':id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Update a customer' })
  async update(@Param('id') id: string, @Body() dto: CustomerDto, @Request() req: any) {
    return this.auth('update_customer', { id, organizationId: req.user.organizationId, dto, actorId: req.user.id });
  }

  // ── Addresses (a customer's units; one is primary → shown on the map) ──
  @Get(':id/addresses')
  @RequirePermission('canViewAllTasks')
  listAddresses(@Param('id') id: string, @Request() req: any) {
    return this.auth('portal_list_units', { organizationId: req.user.organizationId, customerId: id });
  }

  @Post(':id/addresses')
  @RequirePermission('canManageUsers')
  addAddress(@Param('id') id: string, @Body() body: { name?: string; address?: string; lat?: number; lng?: number; isPrimary?: boolean }, @Request() req: any) {
    return this.auth('portal_create_unit', {
      organizationId: req.user.organizationId, customerId: id,
      name: body.name?.trim() || body.address || 'Address',
      address: body.address, lat: body.lat, lng: body.lng, isPrimary: body.isPrimary,
    });
  }

  @Patch(':id/addresses/:unitId')
  @RequirePermission('canManageUsers')
  updateAddress(@Param('unitId') unitId: string, @Body() body: any, @Request() req: any) {
    return this.auth('portal_update_unit', { id: unitId, organizationId: req.user.organizationId, ...body });
  }

  @Post(':id/addresses/:unitId/primary')
  @RequirePermission('canManageUsers')
  setPrimaryAddress(@Param('unitId') unitId: string, @Request() req: any) {
    return this.auth('portal_set_primary_unit', { id: unitId, organizationId: req.user.organizationId });
  }

  @Delete(':id/addresses/:unitId')
  @RequirePermission('canManageUsers')
  deleteAddress(@Param('unitId') unitId: string, @Request() req: any) {
    return this.auth('portal_delete_unit', { id: unitId, organizationId: req.user.organizationId });
  }

  // ── CRM activity timeline ──
  @Get(':id/activities')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: "A customer's CRM timeline (notes, calls, reminders, status)" })
  listActivities(@Param('id') id: string, @Request() req: any) {
    return this.auth('list_customer_activities', { customerId: id, organizationId: req.user.organizationId });
  }

  @Post(':id/activities')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Log an activity / note / reminder on a customer' })
  addActivity(@Param('id') id: string, @Body() body: { type?: string; body?: string; dueAt?: string }, @Request() req: any) {
    return this.auth('add_customer_activity', {
      customerId: id, organizationId: req.user.organizationId, authorId: req.user.id,
      type: body.type, body: body.body, dueAt: body.dueAt,
    });
  }

  @Patch(':id/activities/:activityId')
  @RequirePermission('canManageUsers')
  updateActivity(@Param('id') id: string, @Param('activityId') activityId: string, @Body() body: { body?: string; dueAt?: string | null; done?: boolean }, @Request() req: any) {
    return this.auth('update_customer_activity', {
      id: activityId, customerId: id, organizationId: req.user.organizationId,
      body: body.body, dueAt: body.dueAt, done: body.done,
    });
  }

  @Delete(':id/activities/:activityId')
  @RequirePermission('canManageUsers')
  deleteActivity(@Param('id') id: string, @Param('activityId') activityId: string, @Request() req: any) {
    return this.auth('delete_customer_activity', { id: activityId, customerId: id, organizationId: req.user.organizationId });
  }

  @Delete(':id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Deactivate a customer (soft delete; revokes any app login)' })
  async remove(@Param('id') id: string, @Request() req: any) {
    const result: any = await this.auth('delete_customer', { id, organizationId: req.user.organizationId });
    // Instantly revoke the deactivated portal logins (don't wait for the 60s
    // token-cache TTL) — consistent with every other access-change path.
    const ids: string[] = result?.deactivatedUserIds ?? [];
    await Promise.all(ids.map((uid) => this.authCache.invalidateUser(uid).catch(() => undefined)));
    return result;
  }

  @Post(':id/invite')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Invite this customer to the app (B2C Portal) — returns a code' })
  async invite(@Param('id') id: string, @Body() body: { email?: string }, @Request() req: any) {
    const orgId = req.user.organizationId;
    const custRes: any = await this.auth('get_customer', { id, organizationId: orgId });
    const customer = custRes?.data ?? custRes;
    if (!customer) throw new BadRequestException('Customer not found');
    if (!customer.spaceId) throw new BadRequestException('Customer is not attached to a space');
    await this.requireSpaceModule(customer.spaceId, orgId, 'b2c_portal');

    const email = body.email?.trim() || customer.email;
    if (!email) throw new BadRequestException('An email is required to invite this customer');

    // Reuse the portal flow: ensure a portal for the space → unit → invitation.
    const portalRes: any = await this.auth('portal_ensure_for_space', { organizationId: orgId, spaceId: customer.spaceId });
    const portalId = portalRes?.data?.id ?? portalRes?.id;
    // Reuse the customer's assigned apartment / primary address as their unit —
    // don't create a duplicate. Only create one if they have none yet.
    const units: any[] = (await this.auth('portal_list_units', { organizationId: orgId, customerId: id })) || [];
    let unit: any = units.find((u) => u.isPrimary) ?? units[0];
    if (!unit) {
      unit = await this.auth('portal_create_unit', { organizationId: orgId, customerId: id, portalId, name: customer.name, address: customer.address });
    }
    const inviteRes: any = await this.auth('create_invitation', {
      targetRole: 'CUSTOMER', organizationId: orgId, createdById: req.user.id, creatorRole: req.user.role,
      customerId: id, unitId: unit.id, portalId, email,
    });
    // Flip the CRM record into a portal resident + advance the stage to Customer
    // (an invited app user has converted). Status change is auto-logged.
    await this.auth('update_customer', { id, organizationId: orgId, actorId: req.user.id, dto: { isPortalResident: true, portalId, status: 'CUSTOMER' } });
    return { data: { code: inviteRes?.data?.code, email } };
  }

  @Post(':id/resend-invite')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: "Re-send a customer's app invite" })
  async resendInvite(@Param('id') id: string, @Request() req: any) {
    return this.auth('resend_invitation', { organizationId: req.user.organizationId, customerId: id });
  }
}
