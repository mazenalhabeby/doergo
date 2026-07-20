import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CustomersService, CustomerInput } from './customers.service';

@Controller()
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @MessagePattern({ cmd: 'list_customers' })
  async list(@Payload() data: { organizationId: string; search?: string; status?: 'active' | 'inactive' | 'all'; page?: number; limit?: number }) {
    return this.customersService.list(data);
  }

  @MessagePattern({ cmd: 'get_customer' })
  async get(@Payload() data: { id: string; organizationId: string }) {
    return this.customersService.get(data.id, data.organizationId);
  }

  @MessagePattern({ cmd: 'create_customer' })
  async create(@Payload() data: { organizationId: string; dto: CustomerInput }) {
    return this.customersService.create(data.organizationId, data.dto);
  }

  @MessagePattern({ cmd: 'update_customer' })
  async update(@Payload() data: { id: string; organizationId: string; dto: CustomerInput }) {
    return this.customersService.update(data.id, data.organizationId, data.dto);
  }

  @MessagePattern({ cmd: 'delete_customer' })
  async remove(@Payload() data: { id: string; organizationId: string }) {
    return this.customersService.remove(data.id, data.organizationId);
  }
}
