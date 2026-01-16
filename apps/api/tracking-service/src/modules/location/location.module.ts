import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@doergo/shared';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';

@Module({
  imports: [
    ClientsModule.register([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  controllers: [LocationController],
  providers: [LocationService],
})
export class LocationModule {}
