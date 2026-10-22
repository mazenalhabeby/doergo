import { ServiceCalls } from '../../common/microservices/service-calls';
import { Controller, Get, Post, Body, Param, Request, Query, ForbiddenException } from '@nestjs/common';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@hbcfield/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissionInSpace } from '../../common/decorators';
import { scopeFor } from '../../common/permission-scope';

/**
 * The live map held in a workspace shows that workspace (tracking-service
 * narrows; see `taskInScope` there). null = org-wide, sent as absent.
 */
function trackingScope(user: SessionUser): { scopeSpaceIds?: string[] } {
  const scope = scopeFor(user, 'canViewTracking');
  return scope === null ? {} : { scopeSpaceIds: scope };
}
import { UpdateTrackingLocationDto, BatchTrackingLocationDto } from './dto';
import {
  getSpaceWorkers,
  updateLocation,
  updateLocationBatch,
  getActiveWorkers,
  getWorkerLocation,
  getWorkerHistory,
  getWorkerCurrentRoute,
  getTaskRoute,
} from '@hbcfield/shared/microservices';
import { getLocationAssignments } from '@hbcfield/shared/microservices';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
import type { SessionUser } from '../../common/request.types';
@ApiTags('tracking')
@ApiBearerAuth()
/**
 * ⚠️ This had NO module gate. Live map and route capture. A phone that keeps posting positions for a space
 * that stopped paying for tracking is the leak this closes; the points it has
 * already recorded stay readable.
 *
 * ModuleGuard resolves the space from the request and falls back to the
 * organization's set when there is none, and it passes reads by design.
 */
@RequireModule('tracking')
@Controller('tracking')
export class TrackingController {
  constructor(private readonly services: ServiceCalls) {}

  // Cross-org shared space: live locations of the owner's workers on that space.
  // Guest-gated — authorized against the server-authoritative share (showTracking)
  // and the roster is resolved owner-side; nothing comes from the client body.
  @Get('spaces/:spaceId/workers')
  @RequirePermissionInSpace('canViewTracking')
  @ApiOperation({ summary: 'Live worker locations for a cross-org shared space' })
  async getSpaceWorkers(@Param('spaceId') spaceId: string, @Request() req: AuthedRequest) {
    const grant = (req.user.access?.sharedSpaces ?? []).find((s) => s.spaceId === spaceId && s.showTracking);
    if (!grant) throw new ForbiddenException('Tracking is not shared for this space');
    // Roster (owner-org workers assigned to the space) — resolved server-side.
    const roster: any = await this.services.task.ask(getLocationAssignments, {
      locationId: spaceId,
      organizationId: callerOrgId(req.user),
      sharedSpaceIds: [spaceId],
    });
    const userIds = ((roster?.data ?? []) as any[]).map((a) => a.userId || a.user?.id).filter(Boolean);
    return this.services.tracking.ask(getSpaceWorkers, {
      organizationId: grant.ownerOrgId,
      userIds,
    });
  }

  /*
    Tracking has its own, more generous limit. A phone coming out of a dead zone
    sends what it held in a few quick requests, and the general 10/second limit
    refused them — the phone then lost the points. Points are cheap and bounded
    (≤500 per batch, validated), so a burst is not a capacity risk here.
  */
  @Throttle({ short: { limit: 30, ttl: 1000 }, medium: { limit: 150, ttl: 10_000 }, long: { limit: 600, ttl: 60_000 } })
  @Post('location')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Update user location (any authenticated user on a task)' })
  async updateLocation(@Body() updateLocationDto: UpdateTrackingLocationDto, @Request() req: AuthedRequest) {
    return this.services.tracking.ask(updateLocation, {
      ...updateLocationDto,
      userId: req.user.id, // Always use authenticated user's ID
      organizationId: callerOrgId(req.user), // for org-scoped live-map broadcast
    });
  }

  /*
    Tracking has its own, more generous limit. A phone coming out of a dead zone
    sends what it held in a few quick requests, and the general 10/second limit
    refused them — the phone then lost the points. Points are cheap and bounded
    (≤500 per batch, validated), so a burst is not a capacity risk here.
  */
  @Throttle({ short: { limit: 30, ttl: 1000 }, medium: { limit: 150, ttl: 10_000 }, long: { limit: 600, ttl: 60_000 } })
  @Post('location/batch')
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiOperation({ summary: 'Batch-update route points (mobile background tracker flush)' })
  async updateLocationBatch(@Body() batchDto: BatchTrackingLocationDto, @Request() req: AuthedRequest) {
    return this.services.tracking.ask(updateLocationBatch, {
      organizationId: callerOrgId(req.user), // for org-scoped live-map broadcast
      taskId: batchDto.taskId,
      points: batchDto.points,
      userId: req.user.id, // Always use authenticated user's ID
    });
  }

  @Get('workers')
  @RequirePermissionInSpace('canViewTracking')
  @ApiOperation({ summary: 'Get all active employee locations' })
  async getActiveWorkers(@Request() req: AuthedRequest) {
    return this.services.tracking.ask(getActiveWorkers, {
      dispatcherId: req.user.id,
      organizationId: callerOrgId(req.user),
      ...trackingScope(req.user),
    });
  }

  @Get('workers/:id')
  @RequirePermissionInSpace('canViewTracking')
  @ApiOperation({ summary: 'Get employee location by ID' })
  async getWorkerLocation(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.services.tracking.ask(getWorkerLocation, {
      workerId: id,
      dispatcherId: req.user.id,
      organizationId: callerOrgId(req.user),
      ...trackingScope(req.user),
    });
  }

  @Get('workers/:id/history')
  @RequirePermissionInSpace('canViewTracking')
  @ApiOperation({ summary: 'Get employee location history' })
  async getWorkerHistory(
    @Param('id') id: string,
    @Request() req: AuthedRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.services.tracking.ask(getWorkerHistory, {
      workerId: id,
      dispatcherId: req.user.id,
      organizationId: callerOrgId(req.user),
      ...trackingScope(req.user),
      // Forwarded to the service; when both are omitted it defaults to last 24h (M2).
      startDate,
      endDate,
    });
  }

  @Get('workers/:id/current-route')
  @RequirePermissionInSpace('canViewTracking')
  @ApiOperation({ summary: 'Get employee current EN_ROUTE journey' })
  async getWorkerCurrentRoute(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.services.tracking.ask(getWorkerCurrentRoute, {
      workerId: id,
      organizationId: callerOrgId(req.user),
      ...trackingScope(req.user),
    });
  }

  @Get('tasks/:taskId/route')
  @RequirePermissionInSpace('canViewTracking')
  @ApiOperation({ summary: 'Get full route for a task' })
  async getTaskRoute(@Param('taskId') taskId: string, @Request() req: AuthedRequest) {
    return this.services.tracking.ask(getTaskRoute, {
      taskId,
      organizationId: callerOrgId(req.user),
      ...trackingScope(req.user),
    });
  }
}
