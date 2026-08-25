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
  Inject,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { RequirePermission, RequirePermissionInSpace } from '../../common/decorators';
import { getSpaceScope } from '@hbcfield/shared';
import { capModulesToCatalogue } from '../../common/entitlements';
import { LocationsService } from './locations.service';
import { LocationsQueueService } from './locations.queue.service';
import {
  CreateLocationDto,
  UpdateLocationDto,
  AssignMemberDto,
  UpdateAssignmentDto,
} from './dto';

@ApiTags('locations')
@ApiBearerAuth()
@Controller('locations')
export class LocationsController {
  constructor(
    private readonly locationsService: LocationsService,
    private readonly locationsQueueService: LocationsQueueService,
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
  ) {}

  /**
   * Tell billing the bill moved.
   *
   * A space IS a billable thing now: creating one, switching a module on in it,
   * or archiving it changes what the organization owes as surely as hiring
   * somebody does. Member changes already triggered this; space changes did not,
   * which meant a module switched on would show on the billing screen and never
   * reach Stripe until the next unrelated hire.
   *
   * Fire-and-forget, and debounced on the far side: a burst of toggles on the
   * Modules tab collapses into one proration, and a billing hiccup must never
   * stop somebody configuring their space.
   */
  private rebill(organizationId: string): void {
    firstValueFrom(this.authClient.send({ cmd: 'billing_reconcile_seats' }, { organizationId })).catch(() => {});
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
      limit: Math.min(limit ? Math.max(1, Number(limit) || 20) : 20, 500),
      includeInactive: includeInactive === true || includeInactive === 'true' as any,
      // Default (undefined) excludes CUSTOMER; the Spaces directory passes 'all'.
      kind: kind || undefined,
    });
    // Scope by the employee's Access Profile (admins/managers keep full view):
    //   'all'   → every space   ·   'own' → only their assigned spaces
    //   'tasks' → NO spaces (task-only view)
    if (!req.user.canViewAllTasks && Array.isArray(result?.data)) {
      const scope = getSpaceScope(req.user);
      if (scope === 'tasks') {
        result.data = [];
      } else if (scope !== 'all') {
        result.data = result.data.filter((loc: any) =>
          (loc.assignments || []).some((a: any) => a.userId === req.user.id),
        );
      }
    }
    return result;
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
  async getRosters(@Query('ids') ids: string, @Request() req: any) {
    return this.locationsService.getLocationAssignmentsBatch({
      locationIds: (ids || '').split(',').map((s) => s.trim()).filter(Boolean),
      organizationId: req.user.organizationId,
      requesterId: req.user.id,
      spaceScope: getSpaceScope(req.user),
      canViewAll: !!req.user.canViewAllTasks,
    });
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
    });
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
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get effective modules for a space (falls back to org defaults)' })
  async getEffectiveModules(@Param('id') id: string, @Request() req: any) {
    return this.locationsService.getEffectiveModules({
      id,
      organizationId: req.user.organizationId,
    });
  }

  // ==================== MEMBER ASSIGNMENT ENDPOINTS ====================

  @Get(':id/members')
  // Read-only roster of a space — any member of the org may view it (org-scoped
  // in the service); employees use it for their own space view + Team.
  @ApiOperation({ summary: 'Get members assigned to a location' })
  async getLocationMembers(@Param('id') id: string, @Request() req: any) {
    return this.locationsService.getLocationAssignments({
      locationId: id,
      organizationId: req.user.organizationId,
      // Cross-org shared spaces whose owner enabled "show workers" — the only
      // foreign rosters this caller may read (server-authoritative).
      sharedSpaceIds: (req.user.access?.sharedSpaces ?? [])
        .filter((s: any) => s.showWorkers)
        .map((s: any) => s.spaceId),
    });
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
    return this.locationsQueueService.assignMember({
      ...dto,
      locationId,
      requestingUserId: req.user.id,
      organizationId: req.user.organizationId,
      access: req.user.access, // server-authoritative; service enforces the real space
    });
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
    return this.locationsQueueService.updateAssignment({
      ...dto,
      assignmentId,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id/members/:assignmentId')
  @RequirePermission('canManageWorkspaces')
  @ApiOperation({ summary: 'Remove a member assignment' })
  async removeAssignment(
    @Param('id') _locationId: string,
    @Param('assignmentId') assignmentId: string,
    @Request() req: any,
  ) {
    return this.locationsQueueService.removeAssignment({
      assignmentId,
      organizationId: req.user.organizationId,
    });
  }
}
