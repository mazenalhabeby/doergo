import { Processor } from '@nestjs/bullmq';
import { JobProcessor } from '../../common/queue/job-processor';
import { Job } from 'bullmq';
import { QUEUE_NAMES, LOCATION_JOB_TYPES } from '@hbcfield/shared';
import { LocationsService } from './locations.service';

@Processor(QUEUE_NAMES.LOCATIONS)
export class LocationsProcessor extends JobProcessor {
  constructor(private readonly locationsService: LocationsService) {
    super();
  }

  protected async handleJob(job: Job<any, any, string>): Promise<any> {
    const { data } = job;

    switch (job.name) {
      case LOCATION_JOB_TYPES.CREATE:
        return this.locationsService.create(data);

      case LOCATION_JOB_TYPES.UPDATE:
        return this.locationsService.update(data);

      case LOCATION_JOB_TYPES.DELETE:
        return this.locationsService.remove(data);
      case LOCATION_JOB_TYPES.PURGE:
        return this.locationsService.purge(data);
      case LOCATION_JOB_TYPES.SET_DEFAULT:
        return this.locationsService.setDefault(data);

      // Member assignment operations
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
