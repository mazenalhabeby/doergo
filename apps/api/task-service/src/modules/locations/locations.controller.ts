import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { LocationsService } from './locations.service';

@Controller()
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @MessagePattern({ cmd: 'find_all_locations' })
  async findAll(@Payload() data: any) {
    return this.locationsService.findAll(data);
  }

  @MessagePattern({ cmd: 'find_one_location' })
  async findOne(@Payload() data: any) {
    return this.locationsService.findOne(data);
  }

  @MessagePattern({ cmd: 'get_location_assignments' })
  async getLocationAssignments(@Payload() data: any) {
    return this.locationsService.getLocationAssignments(data);
  }

  @MessagePattern({ cmd: 'get_technician_assignments' })
  async getTechnicianAssignments(@Payload() data: any) {
    return this.locationsService.getTechnicianAssignments(data);
  }
}
