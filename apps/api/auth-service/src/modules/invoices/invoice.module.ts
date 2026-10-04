import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { StatementService } from './statement.service';
import { ExchangeRateService } from './exchange-rate.service';

@Module({
  controllers: [InvoiceController],
  providers: [InvoiceService, StatementService, ExchangeRateService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
