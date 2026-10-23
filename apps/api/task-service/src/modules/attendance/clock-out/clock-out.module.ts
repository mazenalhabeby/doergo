import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { AttendanceCoreModule } from '../core/attendance-core.module';
import { ExtraTimeModule } from '../extra-time/extra-time.module';
import { AutoClockModule } from '../auto-clock/auto-clock.module';
import { HandoverModule } from '../../tasks/handover/handover.module';
import { ClockOutService } from './clock-out.service';
import { ClockOutAlertsService } from './clock-out-alerts.service';
import { DecidedCloseService } from './decided-close.service';
import { ShiftCloseSweepService } from './shift-close-sweep.service';
import { ShiftCloser } from './shift-closer.service';

/**
 * Closing a shift — by the member, by an answer, or by the sweeps that close what nobody closed. The one
 * way a shift closes (the legacy overtime module closes through it too).
 */
@Module({
  imports: [
    AttendanceCoreModule,
    ExtraTimeModule,
    AutoClockModule,
    HandoverModule,
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  providers: [ShiftCloser, ClockOutService, ClockOutAlertsService, DecidedCloseService, ShiftCloseSweepService],
  exports: [ClockOutService, ClockOutAlertsService, DecidedCloseService, ShiftCloseSweepService],
})
export class ClockOutModule {}
