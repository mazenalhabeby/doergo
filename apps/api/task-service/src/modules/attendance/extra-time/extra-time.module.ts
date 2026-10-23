import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { AttendanceCoreModule } from '../core/attendance-core.module';
import { ExtraTimeService } from './extra-time.service';
import { ExtraTimeDecisionService } from './extra-time-decision.service';
import { ExtraTimeApprovalService } from './extra-time-approval.service';
import { OutsideShiftService } from './outside-shift.service';
import { OutsideShiftController } from './outside-shift.controller';

/**
 * Extra time and overtime rounds on a running shift: asking, deciding, the second step — and time
 * worked outside the planned shift, decided once (outside-shift.service.ts).
 */
@Module({
  imports: [AttendanceCoreModule, ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  controllers: [OutsideShiftController],
  providers: [ExtraTimeService, ExtraTimeDecisionService, ExtraTimeApprovalService, OutsideShiftService],
  exports: [ExtraTimeService, ExtraTimeDecisionService, OutsideShiftService],
})
export class ExtraTimeModule {}
