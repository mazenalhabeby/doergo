import { ServiceCalls } from '../../common/microservices/service-calls';
import { DenyExternal } from '../../common/decorators';
import { Controller, Get, Post, Patch, Delete, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RequirePermissionInSpace } from '@hbcfield/shared';
import { unitFieldsFor } from '../../common/unit-fields';
import { SpaceModulesService } from '../../common/space-modules.service';
import { portalScope } from '../../common/portal-scope';
import { scopeFor } from '../../common/permission-scope';
import {
  portalList,
  portalCreateSpace,
  portalGetForSpace,
  portalUpdateForSpace,
  portalListSpaceUnits,
  portalCreateUnit,
  portalUpdateUnit,
  portalDeleteUnit,
  portalSetPrimaryUnit,
  type RpcContract,
} from '@hbcfield/shared/microservices';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
import { CreatePortalDto, UpdateSpacePortalDto, AssignUnitCustomerDto } from './dto/portal-bodies.dto';
import { UnitBodyDto } from '../../common/dto/unit-body.dto';
/**
 * Per-space B2C portal: configuration + unit/apartment catalog. The portal lives
 * IN the space (Portal.spaceId). A "unit" is the portal's entity — an apartment
 * for a rental portal — and can be assigned to a customer (→ their primary
 * address).
 *
 * Every route names its workspace in the path, so `@RequirePermissionInSpace`
 * is decided for THAT workspace by the guard (the key held org-wide, or in this
 * space). What the guard cannot see is a unit id under the path: those writes
 * carry `scopeSpaceId` (the unit must be this workspace's) — two of them did
 * not, so a manager of workspace A could edit or reassign workspace B's flat by
 * putting its id under A's path.
 *
 * ⚠️ No class-level @DenyExternal any more: an external member given the portal
 * keys for THIS workspace reads and runs this workspace's portal. Creating a
 * portal stays closed to them (route below, with its reason).
 */
@ApiTags('space-portal')
@ApiBearerAuth()
@Controller('spaces/:spaceId/portal')
export class SpacePortalController {
  constructor(
    private readonly services: ServiceCalls,
    private readonly spaceModules: SpaceModulesService,
  ) {}
  /** A message contract; the payload is checked against it. The reply is not typed yet (it was `any`). */
  private auth<Req>(contract: RpcContract<Req, unknown>, payload: NoInfer<Req>): Promise<any> {
    return this.services.auth.ask(contract, payload);
  }

  /** The whole surface is a paid feature — the space MUST have b2c_portal on. */
  private requirePortalModule(spaceId: string, organizationId: string) {
    return this.spaceModules.assertEnabled(spaceId, organizationId, 'b2c_portal');
  }

  @Get('portals')
  @RequirePermissionInSpace('canViewPortal')
  @ApiOperation({ summary: "List the space's client portals (a space can run several)" })
  async listPortals(@Param('spaceId') spaceId: string, @Request() req: AuthedRequest) {
    await this.requirePortalModule(spaceId, callerOrgId(req.user));
    return this.auth(portalList, {
      organizationId: callerOrgId(req.user),
      spaceId,
      scopeSpaceIds: portalScope(req.user, 'canViewPortal'),
    });
  }

  @Post('portals')
  @RequirePermissionInSpace('canManagePortals')
  // Closed to externals: a workspace's second portal is a billed line (€29) on
  // the organization's bill. Running the portal that exists is theirs to do;
  // buying another is the organization's decision.
  @DenyExternal()
  @ApiOperation({ summary: 'Create a new client portal for this space' })
  async createPortal(@Param('spaceId') spaceId: string, @Body() body: CreatePortalDto, @Request() req: AuthedRequest) {
    await this.requirePortalModule(spaceId, callerOrgId(req.user));
    return this.auth(portalCreateSpace, {
      organizationId: callerOrgId(req.user),
      spaceId,
      templateKey: body.templateKey,
      name: body.name,
    });
  }

