import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  pattern,
  type RpcRequest,
  listOutsideShift,
  listMyOutsideShift,
  decideOutsideShift,
} from '@hbcfield/shared/microservices';
import { OutsideShiftService } from './outside-shift.service';

/** Time worked outside the planned shift — the list, the member's own, the decision. */
@Controller()
export class OutsideShiftController {
  constructor(private readonly outside: OutsideShiftService) {}

  @MessagePattern(pattern(listOutsideShift))
  list(@Payload() data: RpcRequest<typeof listOutsideShift>) {
    return this.outside.listPending(data);
  }

  @MessagePattern(pattern(listMyOutsideShift))
  mine(@Payload() data: RpcRequest<typeof listMyOutsideShift>) {
    return this.outside.listMine(data);
  }

  @MessagePattern(pattern(decideOutsideShift))
  decide(@Payload() data: RpcRequest<typeof decideOutsideShift>) {
    return this.outside.decide(data);
  }
}
