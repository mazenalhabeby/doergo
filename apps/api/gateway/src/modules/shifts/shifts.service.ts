import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

@Injectable()
export class ShiftsService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, ShiftsService.name);
  }

  // Shifts
  listShifts(data: { organizationId: string; spaceId?: string }) {
    return this.send({ cmd: 'list_shifts' }, data);
  }
  createShift(data: Record<string, any>) {
    return this.send({ cmd: 'create_shift' }, data);
  }
  updateShift(data: Record<string, any>) {
    return this.send({ cmd: 'update_shift' }, data);
  }
  deleteShift(data: { organizationId: string; shiftId: string }) {
    return this.send({ cmd: 'delete_shift' }, data);
  }

  // Rota
  listAssignments(data: { organizationId: string; spaceId: string; includeEnded?: boolean }) {
    return this.send({ cmd: 'list_shift_assignments' }, data);
  }
  createAssignment(data: Record<string, any>) {
    return this.send({ cmd: 'create_shift_assignment' }, data);
  }
  updateAssignment(data: Record<string, any>) {
    return this.send({ cmd: 'update_shift_assignment' }, data);
  }
  deleteAssignment(data: { organizationId: string; assignmentId: string }) {
    return this.send({ cmd: 'delete_shift_assignment' }, data);
  }
}
