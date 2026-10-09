import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { SessionEvents } from './session-events.service';

@Module({
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  providers: [SessionEvents],
  exports: [SessionEvents],
})
export class SessionEventsModule {}
