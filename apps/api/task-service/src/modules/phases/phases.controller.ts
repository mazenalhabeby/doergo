import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PhasesService } from './phases.service';

/**
 * Microservice Controller for Phase Operations
 *
 * Handles direct Redis microservice calls for phase CRUD.
 * Phases are simple entities that don't require BullMQ processing.
 */
@Controller()
export class PhasesController {
  constructor(private readonly phasesService: PhasesService) {}

  @MessagePattern({ cmd: 'find_all_phases' })
  async findAll(@Payload() data: { organizationId: string }) {
    return this.phasesService.findAll(data);
  }

  @MessagePattern({ cmd: 'create_phase' })
  async create(@Payload() data: any) {
    return this.phasesService.create(data);
  }

  @MessagePattern({ cmd: 'update_phase' })
  async update(@Payload() data: any) {
    return this.phasesService.update(data);
  }

  @MessagePattern({ cmd: 'delete_phase' })
  async remove(@Payload() data: { id: string; organizationId: string }) {
    return this.phasesService.remove(data);
  }
}
