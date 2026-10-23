import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { AttendanceCoreModule } from '../core/attendance-core.module';
import { AutoClockModule } from '../auto-clock/auto-clock.module';
import { ShiftRematchService } from './shift-rematch.service';
import { ShiftInstancesService } from './shift-instances.service';
import { ShiftReminderSweepService } from './shift-reminder-sweep.service';
import { DayHoursReshapeService } from './day-hours-reshape.service';

/**
 * Shifts as attendance sees them: today's instances, re-matching entries to a shift added later, the reminders,
 * and re-shaping a day the office changed the hours of.
 */
@Module({
  imports: [
    AttendanceCoreModule,
    AutoClockModule,
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  providers: [ShiftRematchService, ShiftInstancesService, ShiftReminderSweepService, DayHoursReshapeService],
  exports: [ShiftRematchService, ShiftInstancesService, ShiftReminderSweepService, DayHoursReshapeService],
})
export class AttendanceShiftsModule {}
