import { Controller, Get, Post, Patch, Delete, Body, Param, Inject, Request, ForbiddenException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RequirePermission } from '@hbcfield/shared';

/**
 * Apartments / Units directory for a space (the `apartments` module). The unit
 * is the hub: a resident (customerId) can live in it and workers (workerIds) are
 * responsible for it. Independent of the B2C portal — a space can run the units
 * directory for internal ops without exposing a customer portal.
 */
@ApiTags('space-units')
@ApiBearerAuth()
@Controller('spaces/:spaceId/units')
export class SpaceUnitsController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject('TASK_SERVICE') private readonly taskClient: ClientProxy,
  ) {}
  private auth(cmd: string, payload: any) {
    return firstValueFrom(this.authClient.send({ cmd }, payload));
  }

  /** The space MUST have the apartments module enabled. */
  private async requireModule(spaceId: string, organizationId: string) {
    const res: any = await firstValueFrom(this.taskClient.send({ cmd: 'get_effective_modules' }, { id: spaceId, organizationId }));
    const mods: string[] = res?.data?.enabledModules ?? res?.enabledModules ?? [];
    if (!mods.includes('apartments')) {
      throw new ForbiddenException('This space does not have the Apartments module enabled');
    }
  }

  @Get()
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: "The space's apartments / units" })
  async list(@Param('spaceId') spaceId: string, @Request() req: any) {
    await this.requireModule(spaceId, req.user.organizationId);
    return this.auth('portal_list_space_units', { organizationId: req.user.organizationId, spaceId });
  }

  @Post()
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Add an apartment / unit to this space' })
  async create(@Param('spaceId') spaceId: string, @Body() body: { name?: string; address?: string; lat?: number; lng?: number; contactName?: string; contactPhone?: string; residentUserId?: string | null; customerId?: string | null }, @Request() req: any) {
    await this.requireModule(spaceId, req.user.organizationId);
    return this.auth('portal_create_unit', {
      organizationId: req.user.organizationId, spaceId,
      name: body.name?.trim() || body.address || 'Unit',
      address: body.address, lat: body.lat, lng: body.lng,
      contactName: body.contactName, contactPhone: body.contactPhone,
      residentUserId: body.residentUserId, customerId: body.customerId,
    });
  }

  @Patch(':unitId')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Update an apartment (name/address, workers, resident)' })
  async update(@Param('spaceId') spaceId: string, @Param('unitId') unitId: string, @Body() body: any, @Request() req: any) {
    await this.requireModule(spaceId, req.user.organizationId);
    // scopeCustomerId is a customer-record concern; strip any client override.
    const { scopeCustomerId: _drop, ...rest } = body ?? {};
    return this.auth('portal_update_unit', { id: unitId, organizationId: req.user.organizationId, ...rest });
  }

  @Delete(':unitId')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Remove an apartment / unit' })
  async remove(@Param('spaceId') spaceId: string, @Param('unitId') unitId: string, @Request() req: any) {
    await this.requireModule(spaceId, req.user.organizationId);
    return this.auth('portal_delete_unit', { id: unitId, organizationId: req.user.organizationId });
  }
}

/** A single apartment/unit by id (org-scoped) — for the apartment detail page. */
@ApiTags('units')
@ApiBearerAuth()
@Controller('units')
export class UnitDetailController {
  constructor(@Inject('AUTH_SERVICE') private readonly authClient: ClientProxy) {}

  @Get(':id')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get one apartment / unit with its resident' })
  get(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(this.authClient.send({ cmd: 'portal_get_unit' }, { id, organizationId: req.user.organizationId }));
  }
}
