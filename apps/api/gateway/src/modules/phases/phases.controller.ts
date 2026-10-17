import { Controller, Get, Post, Patch, Delete, Body, Param, Request, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { CreatePhaseDto, UpdatePhaseDto } from './dto';
import { PhasesService } from './phases.service';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
@ApiTags('phases')
@ApiBearerAuth()
@RequireModule('phases') // Business+ — gates ALL mutations (create/update/delete); reads pass
@Controller('phases')
export class PhasesController {
  constructor(private readonly phasesService: PhasesService) {}

  @Get()
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'List organization phases' })
  async findAll(@Query('spaceId') spaceId: string | undefined, @Request() req: AuthedRequest) {
    // A space sees its own phases plus the organization-wide ones.
    return this.phasesService.findAll({
      organizationId: callerOrgId(req.user),
      ...(spaceId && { spaceId }),
    });
  }

  @Post()
  @Roles(Role.ADMIN)
  @RequireModule('phases')
  @ApiOperation({ summary: 'Create a new phase' })
  async create(@Body() createPhaseDto: CreatePhaseDto, @Request() req: AuthedRequest) {
    return this.phasesService.create({
      ...createPhaseDto,
      organizationId: callerOrgId(req.user),
    });
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a phase' })
  async update(@Param('id') id: string, @Body() updatePhaseDto: UpdatePhaseDto, @Request() req: AuthedRequest) {
    return this.phasesService.update({
      id,
      ...updatePhaseDto,
      organizationId: callerOrgId(req.user),
    });
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a phase' })
  async remove(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.phasesService.remove({
      id,
      organizationId: callerOrgId(req.user),
    });
  }
}
