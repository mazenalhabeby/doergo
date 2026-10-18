import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ApprovalRouteService } from '../../common/approval-rules/approval-route.service';
import { StandInsService } from './stand-ins.service';
import { ApprovalRulesService } from '../../common/approval-rules/approval-rules.service';
import { ApprovalRulesAdminService } from '../../common/approval-rules/approval-rules-admin.service';
import {
  pattern,
  type RpcRequest,
  approvalRouteRpc,
  standInsList,
  standInsCreate,
  standInsEnd,
  approvalSteps,
  approvalRulesList,
  approvalRulesSave,
  approvalRulesDelete,
} from '@hbcfield/shared/microservices';

/** The approvals inbox's people questions (the inbox itself lives in the gateway). */
@Controller()
export class ApprovalsController {
  constructor(
    private readonly routes: ApprovalRouteService,
    private readonly standIns: StandInsService,
    private readonly rules: ApprovalRulesService,
    private readonly rulesAdmin: ApprovalRulesAdminService,
  ) {}

  @MessagePattern(pattern(approvalRouteRpc))
  route(@Payload() data: RpcRequest<typeof approvalRouteRpc>) {
    return this.routes.route(data);
  }

  @MessagePattern(pattern(standInsList))
  listStandIns(@Payload() data: RpcRequest<typeof standInsList>) {
    return this.standIns.list(data.caller);
  }

  @MessagePattern(pattern(standInsCreate))
  createStandIn(@Payload() data: RpcRequest<typeof standInsCreate>) {
    return this.standIns.create(data.caller, data.input);
  }

  @MessagePattern(pattern(standInsEnd))
  endStandIn(@Payload() data: RpcRequest<typeof standInsEnd>) {
    return this.standIns.end(data.caller, data.id);
  }

  @MessagePattern(pattern(approvalSteps))
  steps(@Payload() data: RpcRequest<typeof approvalSteps>) {
    return this.rules.steps(data.organizationId, data.items ?? []);
  }

  @MessagePattern(pattern(approvalRulesList))
  listRules(@Payload() data: RpcRequest<typeof approvalRulesList>) {
    return this.rulesAdmin.listRules(data.organizationId);
  }

  @MessagePattern(pattern(approvalRulesSave))
  saveRule(@Payload() data: RpcRequest<typeof approvalRulesSave>) {
    return this.rulesAdmin.saveRule(data.organizationId, data.userId, data.input, data.id);
  }

  @MessagePattern(pattern(approvalRulesDelete))
  deleteRule(@Payload() data: RpcRequest<typeof approvalRulesDelete>) {
    return this.rulesAdmin.deleteRule(data.organizationId, data.id);
  }
}
