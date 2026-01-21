import { Module, OnModuleInit, Inject } from '@nestjs/common';
import { ClientsModule, ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@doergo/shared';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';

@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  controllers: [LocationController],
  providers: [LocationService],
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
