import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, OVERTIME_JOB_TYPES, buildJobError } from '@hbcfield/shared';
import { OvertimeService } from './overtime.service';

@Processor(QUEUE_NAMES.OVERTIME)
export class OvertimeProcessor extends WorkerHost {
  private readonly logger = new Logger(OvertimeProcessor.name);

  constructor(private readonly overtimeService: OvertimeService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);

    try {
      return await this.handleJob(job);
    } catch (error: any) {
      this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
      // Structured error for the gateway; 4xx → no retry (H3).
      throw buildJobError(error);
    }
  }

  private async handleJob(job: Job<any, any, string>): Promise<any> {
    const { data } = job;

    switch (job.name) {
      case OVERTIME_JOB_TYPES.INITIATE:
        return this.overtimeService.initiateRequest(data);

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

      case OVERTIME_JOB_TYPES.END_OVERTIME:
        return this.overtimeService.endOvertime(data);

      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }
}
