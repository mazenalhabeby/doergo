import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  ATTENDANCE_JOB_TYPES,
  ATTENDANCE_CONSTANTS,
} from '@doergo/shared';

/**
 * Attendance Scheduler Service
 *
 * Registers repeatable jobs for automatic clock-out:
 * 1. Hourly check for entries exceeding max duration (16 hours)
 * 2. Midnight job to close any remaining open entries
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
    // Clean up repeatable jobs on shutdown (optional, they persist in Redis)
    this.logger.log('Attendance scheduler shutting down');
  }

  /**
   * Set up repeatable jobs for auto clock-out
   */
  private async setupScheduledJobs() {
    try {
      // Remove existing repeatable jobs to avoid duplicates on restart
      await this.removeExistingRepeatableJobs();

      // 1. Hourly auto clock-out check (for entries exceeding max duration)
      await this.attendanceQueue.add(
        ATTENDANCE_JOB_TYPES.AUTO_CLOCK_OUT,
        { type: 'hourly', triggeredAt: new Date().toISOString() },
        {
          repeat: {
            every: ATTENDANCE_CONSTANTS.AUTO_CLOCK_OUT_INTERVAL_MS,
          },
          jobId: ATTENDANCE_CONSTANTS.AUTO_CLOCK_OUT_JOB_ID,
          removeOnComplete: true,
          removeOnFail: { age: 86400 }, // Keep failed for 24 hours
        },
      );

      this.logger.log(
        `Scheduled hourly auto clock-out job (every ${ATTENDANCE_CONSTANTS.AUTO_CLOCK_OUT_INTERVAL_MS / 60000} minutes)`,
      );

      // 2. Midnight auto clock-out (close all remaining entries at end of day)
      await this.attendanceQueue.add(
        ATTENDANCE_JOB_TYPES.AUTO_CLOCK_OUT,
        { type: 'midnight', triggeredAt: new Date().toISOString() },
        {
          repeat: {
            pattern: ATTENDANCE_CONSTANTS.MIDNIGHT_CLOCK_OUT_CRON,
          },
          jobId: ATTENDANCE_CONSTANTS.MIDNIGHT_CLOCK_OUT_JOB_ID,
          removeOnComplete: true,
          removeOnFail: { age: 86400 },
        },
      );

      this.logger.log(
        `Scheduled midnight auto clock-out job (cron: ${ATTENDANCE_CONSTANTS.MIDNIGHT_CLOCK_OUT_CRON})`,
      );

      // Log current repeatable jobs
      const repeatableJobs = await this.attendanceQueue.getRepeatableJobs();
      this.logger.log(
        `Active repeatable jobs: ${repeatableJobs.map((j) => j.name).join(', ')}`,
      );
    } catch (error) {
      this.logger.error('Failed to setup scheduled jobs', error);
    }
  }

  /**
   * Remove existing repeatable jobs to avoid duplicates
   */
  private async removeExistingRepeatableJobs() {
    const repeatableJobs = await this.attendanceQueue.getRepeatableJobs();

    for (const job of repeatableJobs) {
      if (
        job.name === ATTENDANCE_JOB_TYPES.AUTO_CLOCK_OUT ||
        job.id === ATTENDANCE_CONSTANTS.AUTO_CLOCK_OUT_JOB_ID ||
        job.id === ATTENDANCE_CONSTANTS.MIDNIGHT_CLOCK_OUT_JOB_ID
      ) {
        await this.attendanceQueue.removeRepeatableByKey(job.key);
        this.logger.debug(`Removed existing repeatable job: ${job.key}`);
      }
    }
  }

  /**
   * Manually trigger auto clock-out (for testing or admin actions)
   */
  async triggerAutoClockOut(type: 'hourly' | 'midnight' = 'hourly') {
    const job = await this.attendanceQueue.add(
      ATTENDANCE_JOB_TYPES.AUTO_CLOCK_OUT,
      { type, triggeredAt: new Date().toISOString(), manual: true },
      {
        removeOnComplete: true,
        removeOnFail: { age: 3600 },
      },
    );

    this.logger.log(`Manually triggered auto clock-out job: ${job.id}`);
    return job.id;
  }

  /**
   * Get info about scheduled jobs
   */
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
      queueStats: {
        waiting,
        active,
        delayed,
      },
    };
  }
}
