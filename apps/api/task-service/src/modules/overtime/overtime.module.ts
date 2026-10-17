import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';
import { SERVICE_NAMES, createClientOptions, QUEUE_NAMES } from '@hbcfield/shared';
import { OvertimeService } from './overtime.service';
import { OvertimeRecordService } from './overtime-record.service';
import { OvertimeProcessor } from './overtime.processor';
import { OvertimeScheduler } from './overtime.scheduler';
import { OvertimeController } from './overtime.controller';
import { AttendanceModule } from '../attendance/attendance.module';
import { OvertimeDecisionService } from './overtime-decision.service';
import { OvertimeSummaryService } from './overtime-summary.service';

@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
    BullModule.registerQueue({ name: QUEUE_NAMES.OVERTIME }),
    // Approving a round is ONE rule, owned by attendance: see OvertimeService.approveRequest.
    AttendanceModule,
  ],
  controllers: [OvertimeController],
  providers: [
    OvertimeService,
    OvertimeDecisionService,
    OvertimeRecordService,
    OvertimeSummaryService,
    OvertimeProcessor,
    OvertimeScheduler,
  ],
  exports: [OvertimeService],
})
export class OvertimeModule {}
