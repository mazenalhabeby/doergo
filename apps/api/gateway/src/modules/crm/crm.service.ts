import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

// READ operations — Redis RPC to task-service. Writes go through CrmQueueService.
@Injectable()
export class CrmService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, CrmService.name);
  }

  listPipelines(d: any) { return this.send({ cmd: 'crm_list_pipelines' }, d); }
  getBoard(d: any) { return this.send({ cmd: 'crm_get_board' }, d); }

  listContacts(d: any) { return this.send({ cmd: 'crm_list_contacts' }, d); }
  getContact(d: any) { return this.send({ cmd: 'crm_get_contact' }, d); }

  listLeads(d: any) { return this.send({ cmd: 'crm_list_leads' }, d); }
  getLead(d: any) { return this.send({ cmd: 'crm_get_lead' }, d); }

  listDeals(d: any) { return this.send({ cmd: 'crm_list_deals' }, d); }
  getDeal(d: any) { return this.send({ cmd: 'crm_get_deal' }, d); }
  getForecast(d: any) { return this.send({ cmd: 'crm_get_forecast' }, d); }

  listActivities(d: any) { return this.send({ cmd: 'crm_list_activities' }, d); }

  listQuotes(d: any) { return this.send({ cmd: 'crm_list_quotes' }, d); }
  getQuote(d: any) { return this.send({ cmd: 'crm_get_quote' }, d); }

  listCommissionRules(d: any) { return this.send({ cmd: 'crm_list_commission_rules' }, d); }
  listCommissionEntries(d: any) { return this.send({ cmd: 'crm_list_commission_entries' }, d); }
}
