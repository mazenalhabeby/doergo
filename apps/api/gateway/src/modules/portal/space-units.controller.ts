import { Controller, Get, Post, Patch, Delete, Body, Param, Inject, Request } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RequirePermissionInSpace } from '@hbcfield/shared';
import { unitFieldsFor } from '../../common/unit-fields';
import { SpaceModulesService } from '../../common/space-modules.service';
import { portalScope } from '../../common/portal-scope';
import {
  sendRpc,
  portalGetUnit,
  portalListUnitActivities,
  portalAddUnitActivity,
  portalListSpaceUnits,
  portalCreateUnit,
  portalUpdateUnit,
  portalDeleteUnit,
  portalSetMemberApartment,
  type RpcContract,
} from '@hbcfield/shared/microservices';

/**
 * Apartments / Units directory for a space (the `apartments` module). The unit
 * is the hub: a resident lives in it — a MEMBER (residentUserId) for staff
 * housing, or a CLIENT (customerId) when the space runs an Apartment-entity B2C
 * portal. Work on the unit is handled by tasks (no standing worker list).
 */
/*
  The units belong to the CLIENT PORTAL, so they are read and written under the
  portal's own keys — never `canViewAllTasks`, which an External Supervisor
  holds to follow the WORK and which was, for a while, the only thing between
  them and a directory of residents' names and phone numbers. That is why both
  controllers were @DenyExternal: the permission was the wrong one, so the
  relationship had to do the refusing.

  With the right keys the relationship no longer has to: reading units asks
  `canViewPortal`, changing them `canManagePortals`, each for THIS workspace
  (the path names it, so the guard decides it). An external member holds a
  portal key only if somebody gave it to them for their workspace — and then
  their workspace's units are exactly what they were given.
*/
@ApiTags('space-units')
@ApiBearerAuth()
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
  /** A message contract; the payload is checked against it. The reply is not typed yet (it was `any`). */
  private auth<Req>(contract: RpcContract<Req, unknown>, payload: NoInfer<Req>): Promise<any> {
    return firstValueFrom(sendRpc(this.authClient, contract, payload));
  }

  @Get()
  /*
    The space is named in the path, so the guard decides it for THIS space: the
    key held org-wide, or held here. No second check is needed in the handler.
  */
  @RequirePermissionInSpace('canViewPortal')
  @ApiOperation({ summary: "The space's apartments / units" })
  async list(@Param('spaceId') spaceId: string, @Request() req: any) {
    await this.requireModule(spaceId, req.user.organizationId);
    return this.auth(portalListSpaceUnits, { organizationId: req.user.organizationId, spaceId });
  }

  @Post()
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: 'Add an apartment / unit to this space' })
  async create(
    @Param('spaceId') spaceId: string,
    @Body()
    body: {
      name?: string;
      address?: string;
      lat?: number;
      lng?: number;
      contactName?: string;
      contactPhone?: string;
      residentUserId?: string | null;
      customerId?: string | null;
      details?: any[];
    },
    @Request() req: any,
  ) {
    await this.requireModule(spaceId, req.user.organizationId);
    return this.auth(portalCreateUnit, {
      organizationId: req.user.organizationId,
      spaceId,
      name: body.name?.trim() || body.address || 'Unit',
      address: body.address,
      lat: body.lat,
      lng: body.lng,
      contactName: body.contactName,
      contactPhone: body.contactPhone,
      residentUserId: body.residentUserId,
      // null is sent as null; createUnit reads it like absent (`!data.customerId`).
      customerId: body.customerId as string | undefined,
      details: body.details,
      actorId: req.user.id,
      // The client named as resident must be in reach too, not merely the org's.
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Patch(':unitId')
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: 'Update an apartment (name/address, resident, details)' })
  async update(
    @Param('spaceId') spaceId: string,
    @Param('unitId') unitId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    await this.requireModule(spaceId, req.user.organizationId);
    // Whitelist, identity LAST. This spread the body after the token's
    // organizationId, so a body naming another organization (or an actorId)
    // replaced it — a cross-tenant write. One pick shared with every unit route.
    // scopeSpaceId: the unit must be THIS space's, not merely the organization's;
    // scopeSpaceIds: and whatever it is moved to must be in the caller's reach.
    return this.auth(portalUpdateUnit, {
      ...unitFieldsFor(portalUpdateUnit, body),
      id: unitId,
      organizationId: req.user.organizationId,
      actorId: req.user.id,
      scopeSpaceId: spaceId,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Delete(':unitId')
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: 'Remove an apartment / unit' })
  async remove(@Param('spaceId') spaceId: string, @Param('unitId') unitId: string, @Request() req: any) {
    await this.requireModule(spaceId, req.user.organizationId);
    return this.auth(portalDeleteUnit, {
      id: unitId,
      organizationId: req.user.organizationId,
      scopeSpaceId: spaceId,
    });
  }

  /** Reverse-direction assignment: give a MEMBER an apartment from the member
   *  side (Members tab). `unitId: null` vacates them. One home per member. */
  @Post('assign-member')
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: "Set a member's apartment in this space (unitId null = vacate)" })
  async assignMember(
    @Param('spaceId') spaceId: string,
    @Body() body: { userId: string; unitId?: string | null },
    @Request() req: any,
  ) {
    await this.requireModule(spaceId, req.user.organizationId);
    return this.auth(portalSetMemberApartment, {
      organizationId: req.user.organizationId,
      spaceId,
      userId: body.userId,
      unitId: body.unitId ?? null,
      actorId: req.user.id,
    });
  }
}

/**
 * A single apartment/unit by id (org-scoped) — for the apartment detail page.
 *
 * The path names no workspace, so the guard only knows the key is held
 * somewhere; the unit carries its own workspace (its own, its client's or its
 * portal's — `unitScope`), and the service narrows to the workspaces granting
 * the SAME key. Outside them: 404.
 */
@ApiTags('units')
@ApiBearerAuth()
@Controller('units')
export class UnitDetailController {
  constructor(@Inject('AUTH_SERVICE') private readonly authClient: ClientProxy) {}

  @Get(':id')
  @RequirePermissionInSpace('canViewPortal')
  @ApiOperation({ summary: 'Get one apartment / unit with its resident' })
  get(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(
      sendRpc(this.authClient, portalGetUnit, {
        id,
        organizationId: req.user.organizationId,
        scopeSpaceIds: portalScope(req.user, 'canViewPortal'),
      }),
    );
  }

  @Get(':id/activities')
  @RequirePermissionInSpace('canViewPortal')
  @ApiOperation({ summary: "An apartment's activity timeline (notes + system events)" })
  activities(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(
      sendRpc(this.authClient, portalListUnitActivities, {
        id,
        organizationId: req.user.organizationId,
        scopeSpaceIds: portalScope(req.user, 'canViewPortal'),
      }),
    );
  }

  @Post(':id/activities')
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: 'Add a note to an apartment' })
  addActivity(@Param('id') id: string, @Body() body: { body?: string }, @Request() req: any) {
    return firstValueFrom(
      sendRpc(this.authClient, portalAddUnitActivity, {
        id,
        organizationId: req.user.organizationId,
        body: body.body,
        authorId: req.user.id,
        scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
      }),
    );
  }
}
