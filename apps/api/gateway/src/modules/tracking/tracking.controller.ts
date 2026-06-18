import { Controller, Get, Post, Body, Param, Inject, Request } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { Role } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators';
import { UpdateTrackingLocationDto, BatchTrackingLocationDto } from './dto';

@ApiTags('tracking')
@ApiBearerAuth()
@Controller('tracking')
export class TrackingController {
  constructor(
    @Inject('TRACKING_SERVICE') private readonly trackingClient: ClientProxy,
  ) {}

  @Post('location')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Update user location (any authenticated user on a task)' })
  async updateLocation(@Body() updateLocationDto: UpdateTrackingLocationDto, @Request() req: any) {
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'update_location' }, {
        ...updateLocationDto,
        userId: req.user.id, // Always use authenticated user's ID
      }),
    );
  }

  @Post('location/batch')
  @Roles(Role.ADMIN, Role.MANAGER, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Batch-update route points (mobile background tracker flush)' })
  async updateLocationBatch(@Body() batchDto: BatchTrackingLocationDto, @Request() req: any) {
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'update_location_batch' }, {
        taskId: batchDto.taskId,
        points: batchDto.points,
        userId: req.user.id, // Always use authenticated user's ID
      }),
    );
  }

  @Get('workers')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get all active employee locations' })
  async getActiveWorkers(@Request() req: any) {
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'get_active_workers' }, {
        dispatcherId: req.user.id,
        organizationId: req.user.organizationId,
      }),
    );
  }

  @Get('workers/:id')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get employee location by ID' })
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
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get employee location history' })
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
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get employee current EN_ROUTE journey' })
  async getWorkerCurrentRoute(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'get_worker_current_route' }, {
        workerId: id,
        organizationId: req.user.organizationId,
      }),
    );
  }

  @Get('tasks/:taskId/route')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get full route for a task' })
  async getTaskRoute(@Param('taskId') taskId: string, @Request() req: any) {
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'get_task_route' }, {
        taskId,
        organizationId: req.user.organizationId,
      }),
    );
  }
}
