import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, ATTENDANCE_JOB_TYPES } from '@doergo/shared';
import { AttendanceService } from './attendance.service';

@Processor(QUEUE_NAMES.ATTENDANCE)
export class AttendanceProcessor extends WorkerHost {
  private readonly logger = new Logger(AttendanceProcessor.name);

  constructor(private readonly attendanceService: AttendanceService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);

    try {
      return await this.handleJob(job);
    } catch (error: any) {
      this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
      // Re-throw with structured error for gateway to parse
      throw new Error(
        JSON.stringify({
          message: error.message,
          statusCode: error.status || error.statusCode || 500,
        }),
      );
    }
  }

  private async handleJob(job: Job<any, any, string>): Promise<any> {
    const { data } = job;

    switch (job.name) {
      case ATTENDANCE_JOB_TYPES.CLOCK_IN:
        return this.attendanceService.clockIn(data);

      case ATTENDANCE_JOB_TYPES.CLOCK_OUT:
        return this.attendanceService.clockOut(data);

      case ATTENDANCE_JOB_TYPES.AUTO_CLOCK_OUT:
        return this.attendanceService.autoClockOut(data);

      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }
}
