import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';

import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';

import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { LocationsProcessor } from './locations.processor';

@Module({
  // Space and roster mutations announce themselves so open clients re-read
  // instead of going stale until someone refreshes.
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  controllers: [LocationsController],
  providers: [LocationsService, LocationsProcessor],
  exports: [LocationsService],
})
export class LocationsModule {}
