import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
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

@Injectable()
export class ShiftsService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, ShiftsService.name);
  }

  // Shifts
  listShifts(data: RpcRequest<typeof listShifts>) {
    return this.send(pattern(listShifts), data);
  }
  createShift(data: RpcRequest<typeof createShift>) {
    return this.send(pattern(createShift), data);
  }
  updateShift(data: RpcRequest<typeof updateShift>) {
    return this.send(pattern(updateShift), data);
  }
  deleteShift(data: RpcRequest<typeof deleteShift>) {
    return this.send(pattern(deleteShift), data);
  }

  // Rota
  weekRota(data: RpcRequest<typeof weekRota>) {
    return this.send(pattern(weekRota), data);
  }

  setRotaDay(data: RpcRequest<typeof setRotaDay>) {
    return this.send(pattern(setRotaDay), data);
  }

  listAssignments(data: RpcRequest<typeof listShiftAssignments>) {
    return this.send(pattern(listShiftAssignments), data);
  }
  createAssignment(data: RpcRequest<typeof createShiftAssignment>) {
    return this.send(pattern(createShiftAssignment), data);
  }
  updateAssignment(data: RpcRequest<typeof updateShiftAssignment>) {
    return this.send(pattern(updateShiftAssignment), data);
  }
  deleteAssignment(data: RpcRequest<typeof deleteShiftAssignment>) {
    return this.send(pattern(deleteShiftAssignment), data);
  }
}
