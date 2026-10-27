import { Global, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { ApprovalRulesService } from './approval-rules.service';
import { ApprovalRulesAdminService } from './approval-rules-admin.service';
import { ApprovalRouteService } from './approval-route.service';
import { ApprovalEscalationService } from './approval-escalation.service';
import { RuleFactsReader } from './rule-facts.reader';
import { ApprovalRuleInsightsService } from './approval-rule-insights.service';

/** One gate for every approve path that office rules apply to (overtime, requests, expenses). */
@Global()
@Module({
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  providers: [
    ApprovalRulesService,
    ApprovalRulesAdminService,
    ApprovalRouteService,
    ApprovalEscalationService,
    RuleFactsReader,
    ApprovalRuleInsightsService,
  ],
  exports: [ApprovalRulesService, ApprovalRulesAdminService, ApprovalRouteService, ApprovalRuleInsightsService],
})
export class ApprovalRulesModule {}
