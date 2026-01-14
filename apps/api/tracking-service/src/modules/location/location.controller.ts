import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { LocationService } from './location.service';

@Controller()
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @MessagePattern({ cmd: 'update_location' })
  async updateLocation(@Payload() data: { userId: string; lat: number; lng: number; accuracy?: number }) {
    return this.locationService.updateLocation(data.userId, data.lat, data.lng, data.accuracy);
  }

  @MessagePattern({ cmd: 'get_active_workers' })
  async getActiveWorkers(@Payload() data: { organizationId?: string }) {
    return this.locationService.getActiveWorkers(data.organizationId);
  }

  @MessagePattern({ cmd: 'get_worker_location' })
  async getWorkerLocation(@Payload() data: { workerId: string }) {
    return this.locationService.getWorkerLocation(data.workerId);
  }

  @MessagePattern({ cmd: 'get_worker_history' })
  async getWorkerHistory(@Payload() data: { workerId: string; startDate?: string; endDate?: string }) {
    return this.locationService.getWorkerHistory(data.workerId, data.startDate, data.endDate);
  }
}
