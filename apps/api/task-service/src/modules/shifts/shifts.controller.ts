import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ShiftsService } from './shifts.service';

@Controller()
export class ShiftsController {
  constructor(private readonly service: ShiftsService) {}

  // Shifts
  @MessagePattern({ cmd: 'list_shifts' })
  listShifts(@Payload() data: { organizationId: string; spaceId?: string }) {
    return this.service.listShifts(data);
  }

  @MessagePattern({ cmd: 'create_shift' })
  createShift(@Payload() data: any) {
    return this.service.createShift(data);
  }

  @MessagePattern({ cmd: 'update_shift' })
  updateShift(@Payload() data: any) {
    return this.service.updateShift(data);
  }

  @MessagePattern({ cmd: 'delete_shift' })
  deleteShift(@Payload() data: { organizationId: string; shiftId: string }) {
    return this.service.deleteShift(data);
  }

  // Rota (assignments)
  @MessagePattern({ cmd: 'list_shift_assignments' })
  listAssignments(@Payload() data: { organizationId: string; spaceId: string; includeEnded?: boolean }) {
    return this.service.listAssignments(data);
  }

  @MessagePattern({ cmd: 'create_shift_assignment' })
  createAssignment(@Payload() data: any) {
    return this.service.createAssignment(data);
  }

  @MessagePattern({ cmd: 'update_shift_assignment' })
  updateAssignment(@Payload() data: any) {
    return this.service.updateAssignment(data);
  }

  @MessagePattern({ cmd: 'delete_shift_assignment' })
  deleteAssignment(@Payload() data: { organizationId: string; assignmentId: string }) {
    return this.service.deleteAssignment(data);
  }
}
