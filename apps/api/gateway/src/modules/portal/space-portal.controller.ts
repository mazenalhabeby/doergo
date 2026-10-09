import { DenyExternal } from '../../common/decorators';
import { Controller, Get, Post, Patch, Delete, Body, Param, Inject, Request, ForbiddenException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RequirePermission, pickUnitFields } from '@hbcfield/shared';
import { SpaceModulesService } from '../../common/space-modules.service';

/**
 * Per-space B2C portal: configuration + unit/apartment catalog. The portal lives
 * IN the space (Portal.spaceId). A "unit" is the portal's entity — an apartment
 * for a rental portal — and can be assigned to a customer (→ their primary
 * address). Staff-only (canManageUsers).
 */
@ApiTags('space-portal')
@ApiBearerAuth()
/*
  The organization's own property, not the work at a site.

  An external supervisor holds `canViewAllTasks` in their space — it is how they
  follow the work they are there to supervise — and this surface was gated on
  that same permission, so granting the first silently granted the second and an
  outsider could list the organization's records. The relationship disqualifies
  them, not the permission, so the rule is stated about the relationship.
*/
@DenyExternal()
@Controller('spaces/:spaceId/portal')
export class SpacePortalController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    private readonly spaceModules: SpaceModulesService,
  ) {}
  private auth(cmd: string, payload: any) {
    return firstValueFrom(this.authClient.send({ cmd }, payload));
  }

  /** The whole surface is a paid feature — the space MUST have b2c_portal on. */
  private requirePortalModule(spaceId: string, organizationId: string) {
    return this.spaceModules.assertEnabled(spaceId, organizationId, 'b2c_portal');
  }


  @Get('portals')
  @RequirePermission('canManagePortals')
  @ApiOperation({ summary: "List the space's client portals (a space can run several)" })
  async listPortals(@Param('spaceId') spaceId: string, @Request() req: any) {
    await this.requirePortalModule(spaceId, req.user.organizationId);
    return this.auth('portal_list', { organizationId: req.user.organizationId, spaceId });
  }

  @Post('portals')
  @RequirePermission('canManagePortals')
  @ApiOperation({ summary: 'Create a new client portal for this space' })
  async createPortal(@Param('spaceId') spaceId: string, @Body() body: { templateKey?: string; name?: string }, @Request() req: any) {
    await this.requirePortalModule(spaceId, req.user.organizationId);
    return this.auth('portal_create_space', { organizationId: req.user.organizationId, spaceId, templateKey: body.templateKey, name: body.name });
  }

  @Get()
  @RequirePermission('canManagePortals')
  @ApiOperation({ summary: "The space's portal config (entity type)" })
  async get(@Param('spaceId') spaceId: string, @Request() req: any) {
    await this.requirePortalModule(spaceId, req.user.organizationId);
    return this.auth('portal_get_for_space', { organizationId: req.user.organizationId, spaceId });
  }

  @Patch()
  @RequirePermission('canManagePortals')
  @ApiOperation({ summary: "Set the space portal's entity type" })
  async update(@Param('spaceId') spaceId: string, @Body() body: { templateKey?: string }, @Request() req: any) {
    await this.requirePortalModule(spaceId, req.user.organizationId);
    return this.auth('portal_update_for_space', { organizationId: req.user.organizationId, spaceId, templateKey: body.templateKey });
  }

  // ── Unit / apartment catalog ──
  @Get('units')
  @RequirePermission('canManagePortals')
  async listUnits(@Param('spaceId') spaceId: string, @Request() req: any) {
    await this.requirePortalModule(spaceId, req.user.organizationId);
    return this.auth('portal_list_space_units', { organizationId: req.user.organizationId, spaceId });
  }

  @Post('units')
  @RequirePermission('canManagePortals')
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
  @RequirePermission('canManagePortals')
  async updateUnit(@Param('spaceId') spaceId: string, @Param('unitId') unitId: string, @Body() body: any, @Request() req: any) {
    await this.requirePortalModule(spaceId, req.user.organizationId);
    // Whitelist explicitly — never spread the untyped body (audit I-B1).
    //
    // This read `{ id, organizationId: req.user.organizationId, ...body }`: the
    // spread came LAST, so a client-supplied `organizationId` overwrote the one
    // from the token. `portal.service.updateUnit` scopes its lookup with
    // `findFirst({ id, organizationId })`, so a manager in org A could pass org B's
    // id and edit org B's unit — a cross-tenant write, stopped only by having to
    // know two cuids. `body` is `any`, so ValidationPipe's whitelist never applied.
    // Same fix as `space-sharing.controller.updateShare`, which found this first.
    // The field list lives in `pickUnitFields` now, shared by all three unit routes.
    return this.auth('portal_update_unit', {
      ...pickUnitFields(body),
      id: unitId,
      organizationId: req.user.organizationId,
      actorId: req.user.id,
    });
  }

  @Delete('units/:unitId')
  @RequirePermission('canManagePortals')
  async deleteUnit(@Param('spaceId') spaceId: string, @Param('unitId') unitId: string, @Request() req: any) {
    await this.requirePortalModule(spaceId, req.user.organizationId);
    return this.auth('portal_delete_unit', { id: unitId, organizationId: req.user.organizationId });
  }

  @Post('units/:unitId/assign')
  @RequirePermission('canManagePortals')
  @ApiOperation({ summary: 'Assign this unit to a customer (→ their primary address)' })
  async assign(@Param('spaceId') spaceId: string, @Param('unitId') unitId: string, @Body() body: { customerId: string }, @Request() req: any) {
    const orgId = req.user.organizationId;
    await this.requirePortalModule(spaceId, orgId);
    await this.auth('portal_update_unit', { id: unitId, organizationId: orgId, customerId: body.customerId });
    await this.auth('portal_set_primary_unit', { id: unitId, organizationId: orgId });
    return { data: { success: true } };
  }
}
