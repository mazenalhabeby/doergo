import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@hbcfield/shared';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceProcessor } from './attendance.processor';
import { AttendanceScheduler } from './attendance.scheduler';
import { PresenceModule } from './presence/presence.module';
import { AttendanceCoreModule } from './core/attendance-core.module';
import { AutoClockModule } from './auto-clock/auto-clock.module';
import { ExtraTimeModule } from './extra-time/extra-time.module';
import { RestsModule } from './rests/rests.module';
import { NoShowsModule } from './no-shows/no-shows.module';
import { AttendanceShiftsModule } from './shifts/attendance-shifts.module';
import { ClockOutModule } from './clock-out/clock-out.module';
import { ClockInModule } from './clock-in/clock-in.module';
import { OnTheClockModule } from './on-the-clock/on-the-clock.module';
import { AttendanceEntriesModule } from './entries/attendance-entries.module';
import { AttendanceReadsModule } from './reads/attendance-reads.module';
import { AttendanceReportsModule } from './reports/attendance-reports.module';

/**
 * Clocking in and out. Each part is its own module (code-structure-fix 4.2): core · auto clock · extra
 * time · rests · no-shows · shifts · clock-out · clock-in · on the clock · entries · reads · reports,
 * plus presence. This module holds only what spans them: the AttendanceService facade, the BullMQ
 * processor and scheduler, and the HTTP-facing message controller.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.ATTENDANCE }),
    BullModule.registerQueue({ name: QUEUE_NAMES.OVERTIME }),
    PresenceModule,
    AttendanceCoreModule,
    AutoClockModule,
    ExtraTimeModule,
    RestsModule,
    NoShowsModule,
    AttendanceShiftsModule,
    ClockOutModule,
    ClockInModule,
    OnTheClockModule,
    AttendanceEntriesModule,
    AttendanceReadsModule,
    AttendanceReportsModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceProcessor, AttendanceScheduler],
  // ShiftRematch (shifts), ClockOut + DecidedClose (clock-out), NoShowSettle (no-shows) are used elsewhere.
  exports: [AttendanceService, AttendanceScheduler, AttendanceShiftsModule, ClockOutModule, NoShowsModule],
})
export class AttendanceModule {}
