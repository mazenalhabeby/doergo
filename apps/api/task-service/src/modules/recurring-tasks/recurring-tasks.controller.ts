import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RecurringTasksService } from './recurring-tasks.service';

/**
 * Microservice Controller for Recurring Task Template Operations
 *
 * Handles direct Redis microservice calls for recurring task CRUD + generation.
 */
@Controller()
export class RecurringTasksController {
  constructor(private readonly recurringTasksService: RecurringTasksService) {}

  @MessagePattern({ cmd: 'find_all_recurring_tasks' })
  async findAll(@Payload() data: { organizationId: string }) {
    return this.recurringTasksService.findAll(data);
  }

  @MessagePattern({ cmd: 'create_recurring_task' })
  async create(@Payload() data: any) {
    return this.recurringTasksService.create(data);
  }

  @MessagePattern({ cmd: 'update_recurring_task' })
  async update(@Payload() data: any) {
    return this.recurringTasksService.update(data);
  }

  @MessagePattern({ cmd: 'delete_recurring_task' })
  async remove(@Payload() data: { id: string; organizationId: string }) {
    return this.recurringTasksService.remove(data);
  }

  @MessagePattern({ cmd: 'generate_recurring_task' })
  async generate(@Payload() data: { id: string; organizationId: string; userId: string }) {
    return this.recurringTasksService.generate(data);
  }
}
