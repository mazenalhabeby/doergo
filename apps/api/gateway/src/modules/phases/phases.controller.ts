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
import { CreatePhaseDto, UpdatePhaseDto } from './dto';
import { PhasesService } from './phases.service';

@ApiTags('phases')
@ApiBearerAuth()
@Controller('phases')
export class PhasesController {
  constructor(private readonly phasesService: PhasesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'List organization phases' })
  async findAll(@Request() req: any) {
    return this.phasesService.findAll({
      organizationId: req.user.organizationId,
    });
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new phase' })
  async create(@Body() createPhaseDto: CreatePhaseDto, @Request() req: any) {
    return this.phasesService.create({
      ...createPhaseDto,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a phase' })
  async update(
    @Param('id') id: string,
    @Body() updatePhaseDto: UpdatePhaseDto,
    @Request() req: any,
  ) {
    return this.phasesService.update({
      id,
      ...updatePhaseDto,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a phase' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.phasesService.remove({
      id,
      organizationId: req.user.organizationId,
    });
  }
}
