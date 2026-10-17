import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformBillingService } from './platform-billing.service';
import { PlatformBillingAlertsService } from './platform-billing-alerts.service';
import { PlatformTrialService } from './platform-trial.service';

import {
  pattern,
  platformAuditWrite,
  platformAuditList,
  platformOverview,
  platformListOrgs,
  platformOrgDetail,
  platformEndTrial,
  platformBillingAlerts,
  platformAckBillingAlert,
  platformSetBillingMode,
  platformSetAgreedPrice,
  platformClearAgreedPrice,
  platformSuspend,
  platformSetOfflineMode,
  platformReactivate,
  platformExtendTrial,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
@Controller()
export class PlatformAdminController {
  constructor(
    private readonly svc: PlatformAdminService,
    private readonly trials: PlatformTrialService,
    private readonly alertsService: PlatformBillingAlertsService,
    private readonly platformBilling: PlatformBillingService,
    private readonly audit: PlatformAuditService,
  ) {}

  // The operator audit trail: written by the gateway interceptor and the agent
  // socket, read by Owners. No update or delete pattern exists — append-only.
  @MessagePattern(pattern(platformAuditWrite))
  auditWrite(@Payload() d: RpcRequest<typeof platformAuditWrite>) {
    return this.audit.write(d ?? {});
  }

  @MessagePattern(pattern(platformAuditList))
  auditList(@Payload() d: RpcRequest<typeof platformAuditList>) {
    return this.audit.list(d ?? {});
  }

  @MessagePattern(pattern(platformOverview))
  overview() {
    return this.svc.overview();
  }

  @MessagePattern(pattern(platformListOrgs))
  listOrgs(@Payload() d: RpcRequest<typeof platformListOrgs>) {
    return this.svc.listOrgs(d ?? {});
  }

  @MessagePattern(pattern(platformOrgDetail))
  orgDetail(@Payload() d: RpcRequest<typeof platformOrgDetail>) {
    return this.svc.orgDetail(d.organizationId, { viewerRole: d.viewerRole, memberLimit: d.memberLimit });
  }

  @MessagePattern(pattern(platformEndTrial))
  endTrial(@Payload() d: RpcRequest<typeof platformEndTrial>) {
    return this.trials.endTrial(d);
  }

  @MessagePattern(pattern(platformBillingAlerts))
  billingAlerts(@Payload() d: RpcRequest<typeof platformBillingAlerts>) {
    return this.alertsService.listBillingAlerts(d ?? {});
  }

  @MessagePattern(pattern(platformAckBillingAlert))
  ackBillingAlert(@Payload() d: RpcRequest<typeof platformAckBillingAlert>) {
    return this.alertsService.acknowledgeBillingAlert(d);
  }

  @MessagePattern(pattern(platformSetBillingMode))
  setBillingMode(@Payload() d: RpcRequest<typeof platformSetBillingMode>) {
    return this.platformBilling.setBillingMode(d);
  }

  @MessagePattern(pattern(platformSetAgreedPrice))
  setAgreedPrice(@Payload() d: RpcRequest<typeof platformSetAgreedPrice>) {
    return this.platformBilling.setAgreedPrice(d);
  }

  @MessagePattern(pattern(platformClearAgreedPrice))
  clearAgreedPrice(@Payload() d: RpcRequest<typeof platformClearAgreedPrice>) {
    return this.platformBilling.clearAgreedPrice(d);
  }

  @MessagePattern(pattern(platformSuspend))
  suspend(@Payload() d: RpcRequest<typeof platformSuspend>) {
    return this.svc.suspend(d);
  }

  @MessagePattern(pattern(platformSetOfflineMode))
  setOfflineMode(@Payload() d: RpcRequest<typeof platformSetOfflineMode>) {
    return this.svc.setOfflineMode(d);
  }

  @MessagePattern(pattern(platformReactivate))
  reactivate(@Payload() d: RpcRequest<typeof platformReactivate>) {
    return this.svc.reactivate(d);
  }

  @MessagePattern(pattern(platformExtendTrial))
  extendTrial(@Payload() d: RpcRequest<typeof platformExtendTrial>) {
    return this.trials.extendTrial(d);
  }
}
