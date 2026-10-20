import { Processor } from '@nestjs/bullmq';
import { JobProcessor } from '../../common/queue/job-processor';
import { Job } from 'bullmq';
import { QUEUE_NAMES, LOCATION_JOB_TYPES } from '@hbcfield/shared';
import { SpacesService } from './spaces.service';
import { SpaceUpdateService } from './space-update.service';
import { SpaceLifecycleService } from './space-lifecycle.service';
import { SpaceMembershipService } from './space-membership.service';
import { AssignmentTermsService } from './assignment-terms.service';

@Processor(QUEUE_NAMES.LOCATIONS)
export class SpacesProcessor extends JobProcessor {
  constructor(
    private readonly locationsService: SpacesService,
    private readonly spaceUpdate: SpaceUpdateService,
    private readonly spaceLifecycle: SpaceLifecycleService,
    private readonly membership: SpaceMembershipService,
    private readonly assignmentTerms: AssignmentTermsService,
  ) {
    super();
  }

  protected async handleJob(job: Job<any, any, string>): Promise<unknown> {
    const { data } = job;

    switch (job.name) {
      case LOCATION_JOB_TYPES.CREATE:
        return this.locationsService.create(data);

      case LOCATION_JOB_TYPES.UPDATE:
        return this.spaceUpdate.update(data);

      case LOCATION_JOB_TYPES.DELETE:
        return this.spaceLifecycle.remove(data);
      case LOCATION_JOB_TYPES.PURGE:
        return this.spaceLifecycle.purge(data);
      case LOCATION_JOB_TYPES.SET_DEFAULT:
        return this.spaceLifecycle.setDefault(data);

      // Member assignment operations
      case LOCATION_JOB_TYPES.ASSIGN_TECHNICIAN:
        return this.membership.assignTechnician(data);

      case LOCATION_JOB_TYPES.UPDATE_ASSIGNMENT:
        return this.assignmentTerms.updateAssignment(data);

      case LOCATION_JOB_TYPES.REMOVE_ASSIGNMENT:
        return this.membership.removeAssignment(data);

      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }
}
