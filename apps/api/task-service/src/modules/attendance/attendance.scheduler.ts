import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  ATTENDANCE_JOB_TYPES,
  ATTENDANCE_CONSTANTS,
} from '@hbcfield/shared';

/**
 * Attendance Scheduler Service
 *
 * Registers a single repeatable job that runs every 15 minutes.
 * The job checks ALL open clock-in entries and auto-clocks out based on:
 * 1. Max shift duration (16 hours)
 * 2. Midnight in the location's timezone
 * 3. Technician schedule end time + grace period
 */
@Injectable()
export class AttendanceScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttendanceScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.ATTENDANCE)
    private readonly attendanceQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.setupScheduledJobs();
  }

  async onModuleDestroy() {
    this.logger.log('Attendance scheduler shutting down');
  }

  private async setupScheduledJobs() {
    try {
      // Remove existing repeatable jobs to avoid duplicates on restart
      await this.removeExistingRepeatableJobs();

      // Single job that runs every 15 minutes — handles all auto-clock-out scenarios
      await this.attendanceQueue.add(
        ATTENDANCE_JOB_TYPES.AUTO_CLOCK_OUT,
        { triggeredAt: new Date().toISOString() },
        {
          repeat: {
            every: ATTENDANCE_CONSTANTS.AUTO_CLOCK_OUT_INTERVAL_MS,
          },
          jobId: ATTENDANCE_CONSTANTS.AUTO_CLOCK_OUT_JOB_ID,
          removeOnComplete: true,
          removeOnFail: { age: 86400 },
        },
      );

      this.logger.log(
        `Scheduled auto clock-out job (every ${ATTENDANCE_CONSTANTS.AUTO_CLOCK_OUT_INTERVAL_MS / 60000} minutes) — timezone-aware`,
      );

      const repeatableJobs = await this.attendanceQueue.getRepeatableJobs();
      this.logger.log(
        `Active repeatable jobs: ${repeatableJobs.map((j) => `${j.name}(${j.every || j.pattern})`).join(', ')}`,
      );
    } catch (error) {
      this.logger.error('Failed to setup scheduled jobs', error);
    }
  }

  private async removeExistingRepeatableJobs() {
    const repeatableJobs = await this.attendanceQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.name === ATTENDANCE_JOB_TYPES.AUTO_CLOCK_OUT) {
        await this.attendanceQueue.removeRepeatableByKey(job.key);
        this.logger.debug(`Removed existing repeatable job: ${job.key}`);
      }
    }
  }

  async triggerAutoClockOut() {
    const job = await this.attendanceQueue.add(
      ATTENDANCE_JOB_TYPES.AUTO_CLOCK_OUT,
      { triggeredAt: new Date().toISOString(), manual: true },
      { removeOnComplete: true, removeOnFail: { age: 3600 } },
    );
    this.logger.log(`Manually triggered auto clock-out job: ${job.id}`);
    return job.id;
  }

  async getScheduledJobsInfo() {
    const repeatableJobs = await this.attendanceQueue.getRepeatableJobs();
    const waiting = await this.attendanceQueue.getWaitingCount();
    const active = await this.attendanceQueue.getActiveCount();
    const delayed = await this.attendanceQueue.getDelayedCount();

    return {
      repeatableJobs: repeatableJobs.map((job) => ({
        name: job.name,
        id: job.id,
        pattern: job.pattern,
        every: job.every,
        next: job.next,
      })),
      queueStats: { waiting, active, delayed },
    };
  }
}
