import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CustomersService, CustomerInput, CrmCaller } from './customers.service';
import { ContactImportService } from './contact-import.service';
import { CustomerWriteService } from './customer-write.service';
import { CustomerContactsService } from './customer-contacts.service';
import { CustomerActivitiesService } from './customer-activities.service';
import { CustomerDueService } from './customer-due.service';

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
  @MessagePattern({ cmd: 'customer_match_keys' })
  matchKeys(@Payload() d: { organizationId: string; caller?: CrmCaller }) {
    return this.contactImport.matchKeys(d);
  }

  @MessagePattern({ cmd: 'import_customer_contacts' })
  importContacts(@Payload() d: { organizationId: string; body: unknown; caller?: CrmCaller }) {
    return this.contactImport.import(d);
  }

  @MessagePattern({ cmd: 'list_customers' })
  async list(
    @Payload()
    data: {
      organizationId: string;
      search?: string;
      status?: 'active' | 'inactive' | 'all';
      portalResident?: boolean;
      portalId?: string;
      spaceId?: string;
      page?: number;
      limit?: number;
      caller?: CrmCaller;
    },
  ) {
    return this.customersService.list(data);
  }

  @MessagePattern({ cmd: 'get_customer' })
  async get(@Payload() data: { id: string; organizationId: string; caller?: CrmCaller }) {
    return this.customersService.get(data.id, data.organizationId, data.caller);
  }

  @MessagePattern({ cmd: 'create_customer' })
  async create(@Payload() data: { organizationId: string; dto: CustomerInput; caller?: CrmCaller }) {
    return this.customerWrite.create(data.organizationId, data.dto, data.caller);
  }

  @MessagePattern({ cmd: 'update_customer' })
  async update(
    @Payload() data: { id: string; organizationId: string; dto: CustomerInput; actorId?: string; caller?: CrmCaller },
  ) {
    return this.customerWrite.update(data.id, data.organizationId, data.dto, data.actorId, data.caller);
  }

  @MessagePattern({ cmd: 'delete_customer' })
  async remove(@Payload() data: { id: string; organizationId: string; caller?: CrmCaller }) {
    return this.customersService.remove(data.id, data.organizationId, data.caller);
  }

  // ── CRM activity timeline ──
  // ── Contact people ─────────────────────────────────────────────────────────
  @MessagePattern({ cmd: 'list_customer_contacts' })
  listContacts(@Payload() d: any) {
    return this.contacts.listContacts(d);
  }

  @MessagePattern({ cmd: 'list_customer_contact_companies' })
  listContactCompanies(@Payload() d: any) {
    return this.contacts.listContactCompanies(d);
  }

  @MessagePattern({ cmd: 'add_customer_contact' })
  addContact(@Payload() d: any) {
    return this.contacts.addContact(d);
  }

  @MessagePattern({ cmd: 'update_customer_contact' })
  updateContact(@Payload() d: any) {
    return this.contacts.updateContact(d);
  }

  @MessagePattern({ cmd: 'remove_customer_contact' })
  removeContact(@Payload() d: any) {
    return this.contacts.removeContact(d);
  }

  @MessagePattern({ cmd: 'promote_customer_contact' })
  promoteContact(@Payload() d: any) {
    return this.contacts.promoteContact(d);
  }

  @MessagePattern({ cmd: 'customers_due' })
  async due(@Payload() data: any) {
    return this.dueCard.due(data);
  }

  @MessagePattern({ cmd: 'list_customer_activities' })
  async listActivities(@Payload() data: { customerId: string; organizationId: string }) {
    return this.activities.listActivities(data);
  }

  @MessagePattern({ cmd: 'add_customer_activity' })
  async addActivity(@Payload() data: any) {
    return this.activities.addActivity(data);
  }

  @MessagePattern({ cmd: 'update_customer_activity' })
  async updateActivity(@Payload() data: any) {
    return this.activities.updateActivity(data);
  }

  @MessagePattern({ cmd: 'delete_customer_activity' })
  async deleteActivity(@Payload() data: { id: string; customerId: string; organizationId: string }) {
    return this.activities.deleteActivity(data);
  }
}
