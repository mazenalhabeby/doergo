import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  BaseGatewayService,
  SERVICE_NAMES,
  type ApprovalRuleInput,
  type ApprovalRuleView,
  type ApprovalStepView,
  type RuleKind,
} from '@hbcfield/shared';

/** Gateway → task-service for office rules and the open first steps. */
@Injectable()
export class ApprovalRulesClient extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, ApprovalRulesClient.name);
  }

  steps(organizationId: string, items: Array<{ kind: RuleKind; itemId: string }>) {
    return this.send<ApprovalStepView[]>({ cmd: 'approval_steps' }, { organizationId, items });
  }
  list(organizationId: string) {
    return this.send<ApprovalRuleView[]>({ cmd: 'approval_rules_list' }, { organizationId });
  }
  save(organizationId: string, userId: string, input: ApprovalRuleInput, id?: string) {
    return this.sendOnce<{ id: string }>({ cmd: 'approval_rules_save' }, { organizationId, userId, input, id });
  }
  remove(organizationId: string, id: string) {
    return this.sendOnce<{ deleted: true }>({ cmd: 'approval_rules_delete' }, { organizationId, id });
  }
}
