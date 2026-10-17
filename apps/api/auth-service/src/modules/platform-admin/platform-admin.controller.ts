import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformBillingService } from './platform-billing.service';
import { PlatformBillingAlertsService } from './platform-billing-alerts.service';
import { PlatformTrialService } from './platform-trial.service';

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
  @MessagePattern({ cmd: 'platform_audit_write' })
  auditWrite(@Payload() d: any) { return this.audit.write(d ?? {}); }

  @MessagePattern({ cmd: 'platform_audit_list' })
  auditList(@Payload() d: any) { return this.audit.list(d ?? {}); }

  @MessagePattern({ cmd: 'platform_overview' })
  overview() { return this.svc.overview(); }

  @MessagePattern({ cmd: 'platform_list_orgs' })
  listOrgs(@Payload() d: { search?: string; status?: string; cursor?: string; limit?: number }) { return this.svc.listOrgs(d ?? {}); }

  @MessagePattern({ cmd: 'platform_org_detail' })
  orgDetail(@Payload() d: { organizationId: string; viewerRole?: string; memberLimit?: number }) {
    return this.svc.orgDetail(d.organizationId, { viewerRole: d.viewerRole, memberLimit: d.memberLimit });
  }

  @MessagePattern({ cmd: 'platform_end_trial' })
  endTrial(@Payload() d: any) {
    return this.trials.endTrial(d);
  }

  @MessagePattern({ cmd: 'platform_billing_alerts' })
  billingAlerts(@Payload() d: any) {
    return this.alertsService.listBillingAlerts(d ?? {});
  }

  @MessagePattern({ cmd: 'platform_ack_billing_alert' })
  ackBillingAlert(@Payload() d: any) {
    return this.alertsService.acknowledgeBillingAlert(d);
  }

  @MessagePattern({ cmd: 'platform_set_billing_mode' })
  setBillingMode(@Payload() d: any) {
    return this.platformBilling.setBillingMode(d);
  }

  @MessagePattern({ cmd: 'platform_set_agreed_price' })
  setAgreedPrice(@Payload() d: any) {
    return this.platformBilling.setAgreedPrice(d);
  }

  @MessagePattern({ cmd: 'platform_clear_agreed_price' })
  clearAgreedPrice(@Payload() d: any) {
    return this.platformBilling.clearAgreedPrice(d);
  }

  @MessagePattern({ cmd: 'platform_suspend' })
  suspend(@Payload() d: any) { return this.svc.suspend(d); }

  @MessagePattern({ cmd: 'platform_set_offline_mode' })
  setOfflineMode(@Payload() d: any) { return this.svc.setOfflineMode(d); }

  @MessagePattern({ cmd: 'platform_reactivate' })
  reactivate(@Payload() d: any) { return this.svc.reactivate(d); }

  @MessagePattern({ cmd: 'platform_extend_trial' })
  extendTrial(@Payload() d: any) {
    return this.trials.extendTrial(d);
  }
}
