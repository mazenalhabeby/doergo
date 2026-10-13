import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ApprovalRouteService, type ApprovalRouteInput } from './approval-route.service';
import { StandInsService, type StandInCaller } from './stand-ins.service';
import type { ApprovalRuleInput, RuleKind, StandInInput } from '@hbcfield/shared';
import { ApprovalRulesService } from '../../common/approval-rules/approval-rules.service';

/** The approvals inbox's people questions (the inbox itself lives in the gateway). */
@Controller()
export class ApprovalsController {
  constructor(
    private readonly routes: ApprovalRouteService,
    private readonly standIns: StandInsService,
    private readonly rules: ApprovalRulesService,
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

  @MessagePattern({ cmd: 'approval_steps' })
  steps(@Payload() data: { organizationId: string; items: Array<{ kind: RuleKind; itemId: string }> }) {
    return this.rules.steps(data.organizationId, data.items ?? []);
  }

  @MessagePattern({ cmd: 'approval_rules_list' })
  listRules(@Payload() data: { organizationId: string }) {
    return this.rules.listRules(data.organizationId);
  }

  @MessagePattern({ cmd: 'approval_rules_save' })
  saveRule(@Payload() data: { organizationId: string; userId: string; input: ApprovalRuleInput; id?: string }) {
    return this.rules.saveRule(data.organizationId, data.userId, data.input, data.id);
  }

  @MessagePattern({ cmd: 'approval_rules_delete' })
  deleteRule(@Payload() data: { organizationId: string; id: string }) {
    return this.rules.deleteRule(data.organizationId, data.id);
  }
}
