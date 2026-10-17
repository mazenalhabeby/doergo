import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  pattern,
  createPhase,
  deletePhase,
  findAllPhases,
  findPhase,
  updatePhase,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
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

  @MessagePattern(pattern(findAllPhases))
  async findAll(@Payload() data: RpcRequest<typeof findAllPhases>) {
    return this.phasesService.findAll(data);
  }

  @MessagePattern(pattern(findPhase))
  async findOne(@Payload() data: RpcRequest<typeof findPhase>) {
    return this.phasesService.findOne(data);
  }

  @MessagePattern(pattern(createPhase))
  async create(@Payload() data: RpcRequest<typeof createPhase>) {
    return this.phasesService.create(data);
  }

  @MessagePattern(pattern(updatePhase))
  async update(@Payload() data: RpcRequest<typeof updatePhase>) {
    return this.phasesService.update(data);
  }

  @MessagePattern(pattern(deletePhase))
  async remove(@Payload() data: RpcRequest<typeof deletePhase>) {
    return this.phasesService.remove(data);
  }
}
