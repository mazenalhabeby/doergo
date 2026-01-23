import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@doergo/shared';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsProcessor } from './reports.processor';

@Module({
  imports: [
    ClientsModule.register([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportsProcessor, // BullMQ processor for exactly-once job processing
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
