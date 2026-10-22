import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { TaskCoreModule } from '../core/task-core.module';
import { PresenceModule } from '../../attendance/presence/presence.module';
import { HandoverModule } from '../handover/handover.module';
import { TaskStatusService } from './task-status.service';

/**
 * Moving a job through its workflow: the gates, the write, what follows a move (crew, presence, CRM).
 */
@Module({
  imports: [
    TaskCoreModule,
    PresenceModule,
    HandoverModule,
    ClientsModule.registerAsync([
      createClientOptions(SERVICE_NAMES.NOTIFICATION),
      // Step forms write their CRM fields through auth-service's own activity path.
      createClientOptions(SERVICE_NAMES.AUTH),
    ]),
  ],
  providers: [TaskStatusService],
  exports: [TaskStatusService],
})
export class TaskStatusModule {}
