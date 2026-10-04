import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { StatementService } from './statement.service';

@Module({
  controllers: [InvoiceController],
  providers: [InvoiceService, StatementService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
