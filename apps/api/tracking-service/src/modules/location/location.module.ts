import { Module, OnModuleInit, Inject } from '@nestjs/common';
import { ClientsModule, ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';
import { RouteMatchingService } from './route-matching.service';
import { WorkerLocationReadService } from './worker-location-read.service';
import { RouteReadService } from './route-read.service';
import { LocationRetentionService } from './location-retention.service';
import { LocationBatchService } from './location-batch.service';

@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  controllers: [LocationController],
  providers: [
    LocationService,
    LocationBatchService,
    WorkerLocationReadService,
    RouteReadService,
    LocationRetentionService,
    RouteMatchingService,
  ],
})
export class LocationModule implements OnModuleInit {
  constructor(
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
  ) {}

  async onModuleInit() {
    // Pre-connect to notification service to avoid ECONNRESET on first emit
    await this.notificationClient.connect();
  }
}
