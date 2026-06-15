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
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators';
import { getSpaceScope } from '@hbcfield/shared';
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
  ) {}

  @Post()
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Create a new company location' })
  async create(@Body() dto: CreateLocationDto, @Request() req: any) {
    return this.locationsQueueService.create({
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get company locations for the organization (scoped for employees)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('includeInactive') includeInactive?: boolean,
    @Request() req?: any,
  ) {
    const result: any = await this.locationsService.findAll({
      organizationId: req.user.organizationId,
      page: page ? Math.max(1, Number(page) || 1) : 1,
      limit: Math.min(limit ? Math.max(1, Number(limit) || 20) : 20, 500),
      includeInactive: includeInactive === true || includeInactive === 'true' as any,
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
  @Get('rosters')
  @ApiOperation({ summary: 'Rosters (with current task) for multiple spaces at once' })
  @ApiQuery({ name: 'ids', required: true, description: 'Comma-separated company-location IDs' })
  async getRosters(@Query('ids') ids: string, @Request() req: any) {
    return this.locationsService.getLocationAssignmentsBatch({
      locationIds: (ids || '').split(',').map((s) => s.trim()).filter(Boolean),
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get a company location by ID' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.locationsService.findOne({
      id,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Update a company location' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
    @Request() req: any,
  ) {
    return this.locationsQueueService.update({
      id,
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: 'Deactivate a company location' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.locationsQueueService.remove({
      id,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
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
    });
  }

  @Post(':id/members')
  @RequirePermission('canManageUsers')
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
    });
  }

  @Patch(':id/members/:assignmentId')
  @RequirePermission('canManageUsers')
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
  @RequirePermission('canManageUsers')
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
