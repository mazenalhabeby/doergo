import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ApprovalRouteService, type ApprovalRouteInput } from './approval-route.service';
import { StandInsService, type StandInCaller } from './stand-ins.service';
import type { StandInInput } from '@hbcfield/shared';

/** The approvals inbox's people questions (the inbox itself lives in the gateway). */
@Controller()
export class ApprovalsController {
  constructor(
    private readonly routes: ApprovalRouteService,
    private readonly standIns: StandInsService,
  ) {}

  @MessagePattern({ cmd: 'approval_route' })
  route(@Payload() data: ApprovalRouteInput) {
    return this.routes.route(data);
  }

  @MessagePattern({ cmd: 'stand_ins_list' })
  listStandIns(@Payload() data: { caller: StandInCaller }) {
    return this.standIns.list(data.caller);
  }

  @MessagePattern({ cmd: 'stand_ins_create' })
  createStandIn(@Payload() data: { caller: StandInCaller; input: StandInInput }) {
    return this.standIns.create(data.caller, data.input);
  }

  @MessagePattern({ cmd: 'stand_ins_end' })
  endStandIn(@Payload() data: { caller: StandInCaller; id: string }) {
    return this.standIns.end(data.caller, data.id);
  }
}
