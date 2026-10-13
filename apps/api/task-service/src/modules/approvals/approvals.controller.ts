import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ApprovalRouteService, type ApprovalRouteInput } from './approval-route.service';

/** The approvals inbox's people questions (the inbox itself lives in the gateway). */
@Controller()
export class ApprovalsController {
  constructor(private readonly routes: ApprovalRouteService) {}

  @MessagePattern({ cmd: 'approval_route' })
  route(@Payload() data: ApprovalRouteInput) {
    return this.routes.route(data);
  }
}
