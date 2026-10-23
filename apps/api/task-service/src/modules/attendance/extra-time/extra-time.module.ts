import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { AttendanceCoreModule } from '../core/attendance-core.module';
import { ExtraTimeService } from './extra-time.service';
import { ExtraTimeDecisionService } from './extra-time-decision.service';
import { ExtraTimeApprovalService } from './extra-time-approval.service';

/**
 * Extra time and overtime rounds on a running shift: asking, deciding, the second step.
 */
@Module({
  imports: [AttendanceCoreModule, ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  providers: [ExtraTimeService, ExtraTimeDecisionService, ExtraTimeApprovalService],
  exports: [ExtraTimeService, ExtraTimeDecisionService],
})
export class ExtraTimeModule {}
