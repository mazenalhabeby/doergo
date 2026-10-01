import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { JobPauseService } from './job-pause.service';

/**
 * Paused at clock-out, and the handover note. Its own module so attendance (every
 * way a shift ends) and tasks (resume, the job page) share one service without
 * depending on each other.
 */
@Module({
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  providers: [JobPauseService],
  exports: [JobPauseService],
})
export class HandoverModule {}
