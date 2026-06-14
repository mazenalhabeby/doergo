import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SprintsService } from './sprints.service';

/**
 * Microservice Controller for Sprint Operations
 *
 * Handles direct Redis microservice calls for sprint CRUD.
 * Sprints are simple entities that don't require BullMQ processing.
 */
@Controller()
export class SprintsController {
  constructor(private readonly sprintsService: SprintsService) {}

  @MessagePattern({ cmd: 'find_all_sprints' })
  async findAll(@Payload() data: { organizationId: string; status?: string }) {
    return this.sprintsService.findAll(data);
  }

  @MessagePattern({ cmd: 'find_sprint' })
  async findOne(@Payload() data: { id: string; organizationId: string }) {
    return this.sprintsService.findOne(data);
  }

  @MessagePattern({ cmd: 'create_sprint' })
  async create(@Payload() data: any) {
    return this.sprintsService.create(data);
  }

  @MessagePattern({ cmd: 'update_sprint' })
  async update(@Payload() data: any) {
    return this.sprintsService.update(data);
  }

  @MessagePattern({ cmd: 'start_sprint' })
  async start(@Payload() data: { id: string; organizationId: string }) {
    return this.sprintsService.start(data);
  }

  @MessagePattern({ cmd: 'complete_sprint' })
  async complete(@Payload() data: { id: string; organizationId: string }) {
    return this.sprintsService.complete(data);
  }

  @MessagePattern({ cmd: 'delete_sprint' })
  async remove(@Payload() data: { id: string; organizationId: string }) {
    return this.sprintsService.remove(data);
  }

  @MessagePattern({ cmd: 'get_sprint_report' })
  async getReport(@Payload() data: { id: string; organizationId: string }) {
    return this.sprintsService.getReport(data);
  }

  @MessagePattern({ cmd: 'get_velocity' })
  async getVelocity(@Payload() data: { organizationId: string; limit?: number }) {
    return this.sprintsService.getVelocity(data);
  }
}
