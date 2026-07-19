import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, SUPPORT_JOB_TYPES } from '@hbcfield/shared';
import { SupportService } from './support.service';

/**
 * The support write-path is synchronous (MessagePattern). This processor exists
 * only for the ONE delayed job: the SLA-first-response breach check, scheduled at
 * ticket creation and cancelled the moment an agent replies.
 */
@Processor(QUEUE_NAMES.SUPPORT)
export class SupportProcessor extends WorkerHost {
  private readonly logger = new Logger(SupportProcessor.name);

  constructor(private readonly support: SupportService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case SUPPORT_JOB_TYPES.SLA_BREACH_CHECK:
        return this.support.checkSlaBreach(job.data);
      default:
        this.logger.warn(`Unknown support job ${job.name}`);
        return null;
    }
  }
}
