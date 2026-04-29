import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, OVERTIME_JOB_TYPES, OVERTIME_CONSTANTS } from '@hbcfield/shared';

@Injectable()
export class OvertimeScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OvertimeScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.OVERTIME)
    private readonly overtimeQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.setupScheduledJobs();
  }

  async onModuleDestroy() {
    this.logger.log('Overtime scheduler shutting down');
  }

  private async setupScheduledJobs() {
    try {
      await this.removeExistingRepeatableJobs();

      // Check for timed-out overtime requests every minute
      await this.overtimeQueue.add(
        OVERTIME_JOB_TYPES.CHECK_TIMEOUTS,
        { triggeredAt: new Date().toISOString() },
        {
          repeat: { every: OVERTIME_CONSTANTS.CHECK_INTERVAL_MS },
          jobId: OVERTIME_CONSTANTS.OVERTIME_TIMEOUT_JOB_ID,
          removeOnComplete: true,
          removeOnFail: { age: 3600 },
        },
      );

      this.logger.log(`Scheduled overtime timeout checker (every ${OVERTIME_CONSTANTS.CHECK_INTERVAL_MS / 1000}s)`);
    } catch (error) {
      this.logger.error('Failed to setup overtime scheduled jobs', error);
    }
  }

  private async removeExistingRepeatableJobs() {
    const repeatableJobs = await this.overtimeQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.name === OVERTIME_JOB_TYPES.CHECK_TIMEOUTS) {
        await this.overtimeQueue.removeRepeatableByKey(job.key);
      }
    }
  }
}
