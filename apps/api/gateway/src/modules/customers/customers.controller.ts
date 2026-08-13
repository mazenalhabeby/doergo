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
    return this.auth('update_customer', { id, organizationId: req.user.organizationId, dto });
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
    const unit: any = await this.auth('portal_create_unit', {
      organizationId: orgId, customerId: id, portalId, name: customer.name, address: customer.address,
    });
    const inviteRes: any = await this.auth('create_invitation', {
      targetRole: 'CUSTOMER', organizationId: orgId, createdById: req.user.id, creatorRole: req.user.role,
      customerId: id, unitId: unit.id, portalId, email,
    });
    // Flip the CRM record into a portal resident.
    await this.auth('update_customer', { id, organizationId: orgId, dto: { isPortalResident: true, portalId } });
    return { data: { code: inviteRes?.data?.code, email } };
  }

  @Post(':id/resend-invite')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: "Re-send a customer's app invite" })
  async resendInvite(@Param('id') id: string, @Request() req: any) {
    return this.auth('resend_invitation', { organizationId: req.user.organizationId, customerId: id });
  }
}
