import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, ATTENDANCE_JOB_TYPES, buildJobError } from '@hbcfield/shared';
import { AttendanceService } from './attendance.service';

// concurrency:20 (audit P1) — the default of 1 serialised every clock-in/out,
// heartbeat, the 1-min reminder sweep and the 30-min materialize through a single
// slot, so a boundary burst queued clock-ins behind a sweep → addJobAndWait
// timeouts → mass 5xx. 20 slots decouples the interactive ops from the sweeps.
@Processor(QUEUE_NAMES.ATTENDANCE, { concurrency: 20 })
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
      // Structured error for the gateway; 4xx → no retry (H3).
      throw buildJobError(error);
    }
  }

  private async handleJob(job: Job<any, any, string>): Promise<any> {
    const { data } = job;

    switch (job.name) {
      case ATTENDANCE_JOB_TYPES.CLOCK_IN:
        return this.attendanceService.clockIn(data);

      case ATTENDANCE_JOB_TYPES.CLOCK_OUT:
        return this.attendanceService.clockOut(data);

      case ATTENDANCE_JOB_TYPES.SHIFT_REMINDER:
      // Route any stray legacy job (queued in Redis before the upgrade) to the
      // reminder engine too, so it never throws "Unknown job type".
      case ATTENDANCE_JOB_TYPES.AUTO_CLOCK_OUT: {
        // One tick drives BOTH the forgot-to-clock-out (reminder) sweep and the
        // no-show sweep — each is a single indexed query returning only due rows.
        const [clockOut, noShow] = await Promise.all([
          this.attendanceService.runShiftReminders(data),
          this.attendanceService.runNoShowSweep(),
        ]);
        return { clockOut, noShow };
      }

      case ATTENDANCE_JOB_TYPES.SHIFT_MATERIALIZE:
        return this.attendanceService.materializeShiftInstances();

      case ATTENDANCE_JOB_TYPES.HEARTBEAT:
        return this.attendanceService.heartbeat(data);

      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }
}
