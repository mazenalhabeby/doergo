import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CrmService } from './crm.service';

// Read-only RPC handlers (writes go through the BullMQ processor).
@Controller()
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @MessagePattern({ cmd: 'crm_get_sales_board' })
  getSalesBoard(@Payload() d: any) { return this.crm.getSalesBoard(d); }

  @MessagePattern({ cmd: 'crm_get_forecast' })
  getForecast(@Payload() d: any) { return this.crm.getForecast(d); }

  @MessagePattern({ cmd: 'crm_list_contacts' })
  listContacts(@Payload() d: any) { return this.crm.listContacts(d); }

  @MessagePattern({ cmd: 'crm_get_contact' })
  getContact(@Payload() d: any) { return this.crm.getContact(d); }

  @MessagePattern({ cmd: 'crm_list_commission_rules' })
  listCommissionRules(@Payload() d: any) { return this.crm.listCommissionRules(d); }

  @MessagePattern({ cmd: 'crm_list_commission_entries' })
  listCommissionEntries(@Payload() d: any) { return this.crm.listCommissionEntries(d); }
}
