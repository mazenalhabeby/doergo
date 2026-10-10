import { Processor } from '@nestjs/bullmq';
import { JobProcessor } from '../../common/queue/job-processor';
import { Job } from 'bullmq';
import { QUEUE_NAMES, OVERTIME_JOB_TYPES } from '@hbcfield/shared';
import { OvertimeService } from './overtime.service';

@Processor(QUEUE_NAMES.OVERTIME)
export class OvertimeProcessor extends JobProcessor {
  constructor(private readonly overtimeService: OvertimeService) {
    super();
  }

  protected async handleJob(job: Job<any, any, string>): Promise<any> {
    const { data } = job;

    switch (job.name) {
      case OVERTIME_JOB_TYPES.TECHNICIAN_RESPOND:
        return this.overtimeService.technicianRespond(data);

      case OVERTIME_JOB_TYPES.LEADER_APPROVE:
        return this.overtimeService.leaderApprove(data);

      case OVERTIME_JOB_TYPES.LEADER_APPROVE_SIGNATURE:
        return this.overtimeService.leaderApproveSignature(data);

      case OVERTIME_JOB_TYPES.LEADER_REJECT:
        return this.overtimeService.leaderReject(data);

      case OVERTIME_JOB_TYPES.CHECK_TIMEOUTS:
        return this.overtimeService.checkTimeouts();

      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }
}
