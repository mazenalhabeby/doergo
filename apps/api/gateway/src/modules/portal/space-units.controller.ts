import { Controller, Get, Post, Patch, Delete, Body, Param, Inject, Request, ForbiddenException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RequirePermission, RequirePermissionInSpace, spacesGranting, isAdmin, pickUnitFields } from '@hbcfield/shared';
import { SpaceModulesService } from '../../common/space-modules.service';
import { DenyExternal } from '../../common/decorators/deny-external.decorator';

/**
 * Apartments / Units directory for a space (the `apartments` module). The unit
 * is the hub: a resident lives in it — a MEMBER (residentUserId) for staff
 * housing, or a CLIENT (customerId) when the space runs an Apartment-entity B2C
 * portal. Work on the unit is handled by tasks (no standing worker list).
 */
/*
  ⚠️ @DenyExternal on BOTH unit controllers: a unit carries the resident's name
  and contact phone — the organization's own data about its clients. Neither
  External Supervisor nor External Observer is granted anything about
  residents; their `canViewAllTasks` is about following the WORK, and it was
  the only thing between them and this directory.
*/
@ApiTags('space-units')
@ApiBearerAuth()
@DenyExternal()
@Controller('spaces/:spaceId/units')
export class SpaceUnitsController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    private readonly spaceModules: SpaceModulesService,
  ) {}

  /**
   * Units belong to the CLIENT PORTAL now, not to the retired Apartments
   * module. The portal is what still uses them — a client's own address inside
   * a portal — so it gates on its own module. Gating on a module that no longer
   * exists would have made every portal's units unreachable the moment
   * Apartments was removed. Reads included (SpaceModulesService.assertEnabled).
   */
  private requireModule(spaceId: string, organizationId: string) {
    return this.spaceModules.assertEnabled(spaceId, organizationId, 'b2c_portal');
  }
  private auth(cmd: string, payload: any) {
    return firstValueFrom(this.authClient.send({ cmd }, payload));
  }

  @Get()
  /*
    Space-aware. The units of a site are part of running it, and the gate asked
    the org-wide column — so a supervisor could not list the flats at their own
    site. The space is named in the path, so the check completes here with no
    lookup: `null` = org-wide, `[]` = granted nowhere and matches nothing.
  */
  @RequirePermissionInSpace('canViewAllTasks')
  @ApiOperation({ summary: "The space's apartments / units" })
  async list(@Param('spaceId') spaceId: string, @Request() req: any) {
    const scope = isAdmin(req.user) ? null : spacesGranting(req.user?.access, 'canViewAllTasks');
    if (scope !== null && !scope.includes(spaceId)) {
      throw new ForbiddenException('You do not have access to this workspace');
    }
    await this.requireModule(spaceId, req.user.organizationId);
    return this.auth('portal_list_space_units', { organizationId: req.user.organizationId, spaceId });
  }

  @Post()
  @RequirePermission('canManagePortals')
  @ApiOperation({ summary: 'Add an apartment / unit to this space' })
  async create(@Param('spaceId') spaceId: string, @Body() body: { name?: string; address?: string; lat?: number; lng?: number; contactName?: string; contactPhone?: string; residentUserId?: string | null; customerId?: string | null; details?: any[] }, @Request() req: any) {
    await this.requireModule(spaceId, req.user.organizationId);
    return this.auth('portal_create_unit', {
      organizationId: req.user.organizationId, spaceId,
      name: body.name?.trim() || body.address || 'Unit',
      address: body.address, lat: body.lat, lng: body.lng,
      contactName: body.contactName, contactPhone: body.contactPhone,
      residentUserId: body.residentUserId, customerId: body.customerId,
      details: body.details, actorId: req.user.id,
    });
  }

  @Patch(':unitId')
  @RequirePermission('canManagePortals')
  @ApiOperation({ summary: 'Update an apartment (name/address, resident, details)' })
  async update(@Param('spaceId') spaceId: string, @Param('unitId') unitId: string, @Body() body: any, @Request() req: any) {
    await this.requireModule(spaceId, req.user.organizationId);
    // Whitelist, identity LAST. This spread the body after the token's
    // organizationId, so a body naming another organization (or an actorId)
    // replaced it — a cross-tenant write. One pick shared with every unit route.
    // scopeSpaceId: the unit must be THIS space's, not merely the organization's.
    return this.auth('portal_update_unit', { ...pickUnitFields(body), id: unitId, organizationId: req.user.organizationId, actorId: req.user.id, scopeSpaceId: spaceId });
  }

  @Delete(':unitId')
  @RequirePermission('canManagePortals')
  @ApiOperation({ summary: 'Remove an apartment / unit' })
  async remove(@Param('spaceId') spaceId: string, @Param('unitId') unitId: string, @Request() req: any) {
    await this.requireModule(spaceId, req.user.organizationId);
    return this.auth('portal_delete_unit', { id: unitId, organizationId: req.user.organizationId, scopeSpaceId: spaceId });
  }

  /** Reverse-direction assignment: give a MEMBER an apartment from the member
   *  side (Members tab). `unitId: null` vacates them. One home per member. */
  @Post('assign-member')
  @RequirePermission('canManagePortals')
  @ApiOperation({ summary: "Set a member's apartment in this space (unitId null = vacate)" })
  async assignMember(@Param('spaceId') spaceId: string, @Body() body: { userId: string; unitId?: string | null }, @Request() req: any) {
    await this.requireModule(spaceId, req.user.organizationId);
    return this.auth('portal_set_member_apartment', {
      organizationId: req.user.organizationId, spaceId,
      userId: body.userId, unitId: body.unitId ?? null, actorId: req.user.id,
    });
  }
}

/** A single apartment/unit by id (org-scoped) — for the apartment detail page. */
@ApiTags('units')
@ApiBearerAuth()
@DenyExternal() // see the note above SpaceUnitsController
@Controller('units')
export class UnitDetailController {
  constructor(@Inject('AUTH_SERVICE') private readonly authClient: ClientProxy) {}

  @Get(':id')
  // Space-aware; the unit carries its own space, so the service is the boundary.
  @RequirePermissionInSpace('canViewAllTasks')
  @ApiOperation({ summary: 'Get one apartment / unit with its resident' })
  get(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(this.authClient.send({ cmd: 'portal_get_unit' }, { id, organizationId: req.user.organizationId, scopeSpaceIds: isAdmin(req.user) ? undefined : spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined }));
  }

  @Get(':id/activities')
  // Space-aware; the unit carries its own space, so the service is the boundary.
  @RequirePermissionInSpace('canViewAllTasks')
  @ApiOperation({ summary: "An apartment's activity timeline (notes + system events)" })
  activities(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(this.authClient.send({ cmd: 'portal_list_unit_activities' }, { id, organizationId: req.user.organizationId, scopeSpaceIds: isAdmin(req.user) ? undefined : spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined }));
  }

  @Post(':id/activities')
  @RequirePermission('canManagePortals')
  @ApiOperation({ summary: 'Add a note to an apartment' })
  addActivity(@Param('id') id: string, @Body() body: { body?: string }, @Request() req: any) {
    return firstValueFrom(this.authClient.send({ cmd: 'portal_add_unit_activity' }, { id, organizationId: req.user.organizationId, body: body.body, authorId: req.user.id }));
  }
}
