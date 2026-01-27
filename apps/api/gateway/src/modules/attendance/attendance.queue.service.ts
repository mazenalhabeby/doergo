import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES, ATTENDANCE_JOB_TYPES, BaseQueueService } from '@doergo/shared';

@Injectable()
export class AttendanceQueueService extends BaseQueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.ATTENDANCE) attendanceQueue: Queue,
    configService: ConfigService,
  ) {
    super(
      attendanceQueue,
      configService,
      QUEUE_NAMES.ATTENDANCE,
      AttendanceQueueService.name,
    );
  }

  /**
   * Clock in at a location
   */
  async clockIn(data: Record<string, any>) {
    return this.addJobAndWait(ATTENDANCE_JOB_TYPES.CLOCK_IN, data);
  }

  /**
   * Clock out
   */
  async clockOut(data: Record<string, any>) {
    return this.addJobAndWait(ATTENDANCE_JOB_TYPES.CLOCK_OUT, data);
  }

  /**
   * Trigger auto clock-out for overdue entries
   */
  async autoClockOut(type: 'hourly' | 'midnight' = 'hourly') {
    return this.addJobAndWait(ATTENDANCE_JOB_TYPES.AUTO_CLOCK_OUT, {
      type,
      manual: true,
      triggeredAt: new Date().toISOString(),
    });
  }

  /**
   * Get scheduler info (repeatable jobs)
   */
  async getSchedulerInfo() {
    const repeatableJobs = await this.queue.getRepeatableJobs();
    const waiting = await this.queue.getWaitingCount();
    const active = await this.queue.getActiveCount();
    const delayed = await this.queue.getDelayedCount();
    const completed = await this.queue.getCompletedCount();
    const failed = await this.queue.getFailedCount();

    return {
      repeatableJobs: repeatableJobs.map((job) => ({
        name: job.name,
        id: job.id,
        pattern: job.pattern,
        every: job.every,
        next: job.next ? new Date(job.next).toISOString() : null,
      })),
      queueStats: {
        waiting,
        active,
        delayed,
        completed,
        failed,
      },
    };
  }
}
