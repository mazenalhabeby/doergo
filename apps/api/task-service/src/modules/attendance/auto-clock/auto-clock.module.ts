import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { AttendanceCoreModule } from '../core/attendance-core.module';
import { AutoClockService } from './auto-clock.service';
import { AutoClockPlanService } from './auto-clock-plan.service';
import { AutoClockUndoService } from './auto-clock-undo.service';
import { AutoClockRpcController } from './auto-clock.rpc.controller';

/**
 * The automatic clock: plan, consent, undo, and "is this member automatic" for the closers and sweeps.
 */
@Module({
  imports: [
    AttendanceCoreModule,
    ClientsModule.registerAsync([
      createClientOptions(SERVICE_NAMES.NOTIFICATION),
      createClientOptions(SERVICE_NAMES.AUTH),
    ]),
  ],
  controllers: [AutoClockRpcController],
  providers: [AutoClockService, AutoClockPlanService, AutoClockUndoService],
  exports: [AutoClockService, AutoClockPlanService, AutoClockUndoService],
})
export class AutoClockModule {}
