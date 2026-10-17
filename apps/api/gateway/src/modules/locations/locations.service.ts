import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
  pattern,
  type RpcRequest,
  findAllLocations,
  findOneLocation,
  getEffectiveModules,
  getLocationAssignments,
  getLocationAssignmentsBatch,
  getTechnicianAssignments,
  getColleagues,
} from '@hbcfield/shared/microservices';

@Injectable()
export class LocationsService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, LocationsService.name);
  }

  /**
   * Get all company locations for an organization. Caller + Access-Profile scope ride along,
   * so the query filters instead of the response.
   */
  async findAll(data: RpcRequest<typeof findAllLocations>) {
    return this.send(pattern(findAllLocations), data);
  }

  /**
   * Get a single company location by ID. `viewScopeSpaceIds`: spaces the caller follows the work
   * of (undefined = admin / org-wide); `mayManage`: whether the caller manages THIS space's
   * people (its terms travel only then).
   */
  async findOne(data: RpcRequest<typeof findOneLocation>) {
    return this.send(pattern(findOneLocation), data);
  }

  /**
   * Get effective modules for a space (falls back to org modules)
   */
  async getEffectiveModules(data: RpcRequest<typeof getEffectiveModules>) {
    return this.send(pattern(getEffectiveModules), data);
  }

  /**
   * Get all members assigned to a location
   */
  async getLocationAssignments(data: RpcRequest<typeof getLocationAssignments>) {
    return this.send(pattern(getLocationAssignments), data);
  }

  async getLocationAssignmentsBatch(data: RpcRequest<typeof getLocationAssignmentsBatch>) {
    return this.send(pattern(getLocationAssignmentsBatch), data);
  }

  /**
   * Get all location assignments for an employee
   */
  async getEmployeeAssignments(data: RpcRequest<typeof getTechnicianAssignments>) {
    return this.send(pattern(getTechnicianAssignments), data);
  }

  /** Colleagues in the requester's visible spaces (Team screen). */
  async getColleagues(data: RpcRequest<typeof getColleagues>) {
    return this.send(pattern(getColleagues), data);
  }
}
