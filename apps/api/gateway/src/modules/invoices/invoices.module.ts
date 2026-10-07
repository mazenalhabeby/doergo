import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { LegalEntitiesController } from './legal-entities.controller';

@Module({
  controllers: [InvoicesController, LegalEntitiesController],
})
export class InvoicesModule {}
