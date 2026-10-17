import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { ClockGateService } from './clock-gate.service';
import { CrewService } from './crew.service';
import { JobPauseService } from './job-pause.service';
import { JobTimeService } from './job-time.service';
import { JobPauseReadService } from './job-pause-read.service';

/**
 * Paused at clock-out, the handover note, job time, the clock gate and the
 * crew. Its own module so attendance (every way a shift ends) and tasks
 * (resume, the job page, step moves) share one set of services without
 * depending on each other.
 */
@Module({
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  providers: [JobPauseService, JobPauseReadService, JobTimeService, ClockGateService, CrewService],
  exports: [JobPauseService, JobPauseReadService, JobTimeService, ClockGateService, CrewService],
})
export class HandoverModule {}
