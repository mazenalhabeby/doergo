import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { StatementService } from './statement.service';
import { ExchangeRateService } from './exchange-rate.service';
import { LegalEntitiesService } from './legal-entities.service';
import { LegalEntitiesController } from './legal-entities.controller';

@Module({
  controllers: [InvoiceController, LegalEntitiesController],
  providers: [InvoiceService, StatementService, ExchangeRateService, LegalEntitiesService],
  exports: [InvoiceService, LegalEntitiesService],
})
export class InvoiceModule {}
