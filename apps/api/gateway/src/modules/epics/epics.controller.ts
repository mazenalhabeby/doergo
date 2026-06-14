import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateEpicDto, UpdateEpicDto } from './dto';
import { EpicsService } from './epics.service';

@ApiTags('epics')
@ApiBearerAuth()
@Controller('epics')
export class EpicsController {
  constructor(private readonly epicsService: EpicsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'List organization epics with task counts' })
  async findAll(@Request() req: any) {
    return this.epicsService.findAll({
      organizationId: req.user.organizationId,
    });
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Create a new epic' })
  async create(@Body() createEpicDto: CreateEpicDto, @Request() req: any) {
    return this.epicsService.create({
      ...createEpicDto,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Update an epic' })
  async update(
    @Param('id') id: string,
    @Body() updateEpicDto: UpdateEpicDto,
    @Request() req: any,
  ) {
    return this.epicsService.update({
      id,
      ...updateEpicDto,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Delete an epic (unlinks tasks)' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.epicsService.remove({
      id,
      organizationId: req.user.organizationId,
    });
  }
}
