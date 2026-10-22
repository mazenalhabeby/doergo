import { Module } from '@nestjs/common';
import { ClockInModule } from '../clock-in/clock-in.module';
import { OnTheClockModule } from '../on-the-clock/on-the-clock.module';
import { PresenceModule } from '../presence/presence.module';
import { AttendanceReadService } from './attendance-read.service';
import { AttendanceEntriesReadService } from './attendance-entries-read.service';

/**
 * What the member and the office read: today's status, the history, the entries list.
 */
@Module({
  imports: [ClockInModule, OnTheClockModule, PresenceModule],
  providers: [AttendanceReadService, AttendanceEntriesReadService],
  exports: [AttendanceReadService, AttendanceEntriesReadService],
})
export class AttendanceReadsModule {}
