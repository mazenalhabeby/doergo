import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { InvoiceService } from './invoice.service';
import { StatementService } from './statement.service';
import { InvoiceCreateService } from './invoice-create.service';
import { InvoiceEditService } from './invoice-edit.service';
import { InvoiceItemsService } from './invoice-items.service';
import { InvoiceGatherService } from './invoice-gather.service';

@Controller()
export class InvoiceController {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly statementService: StatementService,
    private readonly invoiceCreate: InvoiceCreateService,
    private readonly invoiceEdit: InvoiceEditService,
    private readonly invoiceItems: InvoiceItemsService,
    private readonly invoiceGather: InvoiceGatherService,
  ) {}

  /** A worker's statement: their hours at their rate with us. Read-only. */
  @MessagePattern({ cmd: 'member_statement' })
  async memberStatement(@Payload() data: { organizationId: string; memberId: string; from?: string; to?: string }) {
    return this.statementService.forMember(data);
  }

  @MessagePattern({ cmd: 'invoice_create' })
  async create(@Payload() data: any) {
    return this.invoiceCreate.create(data);
  }

  @MessagePattern({ cmd: 'invoice_list' })
  async findAll(@Payload() data: any) {
    return this.invoiceService.findAll(data);
  }

  @MessagePattern({ cmd: 'invoice_gather' })
  async gather(@Payload() data: { organizationId: string; spaceId: string }) {
    return this.invoiceGather.gather(data);
  }

  @MessagePattern({ cmd: 'invoice_exchange_rate' })
  async exchangeRate(@Payload() data: { organizationId: string; currency: string; date?: string }) {
    return this.invoiceService.exchangeRate(data);
  }

  @MessagePattern({ cmd: 'invoice_get' })
  async findOne(@Payload() data: { id: string; organizationId: string }) {
    return this.invoiceService.findOne(data.id, data.organizationId);
  }

  @MessagePattern({ cmd: 'invoice_update' })
  async update(@Payload() data: { id: string; organizationId: string; [key: string]: any }) {
    const { id, organizationId, ...updateData } = data;
    return this.invoiceEdit.update(id, organizationId, updateData);
  }

  @MessagePattern({ cmd: 'invoice_update_status' })
  async updateStatus(@Payload() data: { id: string; organizationId: string; status: string }) {
    return this.invoiceEdit.updateStatus(data.id, data.organizationId, data.status);
  }

  @MessagePattern({ cmd: 'invoice_delete' })
  async delete(@Payload() data: { id: string; organizationId: string }) {
    return this.invoiceService.delete(data.id, data.organizationId);
  }

  @MessagePattern({ cmd: 'invoice_add_item' })
  async addItem(@Payload() data: { invoiceId: string; organizationId: string; item: any }) {
    return this.invoiceItems.addItem(data.invoiceId, data.organizationId, data.item);
  }

  @MessagePattern({ cmd: 'invoice_remove_item' })
  async removeItem(@Payload() data: { invoiceId: string; itemId: string; organizationId: string }) {
    return this.invoiceItems.removeItem(data.invoiceId, data.itemId, data.organizationId);
  }
}
