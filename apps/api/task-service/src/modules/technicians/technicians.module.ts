import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { PrismaModule, SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { TechniciansController } from './technicians.controller';
import { TechniciansService } from './technicians.service';
import { CoverService } from './cover.service';

@Module({
  // NotificationRoutingService needs no import — NotificationRoutingModule is
  // @Global, deliberately, so one instance holds one recipient cache.
  imports: [
    PrismaModule,
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  controllers: [TechniciansController],
  providers: [TechniciansService, CoverService],
  exports: [TechniciansService, CoverService],
})
export class TechniciansModule {}
