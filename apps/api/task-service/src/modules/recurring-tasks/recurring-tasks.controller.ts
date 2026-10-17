import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RecurringTasksService } from './recurring-tasks.service';
import { RecurringRunnerService } from './recurring-runner.service';
import {
  pattern,
  type RpcRequest,
  findAllRecurringTasks,
  createRecurringTask,
  updateRecurringTask,
  deleteRecurringTask,
  generateRecurringTask,
} from '@hbcfield/shared/microservices';

/**
 * Microservice Controller for Recurring Task Template Operations
 *
 * Handles direct Redis microservice calls for recurring task CRUD + generation.
 */
@Controller()
export class RecurringTasksController {
  constructor(
    private readonly recurringTasksService: RecurringTasksService,
    private readonly runner: RecurringRunnerService,
  ) {}

  @MessagePattern(pattern(findAllRecurringTasks))
  async findAll(@Payload() data: RpcRequest<typeof findAllRecurringTasks>) {
    return this.recurringTasksService.findAll(data);
  }

  @MessagePattern(pattern(createRecurringTask))
  async create(@Payload() data: RpcRequest<typeof createRecurringTask>) {
    return this.recurringTasksService.create(data);
  }

  @MessagePattern(pattern(updateRecurringTask))
  async update(@Payload() data: RpcRequest<typeof updateRecurringTask>) {
    return this.recurringTasksService.update(data);
  }

  @MessagePattern(pattern(deleteRecurringTask))
  async remove(@Payload() data: RpcRequest<typeof deleteRecurringTask>) {
    return this.recurringTasksService.remove(data);
  }

  @MessagePattern(pattern(generateRecurringTask))
  async generate(@Payload() data: RpcRequest<typeof generateRecurringTask>) {
    return this.runner.generate(data);
  }
}
