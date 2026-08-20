import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { EpicsService } from './epics.service';

/**
 * Microservice Controller for Epic Operations
 *
 * Handles direct Redis microservice calls for epic CRUD.
 * Epics are simple entities that don't require BullMQ processing.
 */
@Controller()
export class EpicsController {
  constructor(private readonly epicsService: EpicsService) {}

  @MessagePattern({ cmd: 'find_all_epics' })
  async findAll(@Payload() data: { organizationId: string }) {
    return this.epicsService.findAll(data);
  }

  @MessagePattern({ cmd: 'find_epic' })
  async findOne(@Payload() data: { id: string; organizationId: string }) {
    return this.epicsService.findOne(data);
  }

  @MessagePattern({ cmd: 'create_epic' })
  async create(@Payload() data: any) {
    return this.epicsService.create(data);
  }

  @MessagePattern({ cmd: 'update_epic' })
  async update(@Payload() data: any) {
    return this.epicsService.update(data);
  }

  @MessagePattern({ cmd: 'delete_epic' })
  async remove(@Payload() data: { id: string; organizationId: string }) {
    return this.epicsService.remove(data);
  }
}
