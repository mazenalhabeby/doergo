import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { InvoiceCreateService } from './invoice-create.service';
import { InvoiceEditService } from './invoice-edit.service';
import { InvoiceItemsService } from './invoice-items.service';
import { InvoiceGatherService } from './invoice-gather.service';
import { SiteTimeService } from './site-time.service';
import { StatementService } from './statement.service';
import { ExchangeRateService } from './exchange-rate.service';
import { LegalEntitiesService } from './legal-entities.service';
import { LegalEntitiesController } from './legal-entities.controller';

@Module({
  controllers: [InvoiceController, LegalEntitiesController],
  providers: [
    InvoiceService,
    InvoiceCreateService,
    InvoiceEditService,
    InvoiceItemsService,
    InvoiceGatherService,
    SiteTimeService,
    StatementService,
    ExchangeRateService,
    LegalEntitiesService,
  ],
  exports: [InvoiceService, LegalEntitiesService],
})
export class InvoiceModule {}
