import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { InvoiceService } from './invoice.service';
import { StatementService } from './statement.service';
import { InvoiceCreateService } from './invoice-create.service';
import { InvoiceEditService } from './invoice-edit.service';
import { InvoiceItemsService } from './invoice-items.service';
import { InvoiceGatherService } from './invoice-gather.service';

import {
  pattern,
  memberStatement,
  invoiceCreate,
  invoiceList,
  invoiceGather,
  invoiceExchangeRate,
  invoiceGet,
  invoiceUpdate,
  invoiceUpdateStatus,
  invoiceDelete,
  invoiceAddItem,
  invoiceRemoveItem,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
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
  @MessagePattern(pattern(memberStatement))
  async memberStatement(@Payload() data: RpcRequest<typeof memberStatement>) {
    return this.statementService.forMember(data);
  }

  @MessagePattern(pattern(invoiceCreate))
  async create(@Payload() data: RpcRequest<typeof invoiceCreate>) {
    return this.invoiceCreate.create(data);
  }

  @MessagePattern(pattern(invoiceList))
  async findAll(@Payload() data: RpcRequest<typeof invoiceList>) {
    return this.invoiceService.findAll(data);
  }

  @MessagePattern(pattern(invoiceGather))
  async gather(@Payload() data: RpcRequest<typeof invoiceGather>) {
    return this.invoiceGather.gather(data);
  }

  @MessagePattern(pattern(invoiceExchangeRate))
  async exchangeRate(@Payload() data: RpcRequest<typeof invoiceExchangeRate>) {
    return this.invoiceService.exchangeRate(data);
  }

  @MessagePattern(pattern(invoiceGet))
  async findOne(@Payload() data: RpcRequest<typeof invoiceGet>) {
    return this.invoiceService.findOne(data.id, data.organizationId);
  }

  @MessagePattern(pattern(invoiceUpdate))
  async update(@Payload() data: RpcRequest<typeof invoiceUpdate>) {
    const { id, organizationId, ...updateData } = data;
    return this.invoiceEdit.update(id, organizationId, updateData);
  }

  @MessagePattern(pattern(invoiceUpdateStatus))
  async updateStatus(@Payload() data: RpcRequest<typeof invoiceUpdateStatus>) {
    return this.invoiceEdit.updateStatus(data.id, data.organizationId, data.status);
  }

  @MessagePattern(pattern(invoiceDelete))
  async delete(@Payload() data: RpcRequest<typeof invoiceDelete>) {
    return this.invoiceService.delete(data.id, data.organizationId);
  }

  @MessagePattern(pattern(invoiceAddItem))
  async addItem(@Payload() data: RpcRequest<typeof invoiceAddItem>) {
    return this.invoiceItems.addItem(data.invoiceId, data.organizationId, data.item);
  }

  @MessagePattern(pattern(invoiceRemoveItem))
  async removeItem(@Payload() data: RpcRequest<typeof invoiceRemoveItem>) {
    return this.invoiceItems.removeItem(data.invoiceId, data.itemId, data.organizationId);
  }
}
