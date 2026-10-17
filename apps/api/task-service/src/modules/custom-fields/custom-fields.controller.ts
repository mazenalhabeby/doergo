import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  pattern,
  createCustomField,
  deleteCustomField,
  findAllCustomFields,
  getTaskCustomFields,
  setTaskCustomFields,
  updateCustomField,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
import { CustomFieldsService } from './custom-fields.service';
import { CustomFieldValuesService } from './custom-field-values.service';

/**
 * Microservice Controller for Custom Field Operations
 *
 * Handles direct Redis microservice calls for custom field CRUD.
 */
@Controller()
export class CustomFieldsController {
  constructor(
    private readonly customFieldsService: CustomFieldsService,
    private readonly fieldValues: CustomFieldValuesService,
  ) {}

  @MessagePattern(pattern(findAllCustomFields))
  async findAll(@Payload() data: RpcRequest<typeof findAllCustomFields>) {
    return this.customFieldsService.findAll(data);
  }

  @MessagePattern(pattern(createCustomField))
  async create(@Payload() data: RpcRequest<typeof createCustomField>) {
    return this.customFieldsService.create(data);
  }

  @MessagePattern(pattern(updateCustomField))
  async update(@Payload() data: RpcRequest<typeof updateCustomField>) {
    return this.customFieldsService.update(data);
  }

  @MessagePattern(pattern(deleteCustomField))
  async remove(@Payload() data: RpcRequest<typeof deleteCustomField>) {
    return this.customFieldsService.remove(data);
  }

  @MessagePattern(pattern(getTaskCustomFields))
  async getTaskValues(@Payload() data: RpcRequest<typeof getTaskCustomFields>) {
    return this.customFieldsService.getTaskValues(data);
  }

  @MessagePattern(pattern(setTaskCustomFields))
  async setTaskValues(@Payload() data: RpcRequest<typeof setTaskCustomFields>) {
    return this.fieldValues.setTaskValues(data);
  }
}
