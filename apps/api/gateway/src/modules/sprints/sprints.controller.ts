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
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateSprintDto, UpdateSprintDto } from './dto';
import { SprintsService } from './sprints.service';

@ApiTags('sprints')
@ApiBearerAuth()
@Controller('sprints')
export class SprintsController {
  constructor(private readonly sprintsService: SprintsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'List organization sprints' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status: PLANNING, ACTIVE, COMPLETED' })
  async findAll(@Query('status') status: string | undefined, @Request() req: any) {
    return this.sprintsService.findAll({
      organizationId: req.user.organizationId,
      ...(status && { status }),
    });
  }

  @Get('velocity')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get velocity data for the last N sprints' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of sprints to include (default 6)' })
  async getVelocity(
    @Query('limit', new DefaultValuePipe(6), ParseIntPipe) limit: number,
    @Request() req: any,
  ) {
    return this.sprintsService.getVelocity({
      organizationId: req.user.organizationId,
      limit,
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get a sprint with its tasks' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.sprintsService.findOne({
      id,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/report')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Get sprint report (burndown, velocity, stats)' })
  async getReport(@Param('id') id: string, @Request() req: any) {
    return this.sprintsService.getReport({
      id,
      organizationId: req.user.organizationId,
    });
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new sprint' })
  async create(@Body() createSprintDto: CreateSprintDto, @Request() req: any) {
    return this.sprintsService.create({
      ...createSprintDto,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a sprint' })
  async update(
    @Param('id') id: string,
    @Body() updateSprintDto: UpdateSprintDto,
    @Request() req: any,
  ) {
    return this.sprintsService.update({
      id,
      ...updateSprintDto,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/start')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Start a sprint (changes status to ACTIVE)' })
  async start(@Param('id') id: string, @Request() req: any) {
    return this.sprintsService.start({
      id,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/complete')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Complete a sprint (changes status to COMPLETED)' })
  async complete(@Param('id') id: string, @Request() req: any) {
    return this.sprintsService.complete({
      id,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a sprint' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.sprintsService.remove({
      id,
      organizationId: req.user.organizationId,
    });
  }
}
