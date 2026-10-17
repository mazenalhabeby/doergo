import { scopeFor } from '../../common/permission-scope';
import { LabourCostInterceptor } from '../../common/interceptors/labour-cost.interceptor';
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
  ForbiddenException,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { RequirePermission, RequirePermissionInSpace } from '../../common/decorators';
import {
  getSpaceScope,
  spacesGranting,
  isAdmin,
  accessAllows,
  clampListLimit,
  mayViewSpaceRoster,
  mayManageSpaceMembers,
  stripSpaceTerms,
} from '@hbcfield/shared';
import { capModulesToCatalogue } from '../../common/entitlements';
import { CreateLocationDto, UpdateLocationDto } from './dto';
import { locationListScope, shapeLocationList } from './locations-controller-helpers';
import { LocationsControllerBase } from './locations-controller.base';

export { locationListScope, shapeLocationList } from './locations-controller-helpers';

@ApiTags('locations')
@ApiBearerAuth()
@UseInterceptors(LabourCostInterceptor)
@Controller('locations')
export class LocationsController extends LocationsControllerBase {

  @Post()
  @RequirePermission('canManageWorkspaces')
  @ApiOperation({ summary: 'Create a new company location' })
  async create(@Body() dto: CreateLocationDto, @Request() req: any) {
    // A space can never enable a module the org's plan tier doesn't include.
    if (Array.isArray((dto as any).enabledModules)) {
      (dto as any).enabledModules = capModulesToCatalogue((dto as any).enabledModules);
    }
    const created = await this.locationsQueueService.create({
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
    this.rebill(req.user.organizationId);
    // Where is it? Looked up once for its public holidays (in the background).
    this.placeDetector.nudge();
    return created;
  }

  @Get()
  @ApiOperation({ summary: 'Get company locations for the organization (scoped for employees)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiQuery({ name: 'kind', required: false, description: "PROJECT | COMPANY | CUSTOMER | 'all'. Default hides CUSTOMER spaces from work pickers." })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('includeInactive') includeInactive?: boolean,
    @Query('kind') kind?: string,
    @Request() req?: any,
  ) {
    const result: any = await this.locationsService.findAll({
      organizationId: req.user.organizationId,
      page: page ? Math.max(1, Number(page) || 1) : 1,
      // The workspace pickers ask for the whole directory, hence the higher ceiling.
      limit: clampListLimit(limit, 20, 500),
      includeInactive: includeInactive === true || includeInactive === 'true' as any,
      // Default (undefined) excludes CUSTOMER; the Spaces directory passes 'all'.
      kind: kind || undefined,
      /*
        Workspace visibility from the Access Profile, applied in the QUERY.

        This used to filter `result.data` after the fact, which left `total` and
        the page boundaries describing the org's full directory rather than the
        member's view: pages came back short, a member assigned to one space
        late in the list got empty pages before it, and the whole directory was
        read out of the database on every space picker just to be discarded.

        canViewAllTasks still means the full view. It is what the task pickers
        and dashboards this list feeds are built on, and quietly narrowing it
        would take spaces away from every manager invited with the default
        'own' profile. The Access tab now says so, instead of offering a
        control that silently does nothing for them.
      */
      viewerId: req.user.id,
      spaceScope: locationListScope(req.user),
    });
    return shapeLocationList(result, req.user);
  }

  // NOTE: must be declared before @Get(':id') so 'team' isn't matched as an id.
  @Get('team')
  @ApiOperation({ summary: 'Colleagues in the requesting user\'s visible spaces' })
  async getTeam(@Request() req: any) {
    const team = await this.locationsService.getColleagues({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      spaceScope: getSpaceScope(req.user),
    });
    return this.chatReach.annotate(team, req.user);
  }

  // Batched rosters for the dashboard — one request instead of one per space.
  // Declared before @Get(':id') so 'rosters' isn't matched as an id.
  //
  // The ids are client-supplied, so the caller's Access-Profile space scope is
  // sent with them and enforced in the query (same scoping GET /locations
  // applies to the list). Without it, an org check alone let any member read the
  // roster of any space by id — including members granted no spaces at all.
  @Get('rosters')
  @ApiOperation({ summary: 'Rosters (with current task) for multiple spaces at once' })
  @ApiQuery({ name: 'ids', required: true, description: 'Comma-separated company-location IDs' })
  //
  // ⚠️ Same per-space rule as GET /locations/:id/members. It used to pass the
  // org-wide column as ONE boolean and the raw profile scope: an external
  // member (no profile → scope 'all') read every workspace's roster, and every
  // colleague got each person's negotiated bill rate. Now the viewing grant is
  // asked PER SPACE (`mayViewSpaceRoster`), an external member has no own/all
  // path, and a bill rate leaves only for whoever manages that space's people.
  // Cost rates stop at the LabourCostInterceptor on this class.
  async getRosters(@Query('ids') ids: string, @Request() req: any) {
    const locationIds = (ids || '').split(',').map((s) => s.trim()).filter(Boolean);
    const res: any = await this.locationsService.getLocationAssignmentsBatch({
      locationIds,
      organizationId: req.user.organizationId,
      requesterId: req.user.id,
      spaceScope: req.user.isExternal === true ? 'tasks' : getSpaceScope(req.user),
      viewAllIds: locationIds.filter((id) => mayViewSpaceRoster(req.user, id)),
    });
    if (res && Array.isArray(res.data)) {
      const manages = new Map<string, boolean>();
      const may = (spaceId: string) => {
        if (!manages.has(spaceId)) manages.set(spaceId, mayManageSpaceMembers(req.user, spaceId));
        return manages.get(spaceId)!;
      };
      return { ...res, data: res.data.map((row: any) => stripSpaceTerms([row], may(row?.locationId))[0]) };
    }
    return res;
  }

  // No @RequirePermission: the service fully scopes this read to the caller's own
  // org OR a space cross-org-shared with them (server-authoritative sharedSpaceIds).
  // A space a caller has no claim to returns NotFound.
  @Get(':id')
  @ApiOperation({ summary: 'Get a company location by ID' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.locationsService.findOne({
      id,
      organizationId: req.user.organizationId,
      sharedSpaceIds: (req.user.access?.sharedSpaces ?? []).map((s: any) => s.spaceId),
      /*
        What leaked was the client's CONTACTS and the negotiated RATES — those
        go only to somebody who manages this workspace (`mayManage`; task-service
        strips them otherwise). The workspace itself is the organization's own
        and is opened from many screens (a client, an invoice, a roster), by a
        Shift Leader, a Sales Rep or invoice staff with no "view all tasks", so an
        internal member reads it. An EXTERNAL member reads only the workspaces
        they were given.
      */
      viewScopeSpaceIds: isAdmin(req.user) || !req.user?.isExternal
        ? undefined
        : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? []),
      mayManage: isAdmin(req.user) || mayManageSpaceMembers(req.user, id) || accessAllows(req.user?.access, 'canManageWorkspaces', id),
    });
  }

  /**
   * Make this the organization's default workspace.
   *
   * The flag decides where a task with no space of its own lands. It was set
   * once, when the first space was created, and there was no way to move it —
   * so deleting that space was refused with "make another space the default
   * first", advice the product gave and could not follow.
   *
   * Its own route rather than a field on PATCH: it is not a property of this
   * space so much as a choice ABOUT the organization, it clears the flag on a
   * different row, and a field would let it ride along unnoticed in an
   * unrelated edit.
   */
  @Post(':id/default')
  @RequirePermission('canManageWorkspaces')
  @ApiOperation({ summary: "Make this space the organization's default" })
  async makeDefault(@Param('id') id: string, @Request() req: any) {
    const result = await this.locationsQueueService.setDefault({
      id,
      // From the token, never the body: the space id is checked against THIS
      // organization, so a guessed id from another tenant finds nothing.
      organizationId: req.user.organizationId,
    });
    this.rebill(req.user.organizationId);
    return result;
  }

  @Patch(':id')
  @RequirePermission('canManageWorkspaces')
  @ApiOperation({ summary: 'Update a company location' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
    @Request() req: any,
  ) {
    if (Array.isArray((dto as any).enabledModules)) {
      (dto as any).enabledModules = capModulesToCatalogue((dto as any).enabledModules);
    }
    const updated = await this.locationsQueueService.update({
      id,
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
    // Modules may have changed — and an archived space stops being billed.
    this.rebill(req.user.organizationId);
    // …and the module gates read this space's list from a 30-second cache; a
    // module switched on must not stay refused (or off stay allowed) until it lapses.
    this.spaceModules.invalidate(id, req.user.organizationId);
    // A moved workspace is looked up again for its public holidays (in the background).
    if ((dto as any).lat !== undefined || (dto as any).lng !== undefined) this.placeDetector.nudge();
    return updated;
  }

  @Delete(':id')
  @RequirePermission('canManageWorkspaces')
  @ApiOperation({ summary: 'Deactivate a company location' })
  async remove(@Param('id') id: string, @Request() req: any) {
    const result = await this.locationsQueueService.remove({
      id,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
    this.rebill(req.user.organizationId);
    return result;
  }

  @Delete(':id/permanent')
  @RequirePermission('canManageWorkspaces')
  @ApiOperation({ summary: 'Permanently delete an empty company location (no tasks/attendance/shifts)' })
  async purge(@Param('id') id: string, @Request() req: any) {
    const result = await this.locationsQueueService.purge({
      id,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
    this.rebill(req.user.organizationId);
    return result;
  }

  @Get(':id/modules')
  /*
    Space-aware. A supervisor who runs a site could not read which modules that
    site has on, because the gate asked the org-wide column.

    The resource here IS the space named in the path, so the check completes in
    the controller with no lookup and no round trip: the grant list is already
    on the request. `undefined` = org-wide; `[]` = granted nowhere and matches
    nothing, which is why the empty case is written out.
  */
  @RequirePermissionInSpace('canViewAllTasks')
  @ApiOperation({ summary: 'Get effective modules for a space (falls back to org defaults)' })
  async getEffectiveModules(@Param('id') id: string, @Request() req: any) {
    // null for an org-wide holder, a list otherwise.
    const scope = scopeFor(req.user, 'canViewAllTasks');
    if (scope !== null && !scope.includes(id)) {
      throw new ForbiddenException('You do not have access to this workspace');
    }
    return this.locationsService.getEffectiveModules({
      id,
      organizationId: req.user.organizationId,
    });
  }
}
