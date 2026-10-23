import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomerContactsController } from './customer-contacts.controller';
import { CustomerAddressesController } from './customer-addresses.controller';
import { CustomerInviteController } from './customer-invite.controller';
import { CustomerCrmCalls } from './customer-crm-calls';

// Per-space CRM customers. Stateless forwarder — AUTH_SERVICE + TASK_SERVICE
// clients are registered app-wide; CustomerCrmCalls is what the controllers share.
@Module({
  // CustomersController first: its static paths (due, match-keys, import, contacts/:linkId) before `:id`.
  controllers: [CustomersController, CustomerContactsController, CustomerAddressesController, CustomerInviteController],
  providers: [CustomerCrmCalls],
})
export class CustomersModule {}
