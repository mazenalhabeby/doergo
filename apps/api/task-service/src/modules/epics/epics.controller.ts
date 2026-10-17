import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  pattern,
  createEpic,
  deleteEpic,
  findAllEpics,
  findEpic,
  updateEpic,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
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

  @MessagePattern(pattern(findAllEpics))
  async findAll(@Payload() data: RpcRequest<typeof findAllEpics>) {
    return this.epicsService.findAll(data);
  }

  @MessagePattern(pattern(findEpic))
  async findOne(@Payload() data: RpcRequest<typeof findEpic>) {
    return this.epicsService.findOne(data);
  }

  @MessagePattern(pattern(createEpic))
  async create(@Payload() data: RpcRequest<typeof createEpic>) {
    return this.epicsService.create(data);
  }

  @MessagePattern(pattern(updateEpic))
  async update(@Payload() data: RpcRequest<typeof updateEpic>) {
    return this.epicsService.update(data);
  }

  @MessagePattern(pattern(deleteEpic))
  async remove(@Payload() data: RpcRequest<typeof deleteEpic>) {
    return this.epicsService.remove(data);
  }
}
