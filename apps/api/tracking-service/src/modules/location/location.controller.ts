import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { LocationService } from './location.service';

@Controller()
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @MessagePattern({ cmd: 'health' })
  async health() {
    return { status: 'ok', service: 'tracking-service', timestamp: new Date().toISOString() };
  }

  @MessagePattern({ cmd: 'update_location' })
  async updateLocation(
    @Payload() data: { userId: string; lat: number; lng: number; accuracy?: number; taskId?: string },
  ) {
    return this.locationService.updateLocation(data.userId, data.lat, data.lng, data.accuracy, data.taskId);
  }

  @MessagePattern({ cmd: 'update_location_batch' })
  async updateLocationBatch(
    @Payload() data: { userId: string; taskId?: string; points: { lat: number; lng: number; accuracy?: number; timestamp?: string }[] },
  ) {
    return this.locationService.updateLocationBatch(data.userId, data.taskId, data.points);
  }

  @MessagePattern({ cmd: 'get_active_workers' })
  async getActiveWorkers(@Payload() data: { organizationId?: string }) {
    return this.locationService.getActiveWorkers(data.organizationId);
  }

  // Cross-org shared space: live locations of the owner-org workers assigned to
  // that space. organizationId = the space's OWNER org, userIds = the roster
  // (both resolved server-side by the gateway; never client input).
  @MessagePattern({ cmd: 'get_space_workers' })
  async getSpaceWorkers(@Payload() data: { organizationId: string; userIds: string[] }) {
    return this.locationService.getActiveWorkers(data.organizationId, data.userIds);
  }

  @MessagePattern({ cmd: 'get_worker_location' })
  async getWorkerLocation(@Payload() data: { workerId: string; organizationId?: string }) {
    return this.locationService.getWorkerLocation(data.workerId, data.organizationId);
  }

  @MessagePattern({ cmd: 'get_worker_history' })
  async getWorkerHistory(
    @Payload() data: { workerId: string; startDate?: string; endDate?: string; organizationId?: string },
  ) {
    return this.locationService.getWorkerHistory(data.workerId, data.startDate, data.endDate, data.organizationId);
  }

  @MessagePattern({ cmd: 'get_task_route' })
  async getTaskRoute(@Payload() data: { taskId: string; organizationId?: string }) {
    return this.locationService.getTaskRoute(data.taskId, data.organizationId);
  }

  @MessagePattern({ cmd: 'get_worker_current_route' })
  async getWorkerCurrentRoute(@Payload() data: { workerId: string; organizationId?: string }) {
    return this.locationService.getWorkerCurrentRoute(data.workerId, data.organizationId);
  }
}
