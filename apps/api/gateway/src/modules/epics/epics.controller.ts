import { Controller, Get, Post, Patch, Delete, Body, Param, Request, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { CreateEpicDto, UpdateEpicDto } from './dto';
import { EpicsService } from './epics.service';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
@ApiTags('epics')
@ApiBearerAuth()
@RequireModule('epics') // Business+ — gates ALL mutations (create/update/delete); reads pass
@Controller('epics')
export class EpicsController {
  constructor(private readonly epicsService: EpicsService) {}

  @Get()
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'List organization epics with task counts' })
  async findAll(@Query('spaceId') spaceId: string | undefined, @Request() req: AuthedRequest) {
    // A space sees its own epics plus the organization-wide ones.
    return this.epicsService.findAll({
      organizationId: callerOrgId(req.user),
      ...(spaceId && { spaceId }),
    });
  }

  @Post()
  @RequirePermission('canViewAllTasks')
  @RequireModule('epics')
  @ApiOperation({ summary: 'Create a new epic' })
  async create(@Body() createEpicDto: CreateEpicDto, @Request() req: AuthedRequest) {
    return this.epicsService.create({
      ...createEpicDto,
      organizationId: callerOrgId(req.user),
    });
  }

  @Patch(':id')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Update an epic' })
  async update(@Param('id') id: string, @Body() updateEpicDto: UpdateEpicDto, @Request() req: AuthedRequest) {
    return this.epicsService.update({
      id,
      ...updateEpicDto,
      organizationId: callerOrgId(req.user),
    });
  }

  @Delete(':id')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Delete an epic (unlinks tasks)' })
  async remove(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.epicsService.remove({
      id,
      organizationId: callerOrgId(req.user),
    });
  }
}
