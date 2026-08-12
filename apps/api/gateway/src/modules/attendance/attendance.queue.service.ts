import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES, ATTENDANCE_JOB_TYPES, BaseQueueService } from '@hbcfield/shared';

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
   * Send location heartbeat while clocked in
   */
  async heartbeat(data: Record<string, any>) {
    return this.addJobAndWait(ATTENDANCE_JOB_TYPES.HEARTBEAT, data);
  }
}
