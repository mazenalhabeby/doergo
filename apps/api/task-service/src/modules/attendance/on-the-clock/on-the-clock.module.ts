import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { ClockOutModule } from '../clock-out/clock-out.module';
import { RestsModule } from '../rests/rests.module';
import { PresenceModule } from '../presence/presence.module';
import { HeartbeatService } from './heartbeat.service';
import { HeartbeatBatchService } from './heartbeat-batch.service';
import { ExcursionsService } from './excursions.service';
import { ExcursionNotices } from './excursion-notices.service';

/**
 * While a member is on the clock: the heartbeat (single and batched) and leaving the site.
 */
@Module({
  imports: [
    ClockOutModule,
    RestsModule,
    PresenceModule,
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  providers: [HeartbeatService, HeartbeatBatchService, ExcursionsService, ExcursionNotices],
  exports: [HeartbeatService, HeartbeatBatchService, ExcursionsService],
})
export class OnTheClockModule {}
