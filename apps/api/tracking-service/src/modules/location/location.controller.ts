import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { LocationService } from './location.service';
import { WorkerLocationReadService } from './worker-location-read.service';
import { RouteReadService } from './route-read.service';
import { LocationBatchService } from './location-batch.service';

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
  @MessagePattern({ cmd: 'tracking_health' })
  async health() {
    return { status: 'ok', service: 'tracking-service', timestamp: new Date().toISOString() };
  }

  @MessagePattern({ cmd: 'update_location' })
  async updateLocation(
    @Payload()
    data: {
      userId: string;
      lat: number;
      lng: number;
      accuracy?: number;
      taskId?: string;
      organizationId?: string;
    },
  ) {
    return this.locationService.updateLocation(
      data.userId,
      data.lat,
      data.lng,
      data.accuracy,
      data.taskId,
      data.organizationId,
    );
  }

  @MessagePattern({ cmd: 'update_location_batch' })
  async updateLocationBatch(
    @Payload()
    data: {
      userId: string;
      taskId?: string;
      organizationId?: string;
      points: { lat: number; lng: number; accuracy?: number; timestamp?: string }[];
    },
  ) {
    return this.batches.updateLocationBatch(data.userId, data.taskId, data.points, data.organizationId);
  }

  @MessagePattern({ cmd: 'get_active_workers' })
  async getActiveWorkers(@Payload() data: { organizationId?: string; scopeSpaceIds?: string[] }) {
    return this.workerReads.getActiveWorkers(data.organizationId, undefined, scopeOf(data));
  }

  // Cross-org shared space: live locations of the owner-org workers assigned to
  // that space. organizationId = the space's OWNER org, userIds = the roster
  // (both resolved server-side by the gateway; never client input).
  @MessagePattern({ cmd: 'get_space_workers' })
  async getSpaceWorkers(@Payload() data: { organizationId: string; userIds: string[] }) {
    return this.workerReads.getActiveWorkers(data.organizationId, data.userIds);
  }

  @MessagePattern({ cmd: 'get_worker_location' })
  async getWorkerLocation(@Payload() data: { workerId: string; organizationId?: string; scopeSpaceIds?: string[] }) {
    return this.workerReads.getWorkerLocation(data.workerId, data.organizationId, scopeOf(data));
  }

  @MessagePattern({ cmd: 'get_worker_history' })
  async getWorkerHistory(
    @Payload()
    data: {
      workerId: string;
      startDate?: string;
      endDate?: string;
      organizationId?: string;
      scopeSpaceIds?: string[];
    },
  ) {
    return this.workerReads.getWorkerHistory(
      data.workerId,
      data.startDate,
      data.endDate,
      data.organizationId,
      scopeOf(data),
    );
  }

  @MessagePattern({ cmd: 'get_task_route' })
  async getTaskRoute(@Payload() data: { taskId: string; organizationId?: string; scopeSpaceIds?: string[] }) {
    return this.routeReads.getTaskRoute(data.taskId, data.organizationId, scopeOf(data));
  }

  @MessagePattern({ cmd: 'get_worker_current_route' })
  async getWorkerCurrentRoute(
    @Payload() data: { workerId: string; organizationId?: string; scopeSpaceIds?: string[] },
  ) {
    return this.routeReads.getWorkerCurrentRoute(data.workerId, data.organizationId, scopeOf(data));
  }
}
