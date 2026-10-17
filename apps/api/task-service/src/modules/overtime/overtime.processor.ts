import { Processor } from '@nestjs/bullmq';
import { JobProcessor } from '../../common/queue/job-processor';
import { Job } from 'bullmq';
import { QUEUE_NAMES, OVERTIME_JOB_TYPES } from '@hbcfield/shared';
import { OvertimeService } from './overtime.service';
import { OvertimeDecisionService } from './overtime-decision.service';

@Processor(QUEUE_NAMES.OVERTIME)
export class OvertimeProcessor extends JobProcessor {
  constructor(
    private readonly overtimeService: OvertimeService,
    private readonly overtimeDecisions: OvertimeDecisionService,
  ) {
    super();
  }

  protected async handleJob(job: Job<any, any, string>): Promise<unknown> {
    const { data } = job;

    switch (job.name) {
      case OVERTIME_JOB_TYPES.TECHNICIAN_RESPOND:
        return this.overtimeService.technicianRespond(data);

      case OVERTIME_JOB_TYPES.LEADER_APPROVE:
        return this.overtimeDecisions.leaderApprove(data);

      case OVERTIME_JOB_TYPES.LEADER_APPROVE_SIGNATURE:
        return this.overtimeDecisions.leaderApproveSignature(data);

      case OVERTIME_JOB_TYPES.LEADER_REJECT:
        return this.overtimeDecisions.leaderReject(data);

      case OVERTIME_JOB_TYPES.CHECK_TIMEOUTS:
        return this.overtimeService.checkTimeouts();

      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }
}
