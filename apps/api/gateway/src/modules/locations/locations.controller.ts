import { WorkspacePlaceDetector } from '../calendar/workspace-place.detector';
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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { RequirePermission, RequirePermissionInSpace } from '../../common/decorators';
import { getSpaceScope, spacesGranting, isAdmin, accessAllows, clampListLimit, mayViewSpaceRoster, mayManageSpaceMembers, stripSpaceTerms, stripWorkspaceTerms, type SpaceScope } from '@hbcfield/shared';
import { RebillService } from '../../common/billing/rebill.service';
import { SpaceModulesService } from '../../common/space-modules.service';
import { capModulesToCatalogue } from '../../common/entitlements';
import { LocationsService } from './locations.service';
import { LocationsQueueService } from './locations.queue.service';
import {
  CreateLocationDto,
  UpdateLocationDto,
  AssignMemberDto,
  UpdateAssignmentDto,
} from './dto';

/**
 * Which workspaces `GET /locations` lists for this caller.
 *
 * ⚠️ An EXTERNAL member is never widened to the organization's directory. The
 * org-wide `canViewAllTasks` column and an Access Profile left at "all" both
 * meant "every workspace" — right for staff, wrong for a client's supervisor,
 * whose whole authority is the space role they hold where they are assigned.
 * So they get 'own' (the spaces they are assigned to — which is where their
 * space role lives), or nothing if their profile says 'tasks'.
 */
export function locationListScope(user: any): SpaceScope {
  if (user?.isExternal === true && !isAdmin(user)) {
    return getSpaceScope(user) === 'tasks' ? 'tasks' : 'own';
  }
  return user?.canViewAllTasks ? 'all' : getSpaceScope(user ?? {});
}

/**
 * The list as an external member receives it: no workspace rates or costs
 * (`stripWorkspaceTerms`) — what the organization charges a site, and what it
 * costs, is not a client's business. Staff rows pass unchanged.
 */
export function shapeLocationList<T>(result: T, user: any): T {
  const r = result as any;
  if (user?.isExternal !== true || isAdmin(user) || !Array.isArray(r?.data)) return result;
  return { ...r, data: r.data.map((row: unknown) => stripWorkspaceTerms(row, false)) };
}

@ApiTags('locations')
@ApiBearerAuth()
@UseInterceptors(LabourCostInterceptor)
@Controller('locations')
export class LocationsController {
  constructor(
    private readonly locationsService: LocationsService,
    private readonly locationsQueueService: LocationsQueueService,
    private readonly billing: RebillService,
    private readonly placeDetector: WorkspacePlaceDetector,
    private readonly spaceModules: SpaceModulesService,
  ) {}

