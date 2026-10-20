import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { LocationService } from './location.service';
import { WorkerLocationReadService } from './worker-location-read.service';
import { RouteReadService } from './route-read.service';
import { LocationBatchService } from './location-batch.service';

import {
  pattern,
  trackingHealth,
  updateLocation,
  updateLocationBatch,
  getActiveWorkers,
  getSpaceWorkers,
  getWorkerLocation,
  getWorkerHistory,
  getTaskRoute,
  getWorkerCurrentRoute,
  trackingEraseMember,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
/**
 * The gateway sends `scopeSpaceIds` only for a workspace-scoped caller (an
 * array, possibly empty = nowhere); absent or null = org-wide. A JSON hop turns
 * undefined into a missing key, so anything that is not an array is org-wide —
 * and an array is passed through untouched, `[]` included.
 */
function scopeOf(data: { scopeSpaceIds?: unknown }): string[] | undefined {
  return Array.isArray(data.scopeSpaceIds) ? (data.scopeSpaceIds as string[]) : undefined;
}

@Controller()
export class LocationController {
  constructor(
    private readonly locationService: LocationService,
    private readonly batches: LocationBatchService,
    private readonly routeReads: RouteReadService,
    private readonly workerReads: WorkerLocationReadService,
  ) {}

  // Its OWN pattern: on the shared Redis transport a common 'health' was answered
  // by whichever service replied first, so the gateway could not tell who was up.
  @MessagePattern(pattern(trackingHealth))
  async health() {
    return { status: 'ok', service: 'tracking-service', timestamp: new Date().toISOString() };
  }

  @MessagePattern(pattern(updateLocation))
  async updateLocation(@Payload() data: RpcRequest<typeof updateLocation>) {
    return this.locationService.updateLocation(
      data.userId,
      data.lat,
      data.lng,
      data.accuracy,
      data.taskId,
      data.organizationId,
    );
  }

  @MessagePattern(pattern(updateLocationBatch))
  async updateLocationBatch(@Payload() data: RpcRequest<typeof updateLocationBatch>) {
    return this.batches.updateLocationBatch(data.userId, data.taskId, data.points, data.organizationId);
  }

  @MessagePattern(pattern(getActiveWorkers))
  async getActiveWorkers(@Payload() data: RpcRequest<typeof getActiveWorkers>) {
    return this.workerReads.getActiveWorkers(data.organizationId, undefined, scopeOf(data));
  }

  // Cross-org shared space: live locations of the owner-org workers assigned to
  // that space. organizationId = the space's OWNER org, userIds = the roster
  // (both resolved server-side by the gateway; never client input).
  @MessagePattern(pattern(getSpaceWorkers))
  async getSpaceWorkers(@Payload() data: RpcRequest<typeof getSpaceWorkers>) {
    return this.workerReads.getActiveWorkers(data.organizationId, data.userIds);
  }

  @MessagePattern(pattern(getWorkerLocation))
  async getWorkerLocation(@Payload() data: RpcRequest<typeof getWorkerLocation>) {
    return this.workerReads.getWorkerLocation(data.workerId, data.organizationId, scopeOf(data));
  }

  @MessagePattern(pattern(getWorkerHistory))
  async getWorkerHistory(@Payload() data: RpcRequest<typeof getWorkerHistory>) {
    return this.workerReads.getWorkerHistory(
      data.workerId,
      data.startDate,
      data.endDate,
      data.organizationId,
      scopeOf(data),
    );
  }

  @MessagePattern(pattern(getTaskRoute))
  async getTaskRoute(@Payload() data: RpcRequest<typeof getTaskRoute>) {
    return this.routeReads.getTaskRoute(data.taskId, data.organizationId, scopeOf(data));
  }

  @MessagePattern(pattern(getWorkerCurrentRoute))
  async getWorkerCurrentRoute(@Payload() data: RpcRequest<typeof getWorkerCurrentRoute>) {
    return this.routeReads.getWorkerCurrentRoute(data.workerId, data.organizationId, scopeOf(data));
  }

  /** A member deleting their account (auth-service's account deletion asks — tracking owns these tables). */
  @MessagePattern(pattern(trackingEraseMember))
  eraseMember(@Payload() data: RpcRequest<typeof trackingEraseMember>) {
    return this.locationService.eraseMember(data.userId);
  }
}
