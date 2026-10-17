import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsProcessor } from './reports.processor';
import { ReportReadService } from './report-read.service';
import { ReportPartsService } from './report-parts.service';
import { ReportAttachmentsService } from './report-attachments.service';

@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportReadService,
    ReportPartsService,
    ReportAttachmentsService,
    ReportsProcessor, // BullMQ processor for exactly-once job processing
  ],
  exports: [ReportsService, ReportReadService, ReportPartsService, ReportAttachmentsService],
})
export class ReportsModule {}