  /**
   * Tell billing the bill moved. A space IS a billable thing: creating one,
   * switching a module on in it, archiving it, or changing who holds a role in
   * it moves what the organization owes (see RebillService).
   */
  private rebill(organizationId: string): void {
    this.billing.rebill(organizationId);
  }

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
    return this.locationsService.getColleagues({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      spaceScope: getSpaceScope(req.user),
    });
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
    // spacesGranting returns null for an org-wide holder, a list otherwise.
    const scope = isAdmin(req.user) ? null : spacesGranting(req.user?.access, 'canViewAllTasks');
    if (scope !== null && !scope.includes(id)) {
      throw new ForbiddenException('You do not have access to this workspace');
    }
    return this.locationsService.getEffectiveModules({
      id,
      organizationId: req.user.organizationId,
    });
  }

  // ==================== MEMBER ASSIGNMENT ENDPOINTS ====================

  @Get(':id/members')
  /*
    Read-only roster of a space, with each person's email and what they are
    working on right now. ⚠️ It used to have NO gate — "any member of the org may
    view it" — so anybody, an external member included, read any workspace's
    people by id, and each person's negotiated bill rate there with them.

    Now the rule GET /locations/rosters already followed: a viewing grant for
    THIS space (admin, follow / assign its work, supervise its attendance,
    manage its people) reads it whole; otherwise an internal member reads the
    spaces their Access Profile allows (assigned → their own). An external
    member has no "own" path — only the grant in the space they supervise, which
    is what the External Supervisor's attendance screens read. Outside that the
    space reads as not found.

    A member's bill rate here leaves only for whoever manages this space's
    people; cost rates already stop at the LabourCostInterceptor on this class.
  */
  @ApiOperation({ summary: 'Get members assigned to a location' })
  async getLocationMembers(@Param('id') id: string, @Request() req: any) {
    const res: any = await this.locationsService.getLocationAssignments({
      locationId: id,
      organizationId: req.user.organizationId,
      // Cross-org shared spaces whose owner enabled "show workers" — the only
      // foreign rosters this caller may read (server-authoritative).
      sharedSpaceIds: (req.user.access?.sharedSpaces ?? [])
        .filter((s: any) => s.showWorkers)
        .map((s: any) => s.spaceId),
      requesterId: req.user.id,
      spaceScope: req.user.isExternal === true ? 'tasks' : getSpaceScope(req.user),
      canViewAll: mayViewSpaceRoster(req.user, id),
    });
    if (res && Array.isArray(res.data)) {
      return { ...res, data: stripSpaceTerms(res.data, mayManageSpaceMembers(req.user, id)) };
    }
    return res;
  }

  // Space-aware: org member-managers add anyone in their org; a CONTROL guest may
  // add their OWN people to a space shared with them (service enforces the real
  // space + tags the row with the guest org). Guard widens; service authorizes.
  @Post(':id/members')
  @RequirePermissionInSpace('canManageWorkspaces')
  @ApiOperation({ summary: 'Assign a member to a location' })
  async assignMember(
    @Param('id') locationId: string,
    @Body() dto: AssignMemberDto,
    @Request() req: any,
  ) {
    this.assertMayManageMembersIn(req, locationId);
    const result = await this.locationsQueueService.assignMember({
      ...dto,
      locationId,
      requestingUserId: req.user.id,
      organizationId: req.user.organizationId,
      access: req.user.access, // server-authoritative; service enforces the real space
    });
    /*
      A space assignment carries a ROLE, and an external member's seat price is
      read from the permissions that role grants — an Observer is €2, a
      Supervisor €9.99. So assigning somebody, or moving them between roles,
      moves the bill.

      Without this the change was only picked up by the nightly sweep: up to a
      day billed at the wrong rate, and — worse to use — a price that does not
      move when you change the thing that sets it.
    */
    this.rebill(req.user.organizationId);
    return result;
  }

  @Patch(':id/members/:assignmentId')
  @RequirePermission('canManageWorkspaces')
  @ApiOperation({ summary: 'Update a member assignment' })
  async updateAssignment(
    @Param('id') _locationId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: UpdateAssignmentDto,
    @Request() req: any,
  ) {
    const result = await this.locationsQueueService.updateAssignment({
      ...dto,
      assignmentId,
      organizationId: req.user.organizationId,
    });
    // Same reason as assignMember: this route can change the assignment's role.
    this.rebill(req.user.organizationId);
    return result;
  }

  @Delete(':id/members/:assignmentId')
  @RequirePermission('canManageWorkspaces')
  @ApiOperation({ summary: 'Remove a member assignment' })
  async removeAssignment(
    @Param('id') _locationId: string,
    @Param('assignmentId') assignmentId: string,
    @Request() req: any,
  ) {
    const result = await this.locationsQueueService.removeAssignment({
      assignmentId,
      organizationId: req.user.organizationId,
    });
    // Losing a space role can move an external member back to the full seat.
    this.rebill(req.user.organizationId);
    return result;
  }

  /**
   * May the caller change who works in THIS workspace?
   *
   * The guard on `POST /locations/:id/members` reads a space id from
   * `params.spaceId`, `params.locationId` or the body — never `:id` — so for
   * this route it fell back to "granted in ANY space": a member who manages one
   * site could add people (and their roles, and their seat price) to every
   * other. Decided here against the space in the path.
   *
   * Two ways to hold it: the workspace grant the guard asks for, held org-wide
   * or in this space; or managing this space's people (which is what a CONTROL
   * guest holds in a space shared with them — the service then confines them
   * to their own people).
   */
  private assertMayManageMembersIn(req: any, spaceId: string): void {
    if (isAdmin(req.user)) return;
    if (accessAllows(req.user?.access, 'canManageWorkspaces', spaceId)) return;
    if (mayManageSpaceMembers(req.user, spaceId)) return;
    throw new ForbiddenException('You do not have permission to manage the members of this workspace');
  }
}
