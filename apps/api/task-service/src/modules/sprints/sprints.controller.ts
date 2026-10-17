import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  pattern,
  completeSprint,
  createSprint,
  deleteSprint,
  findAllSprints,
  findSprint,
  getSprintReport,
  getVelocity,
  startSprint,
  updateSprint,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
import { SprintsService } from './sprints.service';
import { SprintReportsService } from './sprint-reports.service';

/**
 * Microservice Controller for Sprint Operations
 *
 * Handles direct Redis microservice calls for sprint CRUD.
 * Sprints are simple entities that don't require BullMQ processing.
 */
@Controller()
export class SprintsController {
  constructor(
    private readonly sprintsService: SprintsService,
    private readonly sprintReports: SprintReportsService,
  ) {}

  @MessagePattern(pattern(findAllSprints))
  async findAll(@Payload() data: RpcRequest<typeof findAllSprints>) {
    return this.sprintsService.findAll(data);
  }

  @MessagePattern(pattern(findSprint))
  async findOne(@Payload() data: RpcRequest<typeof findSprint>) {
    return this.sprintsService.findOne(data);
  }

  @MessagePattern(pattern(createSprint))
  async create(@Payload() data: RpcRequest<typeof createSprint>) {
    return this.sprintsService.create(data);
  }

  @MessagePattern(pattern(updateSprint))
  async update(@Payload() data: RpcRequest<typeof updateSprint>) {
    return this.sprintsService.update(data);
  }

  @MessagePattern(pattern(startSprint))
  async start(@Payload() data: RpcRequest<typeof startSprint>) {
    return this.sprintsService.start(data);
  }

  @MessagePattern(pattern(completeSprint))
  async complete(@Payload() data: RpcRequest<typeof completeSprint>) {
    return this.sprintsService.complete(data);
  }

  @MessagePattern(pattern(deleteSprint))
  async remove(@Payload() data: RpcRequest<typeof deleteSprint>) {
    return this.sprintsService.remove(data);
  }

  @MessagePattern(pattern(getSprintReport))
  async getReport(@Payload() data: RpcRequest<typeof getSprintReport>) {
    return this.sprintReports.getReport(data);
  }

  @MessagePattern(pattern(getVelocity))
  async getVelocity(@Payload() data: RpcRequest<typeof getVelocity>) {
    return this.sprintReports.getVelocity(data);
  }
}
