import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES, LOCATION_JOB_TYPES, BaseQueueService } from '@hbcfield/shared';

@Injectable()
export class LocationsQueueService extends BaseQueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.LOCATIONS) locationsQueue: Queue,
    configService: ConfigService,
  ) {
    super(
      locationsQueue,
      configService,
      QUEUE_NAMES.LOCATIONS,
      LocationsQueueService.name,
    );
  }

  /**
   * Create a new company location
   */
  async create(data: Record<string, any>) {
    return this.addJobAndWait(LOCATION_JOB_TYPES.CREATE, data);
  }

  /**
   * Update a company location
   */
  async update(data: Record<string, any>) {
    return this.addJobAndWait(LOCATION_JOB_TYPES.UPDATE, data);
  }

  /**
   * Delete (deactivate) a company location
   */
  async remove(data: Record<string, any>) {
    return this.addJobAndWait(LOCATION_JOB_TYPES.DELETE, data);
  }

  /**
   * Permanently delete an empty company location (guarded server-side)
   */
  async purge(data: Record<string, any>) {
    return this.addJobAndWait(LOCATION_JOB_TYPES.PURGE, data);
  }

  /**
   * Assign a member to a location
   */
  async assignMember(data: Record<string, any>) {
    return this.addJobAndWait(LOCATION_JOB_TYPES.ASSIGN_TECHNICIAN, data);
  }

  /**
   * Update a member assignment
   */
  async updateAssignment(data: Record<string, any>) {
    return this.addJobAndWait(LOCATION_JOB_TYPES.UPDATE_ASSIGNMENT, data);
  }

  /**
   * Remove a member assignment
   */
  async removeAssignment(data: Record<string, any>) {
    return this.addJobAndWait(LOCATION_JOB_TYPES.REMOVE_ASSIGNMENT, data);
  }
}
