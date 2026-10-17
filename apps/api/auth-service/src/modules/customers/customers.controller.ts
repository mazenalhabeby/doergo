import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CustomersService, CustomerInput, CrmCaller } from './customers.service';
import { ContactImportService } from './contact-import.service';
import { CustomerWriteService } from './customer-write.service';
import { CustomerContactsService } from './customer-contacts.service';
import { CustomerActivitiesService } from './customer-activities.service';
import { CustomerDueService } from './customer-due.service';

import {
  pattern,
  customerMatchKeys,
  importCustomerContacts,
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  listCustomerContacts,
  listCustomerContactCompanies,
  addCustomerContact,
  updateCustomerContact,
  removeCustomerContact,
  promoteCustomerContact,
  customersDue,
  listCustomerActivities,
  addCustomerActivity,
  updateCustomerActivity,
  deleteCustomerActivity,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
@Controller()
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly dueCard: CustomerDueService,
    private readonly activities: CustomerActivitiesService,
    private readonly contacts: CustomerContactsService,
    private readonly customerWrite: CustomerWriteService,
    private readonly contactImport: ContactImportService,
  ) {}

  // ── Clients from a phone's address book ──
  @MessagePattern(pattern(customerMatchKeys))
  matchKeys(@Payload() d: RpcRequest<typeof customerMatchKeys>) {
    return this.contactImport.matchKeys(d);
  }

  @MessagePattern(pattern(importCustomerContacts))
  importContacts(@Payload() d: RpcRequest<typeof importCustomerContacts>) {
    return this.contactImport.import(d);
  }

  @MessagePattern(pattern(listCustomers))
  async list(@Payload() data: RpcRequest<typeof listCustomers>) {
    return this.customersService.list(data);
  }

  @MessagePattern(pattern(getCustomer))
  async get(@Payload() data: RpcRequest<typeof getCustomer>) {
    return this.customersService.get(data.id, data.organizationId, data.caller);
  }

  @MessagePattern(pattern(createCustomer))
  async create(@Payload() data: RpcRequest<typeof createCustomer>) {
    return this.customerWrite.create(data.organizationId, data.dto, data.caller);
  }

  @MessagePattern(pattern(updateCustomer))
  async update(@Payload() data: RpcRequest<typeof updateCustomer>) {
    return this.customerWrite.update(data.id, data.organizationId, data.dto, data.actorId, data.caller);
  }

  @MessagePattern(pattern(deleteCustomer))
  async remove(@Payload() data: RpcRequest<typeof deleteCustomer>) {
    return this.customersService.remove(data.id, data.organizationId, data.caller);
  }

  // ── CRM activity timeline ──
  // ── Contact people ─────────────────────────────────────────────────────────
  @MessagePattern(pattern(listCustomerContacts))
  listContacts(@Payload() d: RpcRequest<typeof listCustomerContacts>) {
    return this.contacts.listContacts(d);
  }

  @MessagePattern(pattern(listCustomerContactCompanies))
  listContactCompanies(@Payload() d: RpcRequest<typeof listCustomerContactCompanies>) {
    return this.contacts.listContactCompanies(d);
  }

  @MessagePattern(pattern(addCustomerContact))
  addContact(@Payload() d: RpcRequest<typeof addCustomerContact>) {
    return this.contacts.addContact(d);
  }

  @MessagePattern(pattern(updateCustomerContact))
  updateContact(@Payload() d: RpcRequest<typeof updateCustomerContact>) {
    return this.contacts.updateContact(d);
  }

  @MessagePattern(pattern(removeCustomerContact))
  removeContact(@Payload() d: RpcRequest<typeof removeCustomerContact>) {
    return this.contacts.removeContact(d);
  }

  @MessagePattern(pattern(promoteCustomerContact))
  promoteContact(@Payload() d: RpcRequest<typeof promoteCustomerContact>) {
    return this.contacts.promoteContact(d);
  }

  @MessagePattern(pattern(customersDue))
  async due(@Payload() data: RpcRequest<typeof customersDue>) {
    return this.dueCard.due(data);
  }

  @MessagePattern(pattern(listCustomerActivities))
  async listActivities(@Payload() data: RpcRequest<typeof listCustomerActivities>) {
    return this.activities.listActivities(data);
  }

  @MessagePattern(pattern(addCustomerActivity))
  async addActivity(@Payload() data: RpcRequest<typeof addCustomerActivity>) {
    return this.activities.addActivity(data);
  }

  @MessagePattern(pattern(updateCustomerActivity))
  async updateActivity(@Payload() data: RpcRequest<typeof updateCustomerActivity>) {
    return this.activities.updateActivity(data);
  }

  @MessagePattern(pattern(deleteCustomerActivity))
  async deleteActivity(@Payload() data: RpcRequest<typeof deleteCustomerActivity>) {
    return this.activities.deleteActivity(data);
  }
}
