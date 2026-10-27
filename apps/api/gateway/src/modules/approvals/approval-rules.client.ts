import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { BaseGatewayService, SERVICE_NAMES, type ApprovalRuleInput, type RuleKind } from '@hbcfield/shared';
import {
  pattern,
  type RpcReply,
  type RpcRequest,
  approvalSteps,
  approvalRulesList,
  approvalRulesSave,
  approvalRulesDelete,
  approvalRulesInsights,
} from '@hbcfield/shared/microservices';

/** Gateway → task-service for office rules and the open first steps. */
@Injectable()
export class ApprovalRulesClient extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, ApprovalRulesClient.name);
  }

  steps(organizationId: string, items: Array<{ kind: RuleKind; itemId: string }>) {
    return this.send<RpcReply<typeof approvalSteps>>(pattern(approvalSteps), {
      organizationId,
      items,
    } satisfies RpcRequest<typeof approvalSteps>);
  }
  list(organizationId: string, spaceIds?: string[]) {
    return this.send<RpcReply<typeof approvalRulesList>>(pattern(approvalRulesList), {
      organizationId,
      spaceIds,
    } satisfies RpcRequest<typeof approvalRulesList>);
  }
  insights(organizationId: string, kind: RuleKind, spaceIds?: string[]) {
    return this.send<RpcReply<typeof approvalRulesInsights>>(pattern(approvalRulesInsights), {
      organizationId,
      kind,
      spaceIds,
    } satisfies RpcRequest<typeof approvalRulesInsights>);
  }
  save(organizationId: string, userId: string, input: ApprovalRuleInput, id?: string, spaceIds?: string[]) {
    return this.sendOnce<RpcReply<typeof approvalRulesSave>>(pattern(approvalRulesSave), {
      organizationId,
      userId,
      input,
      id,
      spaceIds,
    } satisfies RpcRequest<typeof approvalRulesSave>);
  }
  remove(organizationId: string, id: string, spaceIds?: string[]) {
    return this.sendOnce<RpcReply<typeof approvalRulesDelete>>(pattern(approvalRulesDelete), {
      organizationId,
      id,
      spaceIds,
    } satisfies RpcRequest<typeof approvalRulesDelete>);
  }
}
