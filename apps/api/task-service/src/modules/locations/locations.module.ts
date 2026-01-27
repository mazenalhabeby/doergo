import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { LocationsProcessor } from './locations.processor';

@Module({
  controllers: [LocationsController],
  providers: [LocationsService, LocationsProcessor],
  exports: [LocationsService],
})
export class LocationsModule {}
