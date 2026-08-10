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
 * Registers the shift reminder-engine sweep (a short-interval repeatable job).
 * The sweep NEVER clocks anyone out — it nudges open shifts past their expected
 * end and escalates to a space leader after a few unanswered reminders. On
 * startup it also de-registers the deprecated force-close job from Redis.
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
      // Remove existing repeatable jobs (incl. the deprecated force-close sweep)
      // to avoid duplicates on restart.
      await this.removeExistingRepeatableJobs();

      // Shift reminder sweep — short interval, indexed query, no force-close.
      await this.attendanceQueue.add(
        ATTENDANCE_JOB_TYPES.SHIFT_REMINDER,
        { triggeredAt: new Date().toISOString() },
        {
          repeat: {
            every: ATTENDANCE_CONSTANTS.SHIFT_REMINDER_SWEEP_INTERVAL_MS,
          },
          jobId: ATTENDANCE_CONSTANTS.SHIFT_REMINDER_JOB_ID,
          removeOnComplete: true,
          removeOnFail: { age: 86400 },
        },
      );

      this.logger.log(
        `Scheduled shift reminder sweep (every ${ATTENDANCE_CONSTANTS.SHIFT_REMINDER_SWEEP_INTERVAL_MS / 60000} min)`,
      );

      // No-show materialization — slow rolling upsert of expected shifts.
      await this.attendanceQueue.add(
        ATTENDANCE_JOB_TYPES.SHIFT_MATERIALIZE,
        { triggeredAt: new Date().toISOString() },
        {
          repeat: { every: ATTENDANCE_CONSTANTS.SHIFT_MATERIALIZE_INTERVAL_MS },
          jobId: ATTENDANCE_CONSTANTS.SHIFT_MATERIALIZE_JOB_ID,
          removeOnComplete: true,
          removeOnFail: { age: 86400 },
        },
      );
      // Seed once now so instances exist immediately (not only after 30 min).
      await this.attendanceQueue.add(
        ATTENDANCE_JOB_TYPES.SHIFT_MATERIALIZE,
        { triggeredAt: new Date().toISOString(), seed: true },
        { removeOnComplete: true, removeOnFail: { age: 3600 } },
      );
      this.logger.log(
        `Scheduled shift materialization (every ${ATTENDANCE_CONSTANTS.SHIFT_MATERIALIZE_INTERVAL_MS / 60000} min)`,
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
    const stale: string[] = [
      ATTENDANCE_JOB_TYPES.SHIFT_REMINDER,
      ATTENDANCE_JOB_TYPES.SHIFT_MATERIALIZE, // re-registered below (avoid dup on restart)
      ATTENDANCE_JOB_TYPES.AUTO_CLOCK_OUT, // deprecated force-close sweep
    ];
    const repeatableJobs = await this.attendanceQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (stale.includes(job.name)) {
        await this.attendanceQueue.removeRepeatableByKey(job.key);
        this.logger.debug(`Removed existing repeatable job: ${job.key}`);
      }
    }
  }

  async triggerShiftReminders() {
    const job = await this.attendanceQueue.add(
      ATTENDANCE_JOB_TYPES.SHIFT_REMINDER,
      { triggeredAt: new Date().toISOString(), manual: true },
      { removeOnComplete: true, removeOnFail: { age: 3600 } },
    );
    this.logger.log(`Manually triggered shift reminder sweep: ${job.id}`);
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
