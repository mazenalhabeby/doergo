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
  managerIds?: string[] | null; // assigned sales managers
  status?: string; // CRM lifecycle stage
  // Person vs Company + B2B company fields
  type?: string; // PERSON | COMPANY
  legalName?: string | null;
  website?: string | null;
  industry?: string | null;
  vatId?: string | null;
  regNumber?: string | null;
  details?: { label: string; value: string }[] | null;
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

  /** Caller context for CRM cap resolution + per-record ownership (server-authoritative). */
  private caller(req: any) {
    return { userId: req.user.id, role: req.user.role };
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

  // CRM read/work endpoints are authorization-enforced IN the service against the
  // caller's CRM caps + per-record ownership (see customers.service). We pass the
  // caller and drop the flat @RequirePermission so scoped CRM members (not just
  // canViewAllTasks/canManageUsers holders) can reach their own clients.
  @Get()
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
      caller: this.caller(req),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a customer' })
  async get(@Param('id') id: string, @Request() req: any) {
    return this.auth('get_customer', { id, organizationId: req.user.organizationId, caller: this.caller(req) });
  }

  @Post()
  @ApiOperation({ summary: 'Create a customer (CRM record; ?spaceId scopes it to a space)' })
  async create(@Body() dto: CustomerDto, @Request() req: any) {
    const orgId = req.user.organizationId;
    if (dto.spaceId) {
      await this.requireSpaceModule(dto.spaceId, orgId, 'crm');
      dto = { ...dto, ownerId: dto.ownerId ?? req.user.id };
    }
    return this.auth('create_customer', { organizationId: orgId, dto, caller: this.caller(req) });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a customer' })
  async update(@Param('id') id: string, @Body() dto: CustomerDto, @Request() req: any) {
    // Moving a customer into a space requires that space to have the CRM module
    // (parity with create; the service also validates the space belongs to org).
    if (dto.spaceId) await this.requireSpaceModule(dto.spaceId, req.user.organizationId, 'crm');
    return this.auth('update_customer', { id, organizationId: req.user.organizationId, dto, actorId: req.user.id, caller: this.caller(req) });
  }

  // ── Addresses (a customer's units; one is primary → shown on the map) ──
  // Read gated by CRM reach (get_customer enforces it); writes stay manager-only
  // in Phase 1 (address editing for scoped members is a follow-up).
  @Get(':id/addresses')
  async listAddresses(@Param('id') id: string, @Request() req: any) {
    // Enforce the caller may reach this client before exposing its units.
    await this.auth('get_customer', { id, organizationId: req.user.organizationId, caller: this.caller(req) });
    return this.auth('portal_list_units', { organizationId: req.user.organizationId, customerId: id });
  }

  @Post(':id/addresses')
  @RequirePermission('canManageUsers')
  addAddress(@Param('id') id: string, @Body() body: { name?: string; address?: string; lat?: number; lng?: number; isPrimary?: boolean; contactName?: string; contactPhone?: string }, @Request() req: any) {
    return this.auth('portal_create_unit', {
      organizationId: req.user.organizationId, customerId: id,
      name: body.name?.trim() || body.address || 'Address',
      address: body.address, lat: body.lat, lng: body.lng, isPrimary: body.isPrimary,
      contactName: body.contactName, contactPhone: body.contactPhone,
    });
  }

  @Patch(':id/addresses/:unitId')
  @RequirePermission('canManageUsers')
  updateAddress(@Param('id') id: string, @Param('unitId') unitId: string, @Body() body: any, @Request() req: any) {
    // scopeCustomerId binds the unit to THIS customer (no cross-customer edits);
    // strip any client-sent scope override before forwarding.
    const { scopeCustomerId: _drop, ...rest } = body ?? {};
    return this.auth('portal_update_unit', { id: unitId, organizationId: req.user.organizationId, scopeCustomerId: id, ...rest });
  }

  @Post(':id/addresses/:unitId/primary')
  @RequirePermission('canManageUsers')
  setPrimaryAddress(@Param('id') id: string, @Param('unitId') unitId: string, @Request() req: any) {
    return this.auth('portal_set_primary_unit', { id: unitId, organizationId: req.user.organizationId, customerId: id });
  }

  @Delete(':id/addresses/:unitId')
  @RequirePermission('canManageUsers')
  deleteAddress(@Param('id') id: string, @Param('unitId') unitId: string, @Request() req: any) {
    return this.auth('portal_delete_unit', { id: unitId, organizationId: req.user.organizationId, customerId: id });
  }

  // ── CRM activity timeline (service enforces reach + work cap) ──
  @Get(':id/activities')
  @ApiOperation({ summary: "A customer's CRM timeline (notes, calls, reminders, status)" })
  listActivities(@Param('id') id: string, @Request() req: any) {
    return this.auth('list_customer_activities', { customerId: id, organizationId: req.user.organizationId, caller: this.caller(req) });
  }

  @Post(':id/activities')
  @ApiOperation({ summary: 'Log an activity / note / reminder on a customer' })
  addActivity(@Param('id') id: string, @Body() body: { type?: string; body?: string; dueAt?: string; reminderKind?: string; remindBeforeMin?: number; reminderAssigneeId?: string | null; repeat?: string }, @Request() req: any) {
    return this.auth('add_customer_activity', {
      customerId: id, organizationId: req.user.organizationId, authorId: req.user.id,
      type: body.type, body: body.body, dueAt: body.dueAt,
      reminderKind: body.reminderKind, remindBeforeMin: body.remindBeforeMin,
      reminderAssigneeId: body.reminderAssigneeId, repeat: body.repeat,
      caller: this.caller(req),
    });
  }

  @Patch(':id/activities/:activityId')
  updateActivity(@Param('id') id: string, @Param('activityId') activityId: string, @Body() body: { body?: string; dueAt?: string | null; done?: boolean; reminderKind?: string; remindBeforeMin?: number; reminderAssigneeId?: string | null; repeat?: string }, @Request() req: any) {
    return this.auth('update_customer_activity', {
      id: activityId, customerId: id, organizationId: req.user.organizationId,
      body: body.body, dueAt: body.dueAt, done: body.done,
      reminderKind: body.reminderKind, remindBeforeMin: body.remindBeforeMin,
      reminderAssigneeId: body.reminderAssigneeId, repeat: body.repeat,
      caller: this.caller(req),
    });
  }

  @Delete(':id/activities/:activityId')
  deleteActivity(@Param('id') id: string, @Param('activityId') activityId: string, @Request() req: any) {
    return this.auth('delete_customer_activity', { id: activityId, customerId: id, organizationId: req.user.organizationId, caller: this.caller(req) });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate a customer (soft delete; revokes any app login)' })
  async remove(@Param('id') id: string, @Request() req: any) {
    const result: any = await this.auth('delete_customer', { id, organizationId: req.user.organizationId, caller: this.caller(req) });
    // Instantly revoke the deactivated portal logins (don't wait for the 60s
    // token-cache TTL) — consistent with every other access-change path.
    const ids: string[] = result?.deactivatedUserIds ?? [];
    await Promise.all(ids.map((uid) => this.authCache.invalidateUser(uid).catch(() => undefined)));
    return result;
  }

  @Post(':id/invite')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Invite this customer to the app (B2C Portal) — returns a code' })
  async invite(@Param('id') id: string, @Body() body: { email?: string; portalId?: string }, @Request() req: any) {
    const orgId = req.user.organizationId;
    const custRes: any = await this.auth('get_customer', { id, organizationId: orgId });
    const customer = custRes?.data ?? custRes;
    if (!customer) throw new BadRequestException('Customer not found');
    if (!customer.spaceId) throw new BadRequestException('Customer is not attached to a space');
    await this.requireSpaceModule(customer.spaceId, orgId, 'b2c_portal');

    const email = body.email?.trim() || customer.email;
    if (!email) throw new BadRequestException('An email is required to invite this customer');

    // Which portal (= which entity + which categories the client will see)?
    // Priority: (1) the customer's assigned unit's OWN portal — the apartment
    // they hold decides their portal; (2) an explicitly-chosen portalId from the
    // caller (validated to belong to this customer's space); (3) the space's
    // default portal (single-portal spaces / no choice needed).
    const units: any[] = (await this.auth('portal_list_units', { organizationId: orgId, customerId: id })) || [];
    let unit: any = units.find((u) => u.isPrimary) ?? units[0];
    let portalId: string | undefined = unit?.portalId ?? undefined;
    if (!portalId && body.portalId) {
      const p: any = await this.auth('portal_get', { id: body.portalId, organizationId: orgId });
      const portal = p?.data ?? p;
      if (!portal || portal.spaceId !== customer.spaceId) {
        throw new BadRequestException('Invalid portal for this customer');
      }
      portalId = body.portalId;
    }
    if (!portalId) {
      const portalRes: any = await this.auth('portal_ensure_for_space', { organizationId: orgId, spaceId: customer.spaceId });
      portalId = portalRes?.data?.id ?? portalRes?.id;
    }
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
