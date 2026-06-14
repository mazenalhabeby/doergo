import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { InvoiceService } from './invoice.service';

@Controller()
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @MessagePattern({ cmd: 'invoice_create' })
  async create(@Payload() data: any) {
    return this.invoiceService.create(data);
  }

  @MessagePattern({ cmd: 'invoice_list' })
  async findAll(@Payload() data: any) {
    return this.invoiceService.findAll(data);
  }

  @MessagePattern({ cmd: 'invoice_get' })
  async findOne(@Payload() data: { id: string; organizationId: string }) {
    return this.invoiceService.findOne(data.id, data.organizationId);
  }

  @MessagePattern({ cmd: 'invoice_update' })
  async update(@Payload() data: { id: string; organizationId: string; [key: string]: any }) {
    const { id, organizationId, ...updateData } = data;
    return this.invoiceService.update(id, organizationId, updateData);
  }

  @MessagePattern({ cmd: 'invoice_update_status' })
  async updateStatus(@Payload() data: { id: string; organizationId: string; status: string }) {
    return this.invoiceService.updateStatus(data.id, data.organizationId, data.status);
  }

  @MessagePattern({ cmd: 'invoice_delete' })
  async delete(@Payload() data: { id: string; organizationId: string }) {
    return this.invoiceService.delete(data.id, data.organizationId);
  }

  @MessagePattern({ cmd: 'invoice_add_item' })
  async addItem(@Payload() data: { invoiceId: string; organizationId: string; item: any }) {
    return this.invoiceService.addItem(data.invoiceId, data.organizationId, data.item);
  }

  @MessagePattern({ cmd: 'invoice_remove_item' })
  async removeItem(@Payload() data: { invoiceId: string; itemId: string; organizationId: string }) {
    return this.invoiceService.removeItem(data.invoiceId, data.itemId, data.organizationId);
  }
}
