import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

// READ operations — Redis RPC to task-service. Writes go through CrmQueueService.
// Deals/pipeline/leads are Tasks now (see the tasks module); CRM only owns
// contacts, commissions, and the sales-board read (deal-type tasks + forecast).
@Injectable()
export class CrmService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, CrmService.name);
  }

  getSalesBoard(d: any) { return this.send({ cmd: 'crm_get_sales_board' }, d); }
  getForecast(d: any) { return this.send({ cmd: 'crm_get_forecast' }, d); }

  listContacts(d: any) { return this.send({ cmd: 'crm_list_contacts' }, d); }
  getContact(d: any) { return this.send({ cmd: 'crm_get_contact' }, d); }

  listCommissionRules(d: any) { return this.send({ cmd: 'crm_list_commission_rules' }, d); }
  listCommissionEntries(d: any) { return this.send({ cmd: 'crm_list_commission_entries' }, d); }
}
