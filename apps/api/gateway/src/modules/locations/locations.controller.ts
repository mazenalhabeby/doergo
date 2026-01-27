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
import { Role } from '@doergo/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { LocationsService } from './locations.service';
import { LocationsQueueService } from './locations.queue.service';
import {
  CreateLocationDto,
  UpdateLocationDto,
  AssignTechnicianDto,
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
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new company location' })
  async create(@Body() dto: CreateLocationDto, @Request() req: any) {
    return this.locationsQueueService.create({
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Get()
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Get all company locations for the organization' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('includeInactive') includeInactive?: boolean,
    @Request() req?: any,
  ) {
    return this.locationsService.findAll({
      organizationId: req.user.organizationId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      includeInactive: includeInactive === true || includeInactive === 'true' as any,
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Get a company location by ID' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.locationsService.findOne({
      id,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
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
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Deactivate a company location' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.locationsQueueService.remove({
      id,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  // ==================== TECHNICIAN ASSIGNMENT ENDPOINTS ====================

  @Get(':id/technicians')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @ApiOperation({ summary: 'Get technicians assigned to a location' })
  async getLocationTechnicians(@Param('id') id: string, @Request() req: any) {
    return this.locationsService.getLocationAssignments({
      locationId: id,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/technicians')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Assign a technician to a location' })
  async assignTechnician(
    @Param('id') locationId: string,
    @Body() dto: AssignTechnicianDto,
    @Request() req: any,
  ) {
    return this.locationsQueueService.assignTechnician({
      ...dto,
      locationId,
      requestingUserId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id/technicians/:assignmentId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a technician assignment' })
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

  @Delete(':id/technicians/:assignmentId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Remove a technician assignment' })
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
