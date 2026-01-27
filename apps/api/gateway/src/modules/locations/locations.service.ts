import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@doergo/shared';

@Injectable()
export class LocationsService extends BaseGatewayService {
  constructor(
    @Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy,
  ) {
    super(taskClient, LocationsService.name);
  }

  /**
   * Get all company locations for an organization
   */
  async findAll(data: {
    organizationId: string;
    page?: number;
    limit?: number;
    includeInactive?: boolean;
  }) {
    return this.send({ cmd: 'find_all_locations' }, data);
  }

  /**
   * Get a single company location by ID
   */
  async findOne(data: { id: string; organizationId: string }) {
    return this.send({ cmd: 'find_one_location' }, data);
  }

  /**
   * Get all technicians assigned to a location
   */
  async getLocationAssignments(data: {
    locationId: string;
    organizationId: string;
  }) {
    return this.send({ cmd: 'get_location_assignments' }, data);
  }

  /**
   * Get all location assignments for a technician
   */
  async getTechnicianAssignments(data: {
    userId: string;
    organizationId: string;
  }) {
    return this.send({ cmd: 'get_technician_assignments' }, data);
  }
}
