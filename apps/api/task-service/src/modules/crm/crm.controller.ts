import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CrmService } from './crm.service';

// Read-only RPC handlers (writes go through the BullMQ processor).
@Controller()
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @MessagePattern({ cmd: 'crm_list_pipelines' })
  listPipelines(@Payload() d: any) { return this.crm.listPipelines(d); }

  @MessagePattern({ cmd: 'crm_get_board' })
  getBoard(@Payload() d: any) { return this.crm.getBoard(d); }

  @MessagePattern({ cmd: 'crm_list_contacts' })
  listContacts(@Payload() d: any) { return this.crm.listContacts(d); }

  @MessagePattern({ cmd: 'crm_get_contact' })
  getContact(@Payload() d: any) { return this.crm.getContact(d); }

  @MessagePattern({ cmd: 'crm_list_leads' })
  listLeads(@Payload() d: any) { return this.crm.listLeads(d); }

  @MessagePattern({ cmd: 'crm_get_lead' })
  getLead(@Payload() d: any) { return this.crm.getLead(d); }

  @MessagePattern({ cmd: 'crm_list_deals' })
  listDeals(@Payload() d: any) { return this.crm.listDeals(d); }

  @MessagePattern({ cmd: 'crm_get_deal' })
  getDeal(@Payload() d: any) { return this.crm.getDeal(d); }

  @MessagePattern({ cmd: 'crm_get_forecast' })
  getForecast(@Payload() d: any) { return this.crm.getForecast(d); }

  @MessagePattern({ cmd: 'crm_list_activities' })
  listActivities(@Payload() d: any) { return this.crm.listActivities(d); }

  @MessagePattern({ cmd: 'crm_list_quotes' })
  listQuotes(@Payload() d: any) { return this.crm.listQuotes(d); }

  @MessagePattern({ cmd: 'crm_get_quote' })
  getQuote(@Payload() d: any) { return this.crm.getQuote(d); }

  @MessagePattern({ cmd: 'crm_list_commission_rules' })
  listCommissionRules(@Payload() d: any) { return this.crm.listCommissionRules(d); }

  @MessagePattern({ cmd: 'crm_list_commission_entries' })
  listCommissionEntries(@Payload() d: any) { return this.crm.listCommissionEntries(d); }
}
