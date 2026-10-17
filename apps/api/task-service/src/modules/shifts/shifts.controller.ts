import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ShiftsService } from './shifts.service';
import { ShiftAssignmentsService } from './shift-assignments.service';
import { RotaService } from './rota.service';
import {
  pattern,
  type RpcRequest,
  listShifts,
  createShift,
  updateShift,
  deleteShift,
  weekRota,
  setRotaDay,
  listShiftAssignments,
  createShiftAssignment,
  updateShiftAssignment,
  deleteShiftAssignment,
} from '@hbcfield/shared/microservices';

@Controller()
export class ShiftsController {
  constructor(
    private readonly service: ShiftsService,
    private readonly rota: RotaService,
    private readonly shiftAssignments: ShiftAssignmentsService,
  ) {}

  // Shifts
  @MessagePattern(pattern(listShifts))
  listShifts(@Payload() data: RpcRequest<typeof listShifts>) {
    return this.service.listShifts(data);
  }

  @MessagePattern(pattern(createShift))
  createShift(@Payload() data: RpcRequest<typeof createShift>) {
    return this.service.createShift(data);
  }

  @MessagePattern(pattern(updateShift))
  updateShift(@Payload() data: RpcRequest<typeof updateShift>) {
    return this.service.updateShift(data);
  }

  @MessagePattern(pattern(deleteShift))
  deleteShift(@Payload() data: RpcRequest<typeof deleteShift>) {
    return this.service.deleteShift(data);
  }

  // The week as the clock-in reads it, and changing one day of it
  @MessagePattern(pattern(weekRota))
  weekRota(@Payload() data: RpcRequest<typeof weekRota>) {
    return this.rota.weekRota(data);
  }

  @MessagePattern(pattern(setRotaDay))
  setRotaDay(@Payload() data: RpcRequest<typeof setRotaDay>) {
    return this.rota.setRotaDay(data);
  }

  // Rota (assignments)
  @MessagePattern(pattern(listShiftAssignments))
  listAssignments(@Payload() data: RpcRequest<typeof listShiftAssignments>) {
    return this.shiftAssignments.listAssignments(data);
  }

  @MessagePattern(pattern(createShiftAssignment))
  createAssignment(@Payload() data: RpcRequest<typeof createShiftAssignment>) {
    return this.shiftAssignments.createAssignment(data);
  }

  @MessagePattern(pattern(updateShiftAssignment))
  updateAssignment(@Payload() data: RpcRequest<typeof updateShiftAssignment>) {
    return this.shiftAssignments.updateAssignment(data);
  }

  @MessagePattern(pattern(deleteShiftAssignment))
  deleteAssignment(@Payload() data: RpcRequest<typeof deleteShiftAssignment>) {
    return this.shiftAssignments.deleteAssignment(data);
  }
}
