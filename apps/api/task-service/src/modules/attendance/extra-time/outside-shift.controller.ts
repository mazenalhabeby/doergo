import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  pattern,
  type RpcRequest,
  listOutsideShift,
  listMyOutsideShift,
  listMyApprovers,
  decideOutsideShift,
} from '@hbcfield/shared/microservices';
import { OutsideShiftService } from './outside-shift.service';
import { ExtraTimeService } from './extra-time.service';

/** Time worked outside the planned shift — the list, the member's own, the decision. */
@Controller()
export class OutsideShiftController {
  constructor(
    private readonly outside: OutsideShiftService,
    private readonly extraTime: ExtraTimeService,
  ) {}

  @MessagePattern(pattern(listOutsideShift))
  list(@Payload() data: RpcRequest<typeof listOutsideShift>) {
    return this.outside.listPending(data);
  }

  @MessagePattern(pattern(listMyOutsideShift))
  mine(@Payload() data: RpcRequest<typeof listMyOutsideShift>) {
    return this.outside.listMine(data);
  }

  @MessagePattern(pattern(listMyApprovers))
  approvers(@Payload() data: RpcRequest<typeof listMyApprovers>) {
    return this.extraTime.myApprovers(data);
  }

  @MessagePattern(pattern(decideOutsideShift))
  decide(@Payload() data: RpcRequest<typeof decideOutsideShift>) {
    return this.outside.decide(data);
  }
}
