import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { PresenceService } from './presence.service';

/**
 * Where somebody on the clock is working now. Its own module so attendance
 * (clock-in, heartbeats) and tasks (a job on its way) can both feed it without
 * depending on each other.
 */
@Module({
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