  @Get()
  @RequirePermissionInSpace('canViewPortal')
  @ApiOperation({ summary: "The space's portal config (entity type)" })
  async get(@Param('spaceId') spaceId: string, @Request() req: AuthedRequest) {
    await this.requirePortalModule(spaceId, callerOrgId(req.user));
    // A reader must not create the (billed) portal by opening the page.
    const manage = scopeFor(req.user, 'canManagePortals');
    const mayCreate = manage === null || manage.includes(spaceId);
    return this.auth(portalGetForSpace, { organizationId: callerOrgId(req.user), spaceId, mayCreate });
  }

  @Patch()
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: "Set the space portal's entity type" })
  async update(@Param('spaceId') spaceId: string, @Body() body: UpdateSpacePortalDto, @Request() req: AuthedRequest) {
    await this.requirePortalModule(spaceId, callerOrgId(req.user));
    return this.auth(portalUpdateForSpace, {
      organizationId: callerOrgId(req.user),
      spaceId,
      templateKey: body.templateKey,
    });
  }

  // ── Unit / apartment catalog ──
  @Get('units')
  @RequirePermissionInSpace('canViewPortal')
  async listUnits(@Param('spaceId') spaceId: string, @Request() req: AuthedRequest) {
    await this.requirePortalModule(spaceId, callerOrgId(req.user));
    return this.auth(portalListSpaceUnits, { organizationId: callerOrgId(req.user), spaceId });
  }

  @Post('units')
  @RequirePermissionInSpace('canManagePortals')
  async addUnit(@Param('spaceId') spaceId: string, @Body() body: UnitBodyDto, @Request() req: AuthedRequest) {
    const orgId = callerOrgId(req.user);
    await this.requirePortalModule(spaceId, orgId);
    const portal: any = await this.auth(portalGetForSpace, { organizationId: orgId, spaceId });
    return this.auth(portalCreateUnit, {
      organizationId: orgId,
      spaceId,
      portalId: portal?.data?.id,
      name: body.name?.trim() || body.address || 'Unit',
      address: body.address,
      lat: body.lat,
      lng: body.lng,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Patch('units/:unitId')
  @RequirePermissionInSpace('canManagePortals')
  async updateUnit(
    @Param('spaceId') spaceId: string,
    @Param('unitId') unitId: string,
    @Body() body: UnitBodyDto,
    @Request() req: AuthedRequest,
  ) {
    await this.requirePortalModule(spaceId, callerOrgId(req.user));
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
    return this.auth(portalUpdateUnit, {
      ...unitFieldsFor(portalUpdateUnit, body),
      id: unitId,
      organizationId: callerOrgId(req.user),
      actorId: req.user.id,
      scopeSpaceId: spaceId,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }

  @Delete('units/:unitId')
  @RequirePermissionInSpace('canManagePortals')
  async deleteUnit(@Param('spaceId') spaceId: string, @Param('unitId') unitId: string, @Request() req: AuthedRequest) {
    await this.requirePortalModule(spaceId, callerOrgId(req.user));
    return this.auth(portalDeleteUnit, {
      id: unitId,
      organizationId: callerOrgId(req.user),
      scopeSpaceId: spaceId,
    });
  }

  @Post('units/:unitId/assign')
  @RequirePermissionInSpace('canManagePortals')
  @ApiOperation({ summary: 'Assign this unit to a customer (→ their primary address)' })
  async assign(
    @Param('spaceId') spaceId: string,
    @Param('unitId') unitId: string,
    @Body() body: AssignUnitCustomerDto,
    @Request() req: AuthedRequest,
  ) {
    const orgId = callerOrgId(req.user);
    await this.requirePortalModule(spaceId, orgId);
    // The unit must be THIS workspace's and the client in reach (scopeSpaceIds),
    // before anything is written.
    await this.auth(portalUpdateUnit, {
      id: unitId,
      organizationId: orgId,
      customerId: body.customerId,
      scopeSpaceId: spaceId,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
    await this.auth(portalSetPrimaryUnit, { id: unitId, organizationId: orgId, scopeSpaceId: spaceId });
    return { data: { success: true } };
  }
}
