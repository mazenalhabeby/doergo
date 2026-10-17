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
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { CreateSprintDto, UpdateSprintDto } from './dto';
import { SprintsService } from './sprints.service';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
@ApiTags('sprints')
@ApiBearerAuth()
@RequireModule('sprints') // Business+ — gates ALL mutations (create/update/start/complete/delete); reads pass
@Controller('sprints')
export class SprintsController {
  constructor(private readonly sprintsService: SprintsService) {}

  @Get()
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'List organization sprints' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status: PLANNING, ACTIVE, COMPLETED' })
  async findAll(
    @Query('status') status: string | undefined,
    // A space sees its own sprints plus the organization-wide ones. Omit it and
    // the answer is everything, which is what it always was.
    @Query('spaceId') spaceId: string | undefined,
    @Request() req: AuthedRequest,
  ) {
    return this.sprintsService.findAll({
      organizationId: callerOrgId(req.user),
      ...(status && { status }),
      ...(spaceId && { spaceId }),
    });
  }

  @Get('velocity')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get velocity data for the last N sprints' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of sprints to include (default 6)' })
  async getVelocity(
    @Query('limit', new DefaultValuePipe(6), ParseIntPipe) limit: number,
    @Request() req: AuthedRequest,
  ) {
    return this.sprintsService.getVelocity({
      organizationId: callerOrgId(req.user),
      limit,
    });
  }

  @Get(':id')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get a sprint with its tasks' })
  async findOne(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.sprintsService.findOne({
      id,
      organizationId: callerOrgId(req.user),
    });
  }

  @Get(':id/report')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get sprint report (burndown, velocity, stats)' })
  async getReport(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.sprintsService.getReport({
      id,
      organizationId: callerOrgId(req.user),
    });
  }

  @Post()
  @Roles(Role.ADMIN)
  @RequireModule('sprints')
  @ApiOperation({ summary: 'Create a new sprint' })
  async create(@Body() createSprintDto: CreateSprintDto, @Request() req: AuthedRequest) {
    return this.sprintsService.create({
      ...createSprintDto,
      organizationId: callerOrgId(req.user),
    });
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a sprint' })
  async update(@Param('id') id: string, @Body() updateSprintDto: UpdateSprintDto, @Request() req: AuthedRequest) {
    return this.sprintsService.update({
      id,
      ...updateSprintDto,
      organizationId: callerOrgId(req.user),
    });
  }

  @Post(':id/start')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Start a sprint (changes status to ACTIVE)' })
  async start(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.sprintsService.start({
      id,
      organizationId: callerOrgId(req.user),
    });
  }

  @Post(':id/complete')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Complete a sprint (changes status to COMPLETED)' })
  async complete(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.sprintsService.complete({
      id,
      organizationId: callerOrgId(req.user),
    });
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a sprint' })
  async remove(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.sprintsService.remove({
      id,
      organizationId: callerOrgId(req.user),
    });
  }
}
