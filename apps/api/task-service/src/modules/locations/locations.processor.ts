import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, LOCATION_JOB_TYPES } from '@doergo/shared';
import { LocationsService } from './locations.service';

@Processor(QUEUE_NAMES.LOCATIONS)
export class LocationsProcessor extends WorkerHost {
  private readonly logger = new Logger(LocationsProcessor.name);

  constructor(private readonly locationsService: LocationsService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);

    try {
      return await this.handleJob(job);
    } catch (error: any) {
      this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
      // Re-throw with structured error for gateway to parse
      throw new Error(
        JSON.stringify({
          message: error.message,
          statusCode: error.status || error.statusCode || 500,
        }),
      );
    }
  }

  private async handleJob(job: Job<any, any, string>): Promise<any> {
    const { data } = job;

    switch (job.name) {
      case LOCATION_JOB_TYPES.CREATE:
        return this.locationsService.create(data);

      case LOCATION_JOB_TYPES.UPDATE:
        return this.locationsService.update(data);

      case LOCATION_JOB_TYPES.DELETE:
        return this.locationsService.remove(data);

      // Technician assignment operations
      case LOCATION_JOB_TYPES.ASSIGN_TECHNICIAN:
        return this.locationsService.assignTechnician(data);

      case LOCATION_JOB_TYPES.UPDATE_ASSIGNMENT:
        return this.locationsService.updateAssignment(data);

      case LOCATION_JOB_TYPES.REMOVE_ASSIGNMENT:
        return this.locationsService.removeAssignment(data);

      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }
}
