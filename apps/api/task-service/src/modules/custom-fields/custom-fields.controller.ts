import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CustomFieldsService } from './custom-fields.service';

/**
 * Microservice Controller for Custom Field Operations
 *
 * Handles direct Redis microservice calls for custom field CRUD.
 */
@Controller()
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @MessagePattern({ cmd: 'find_all_custom_fields' })
  async findAll(@Payload() data: { organizationId: string; forWorkflow?: string }) {
    return this.customFieldsService.findAll(data);
  }

  @MessagePattern({ cmd: 'create_custom_field' })
  async create(@Payload() data: any) {
    return this.customFieldsService.create(data);
  }

  @MessagePattern({ cmd: 'update_custom_field' })
  async update(@Payload() data: any) {
    return this.customFieldsService.update(data);
  }

  @MessagePattern({ cmd: 'delete_custom_field' })
  async remove(@Payload() data: { id: string; organizationId: string }) {
    return this.customFieldsService.remove(data);
  }

  @MessagePattern({ cmd: 'get_task_custom_fields' })
  async getTaskValues(@Payload() data: { taskId: string; organizationId: string }) {
    return this.customFieldsService.getTaskValues(data);
  }

  @MessagePattern({ cmd: 'set_task_custom_fields' })
  async setTaskValues(@Payload() data: { taskId: string; organizationId: string; values: any[] }) {
    return this.customFieldsService.setTaskValues(data);
  }
}
