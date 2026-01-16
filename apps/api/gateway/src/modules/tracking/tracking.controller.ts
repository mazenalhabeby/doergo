import { Controller, Get, Post, Body, Param, Inject, Request } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { Role } from '@doergo/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { UpdateLocationDto } from './dto';

@ApiTags('tracking')
@ApiBearerAuth()
@Controller('tracking')
export class TrackingController {
  constructor(
    @Inject('TRACKING_SERVICE') private readonly trackingClient: ClientProxy,
  ) {}

  @Post('location')
  @Roles(Role.TECHNICIAN)
  @ApiOperation({ summary: 'Update technician location (TECHNICIAN only - Mobile app)' })
  async updateLocation(@Body() updateLocationDto: UpdateLocationDto, @Request() req: any) {
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'update_location' }, {
        ...updateLocationDto,
        userId: req.user.id, // Always use authenticated user's ID
      }),
    );
  }

  @Get('workers')
  @Roles(Role.DISPATCHER)
  @ApiOperation({ summary: 'Get all active technician locations (DISPATCHER only)' })
  async getActiveWorkers(@Request() req: any) {
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'get_active_workers' }, {
        dispatcherId: req.user.id,
        organizationId: req.user.organizationId,
      }),
    );
  }

  @Get('workers/:id')
  @Roles(Role.DISPATCHER)
  @ApiOperation({ summary: 'Get technician location by ID (DISPATCHER only)' })
  async getWorkerLocation(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'get_worker_location' }, {
        workerId: id,
        dispatcherId: req.user.id,
        organizationId: req.user.organizationId,
      }),
    );
  }

  @Get('workers/:id/history')
  @Roles(Role.DISPATCHER)
  @ApiOperation({ summary: 'Get technician location history (DISPATCHER only)' })
  async getWorkerHistory(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'get_worker_history' }, {
        workerId: id,
        dispatcherId: req.user.id,
        organizationId: req.user.organizationId,
      }),
    );
  }
}
