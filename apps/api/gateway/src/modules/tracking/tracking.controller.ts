import { Controller, Get, Post, Body, Param, Inject, Request, Query, ForbiddenException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { Role, SERVICE_NAMES } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission, RequirePermissionInSpace } from '../../common/decorators';
import { UpdateTrackingLocationDto, BatchTrackingLocationDto } from './dto';

@ApiTags('tracking')
@ApiBearerAuth()
@Controller('tracking')
export class TrackingController {
  constructor(
    @Inject('TRACKING_SERVICE') private readonly trackingClient: ClientProxy,
    @Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy,
  ) {}

  // Cross-org shared space: live locations of the owner's workers on that space.
  // Guest-gated — authorized against the server-authoritative share (showTracking)
  // and the roster is resolved owner-side; nothing comes from the client body.
  @Get('spaces/:spaceId/workers')
  @RequirePermissionInSpace('canViewTracking')
  @ApiOperation({ summary: "Live worker locations for a cross-org shared space" })
  async getSpaceWorkers(@Param('spaceId') spaceId: string, @Request() req: any) {
    const grant = (req.user.access?.sharedSpaces ?? []).find(
      (s: any) => s.spaceId === spaceId && s.showTracking,
    );
    if (!grant) throw new ForbiddenException('Tracking is not shared for this space');
    // Roster (owner-org workers assigned to the space) — resolved server-side.
    const roster: any = await firstValueFrom(
      this.taskClient.send({ cmd: 'get_location_assignments' }, {
        locationId: spaceId,
        organizationId: req.user.organizationId,
        sharedSpaceIds: [spaceId],
      }),
    );
    const userIds = ((roster?.data ?? []) as any[]).map((a) => a.userId || a.user?.id).filter(Boolean);
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'get_space_workers' }, {
        organizationId: grant.ownerOrgId,
        userIds,
      }),
    );
  }

  @Post('location')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Update user location (any authenticated user on a task)' })
  async updateLocation(@Body() updateLocationDto: UpdateTrackingLocationDto, @Request() req: any) {
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'update_location' }, {
        ...updateLocationDto,
        userId: req.user.id, // Always use authenticated user's ID
        organizationId: req.user.organizationId, // for org-scoped live-map broadcast
      }),
    );
  }

  @Post('location/batch')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Batch-update route points (mobile background tracker flush)' })
  async updateLocationBatch(@Body() batchDto: BatchTrackingLocationDto, @Request() req: any) {
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'update_location_batch' }, {
        organizationId: req.user.organizationId, // for org-scoped live-map broadcast
        taskId: batchDto.taskId,
        points: batchDto.points,
        userId: req.user.id, // Always use authenticated user's ID
      }),
    );
  }

  @Get('workers')
  @RequirePermission('canViewTracking')
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
  @RequirePermission('canViewTracking')
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
  @RequirePermission('canViewTracking')
  @ApiOperation({ summary: 'Get employee location history' })
  async getWorkerHistory(
    @Param('id') id: string,
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return firstValueFrom(
      this.trackingClient.send({ cmd: 'get_worker_history' }, {
        workerId: id,
        dispatcherId: req.user.id,
        organizationId: req.user.organizationId,
        // Forwarded to the service; when both are omitted it defaults to last 24h (M2).
        startDate,
        endDate,
      }),
    );
  }

  @Get('workers/:id/current-route')
  @RequirePermission('canViewTracking')
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
  @RequirePermission('canViewTracking')
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
