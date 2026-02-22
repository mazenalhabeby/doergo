import { Controller, Get, Post, Body, Param, Inject, Request } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { Role } from '@doergo/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { UpdateTrackingLocationDto } from './dto';

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
  async updateLocation(@Body() updateLocationDto: UpdateTrackingLocationDto, @Request() req: any) {
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

  @Get('workers/:id/current-route')
  @Roles(Role.DISPATCHER)
  @ApiOperation({ summary: 'Get technician current EN_ROUTE journey (DISPATCHER only)' })
  async getWorkerCurrentRoute(@Param('id') id: string) {
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'get_worker_current_route' }, {
        workerId: id,
      }),
    );
  }

  @Get('tasks/:taskId/route')
  @Roles(Role.DISPATCHER)
  @ApiOperation({ summary: 'Get full route for a task (DISPATCHER only)' })
  async getTaskRoute(@Param('taskId') taskId: string) {
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'get_task_route' }, {
        taskId,
      }),
    );
  }
}
