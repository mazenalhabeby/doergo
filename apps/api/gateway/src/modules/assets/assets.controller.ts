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
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Role } from '@doergo/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AssetsService } from './assets.service';
import { AssetsQueueService } from './assets.queue.service';
import { CreateAssetDto, UpdateAssetDto, AssetQueryDto } from './dto';

@ApiTags('assets')
@ApiBearerAuth()
@Controller('assets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetsController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly assetsQueueService: AssetsQueueService,
  ) {}

  @Post()
  @Roles(Role.CLIENT, Role.DISPATCHER)
  @ApiOperation({ summary: 'Create a new asset' })
  async create(@Body() dto: CreateAssetDto, @Request() req: any) {
    return this.assetsQueueService.create({
      ...dto,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Get()
  @Roles(Role.CLIENT, Role.DISPATCHER)
  @ApiOperation({ summary: 'List all assets' })
  async findAll(@Query() query: AssetQueryDto, @Request() req: any) {
    return this.assetsService.findAll({
      ...query,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id')
  @Roles(Role.CLIENT, Role.DISPATCHER)
  @ApiOperation({ summary: 'Get asset by ID' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.assetsService.findOne({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id')
  @Roles(Role.CLIENT, Role.DISPATCHER)
  @ApiOperation({ summary: 'Update an asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
    @Request() req: any,
  ) {
    return this.assetsQueueService.update({
      id,
      ...dto,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id')
  @Roles(Role.CLIENT, Role.DISPATCHER)
  @ApiOperation({ summary: 'Delete an asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.assetsQueueService.delete({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/history')
  @Roles(Role.CLIENT, Role.DISPATCHER)
  @ApiOperation({ summary: 'Get maintenance history for an asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getMaintenanceHistory(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ) {
    return this.assetsService.getMaintenanceHistory({
      id,
      page,
      limit,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }
}
