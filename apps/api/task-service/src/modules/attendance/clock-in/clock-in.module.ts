import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { AttendanceCoreModule } from '../core/attendance-core.module';
import { AutoClockModule } from '../auto-clock/auto-clock.module';
import { NoShowsModule } from '../no-shows/no-shows.module';
import { PresenceModule } from '../presence/presence.module';
import { ClockInContextService } from './clock-in-context.service';
import { ClockInLocationsService } from './clock-in-locations.service';
import { ClockInRemoteService } from './clock-in-remote.service';
import { ClockInSiteWriter } from './clock-in-site.writer';
import { ClockInService } from './clock-in.service';

/**
 * A clock-in: where the member may clock in, the remote half, the on-site half, and the steps.
 */
@Module({
  imports: [
    AttendanceCoreModule,
    AutoClockModule,
    NoShowsModule,
    PresenceModule,
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  providers: [ClockInContextService, ClockInLocationsService, ClockInRemoteService, ClockInSiteWriter, ClockInService],
  exports: [ClockInContextService, ClockInLocationsService, ClockInRemoteService, ClockInSiteWriter, ClockInService],
})
export class ClockInModule {}
