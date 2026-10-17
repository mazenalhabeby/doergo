import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomerContactsController } from './customer-contacts.controller';
import { CustomerAddressesController } from './customer-addresses.controller';
import { CustomerInviteController } from './customer-invite.controller';

// Per-space CRM customers. Stateless forwarder — AUTH_SERVICE + TASK_SERVICE
// clients are registered app-wide, so no providers here.
@Module({
  // CustomersController first: its static paths (due, match-keys, import, contacts/:linkId) before `:id`.
  controllers: [CustomersController, CustomerContactsController, CustomerAddressesController, CustomerInviteController],
})
export class CustomersModule {}
