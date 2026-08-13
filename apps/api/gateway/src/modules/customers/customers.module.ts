import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';

// Per-space CRM customers. Stateless forwarder — AUTH_SERVICE + TASK_SERVICE
// clients are registered app-wide, so no providers here.
@Module({
  controllers: [CustomersController],
})
export class CustomersModule {}
