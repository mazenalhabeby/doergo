import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
// The CRM address routes reuse the CRM's own reach rule (CustomersService).
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [CustomersModule],
  controllers: [PortalController],
  providers: [PortalService],
  exports: [PortalService],
})
export class PortalModule {}
