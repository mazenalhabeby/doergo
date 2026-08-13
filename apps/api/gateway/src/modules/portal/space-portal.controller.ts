import { Controller, Get, Post, Patch, Delete, Body, Param, Inject, Request, ForbiddenException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RequirePermission } from '@hbcfield/shared';

/**
 * Per-space B2C portal: configuration + unit/apartment catalog. The portal lives
 * IN the space (Portal.spaceId). A "unit" is the portal's entity — an apartment
 * for a rental portal — and can be assigned to a customer (→ their primary
 * address). Staff-only (canManageUsers).
 */
@ApiTags('space-portal')
@ApiBearerAuth()
@Controller('spaces/:spaceId/portal')
export class SpacePortalController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject('TASK_SERVICE') private readonly taskClient: ClientProxy,
  ) {}
  private auth(cmd: string, payload: any) {
    return firstValueFrom(this.authClient.send({ cmd }, payload));
  }

  /** The whole surface is a paid feature — the space MUST have b2c_portal on. */
  private async requirePortalModule(spaceId: string, organizationId: string) {
    const res: any = await firstValueFrom(this.taskClient.send({ cmd: 'get_effective_modules' }, { id: spaceId, organizationId }));
    const mods: string[] = res?.data?.enabledModules ?? res?.enabledModules ?? [];
    if (!mods.includes('b2c_portal')) {
      throw new ForbiddenException('This space does not have the B2C Portal module enabled');
    }
  }

  @Get('portals')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: "List the space's client portals (a space can run several)" })
  async listPortals(@Param('spaceId') spaceId: string, @Request() req: any) {
    await this.requirePortalModule(spaceId, req.user.organizationId);
    return this.auth('portal_list', { organizationId: req.user.organizationId, spaceId });
  }

  @Post('portals')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Create a new client portal for this space' })
  async createPortal(@Param('spaceId') spaceId: string, @Body() body: { templateKey?: string; name?: string }, @Request() req: any) {
    await this.requirePortalModule(spaceId, req.user.organizationId);
    return this.auth('portal_create_space', { organizationId: req.user.organizationId, spaceId, templateKey: body.templateKey, name: body.name });
  }

  @Get()
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: "The space's portal config (entity type)" })
  async get(@Param('spaceId') spaceId: string, @Request() req: any) {
    await this.requirePortalModule(spaceId, req.user.organizationId);
    return this.auth('portal_get_for_space', { organizationId: req.user.organizationId, spaceId });
  }

  @Patch()
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: "Set the space portal's entity type" })
  async update(@Param('spaceId') spaceId: string, @Body() body: { templateKey?: string }, @Request() req: any) {
    await this.requirePortalModule(spaceId, req.user.organizationId);
    return this.auth('portal_update_for_space', { organizationId: req.user.organizationId, spaceId, templateKey: body.templateKey });
  }

  // ── Unit / apartment catalog ──
  @Get('units')
  @RequirePermission('canManageUsers')
  async listUnits(@Param('spaceId') spaceId: string, @Request() req: any) {
    await this.requirePortalModule(spaceId, req.user.organizationId);
    return this.auth('portal_list_space_units', { organizationId: req.user.organizationId, spaceId });
  }

  @Post('units')
  @RequirePermission('canManageUsers')
  async addUnit(@Param('spaceId') spaceId: string, @Body() body: { name?: string; address?: string; lat?: number; lng?: number }, @Request() req: any) {
    const orgId = req.user.organizationId;
    await this.requirePortalModule(spaceId, orgId);
    const portal: any = await this.auth('portal_get_for_space', { organizationId: orgId, spaceId });
    return this.auth('portal_create_unit', {
      organizationId: orgId, spaceId, portalId: portal?.data?.id,
      name: body.name?.trim() || body.address || 'Unit',
      address: body.address, lat: body.lat, lng: body.lng,
    });
  }

  @Patch('units/:unitId')
  @RequirePermission('canManageUsers')
  async updateUnit(@Param('spaceId') spaceId: string, @Param('unitId') unitId: string, @Body() body: any, @Request() req: any) {
    await this.requirePortalModule(spaceId, req.user.organizationId);
    return this.auth('portal_update_unit', { id: unitId, organizationId: req.user.organizationId, ...body });
  }

  @Delete('units/:unitId')
  @RequirePermission('canManageUsers')
  async deleteUnit(@Param('spaceId') spaceId: string, @Param('unitId') unitId: string, @Request() req: any) {
    await this.requirePortalModule(spaceId, req.user.organizationId);
    return this.auth('portal_delete_unit', { id: unitId, organizationId: req.user.organizationId });
  }

  @Post('units/:unitId/assign')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Assign this unit to a customer (→ their primary address)' })
  async assign(@Param('spaceId') spaceId: string, @Param('unitId') unitId: string, @Body() body: { customerId: string }, @Request() req: any) {
    const orgId = req.user.organizationId;
    await this.requirePortalModule(spaceId, orgId);
    await this.auth('portal_update_unit', { id: unitId, organizationId: orgId, customerId: body.customerId });
    await this.auth('portal_set_primary_unit', { id: unitId, organizationId: orgId });
    return { data: { success: true } };
  }
}
