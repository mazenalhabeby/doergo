import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

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
   * Get effective modules for a space (falls back to org modules)
   */
  async getEffectiveModules(data: { id: string; organizationId: string }) {
    return this.send({ cmd: 'get_effective_modules' }, data);
  }

  /**
   * Get all members assigned to a location
   */
  async getLocationAssignments(data: {
    locationId: string;
    organizationId: string;
  }) {
    return this.send({ cmd: 'get_location_assignments' }, data);
  }

  /**
   * Get all location assignments for an employee
   */
  async getEmployeeAssignments(data: {
    userId: string;
    organizationId: string;
  }) {
    return this.send({ cmd: 'get_technician_assignments' }, data);
  }
}
