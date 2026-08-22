import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

/** Gateway → auth-service proxy for the platform-operator control center. */
@Injectable()
export class PlatformAdminService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.AUTH) authClient: ClientProxy) {
    super(authClient, PlatformAdminService.name);
  }
  overview() { return this.send({ cmd: 'platform_overview' }, {}); }
  listOrgs(data: { search?: string; status?: string }) { return this.send({ cmd: 'platform_list_orgs' }, data); }
  orgDetail(data: { organizationId: string }) { return this.send({ cmd: 'platform_org_detail' }, data); }
  suspend(data: { organizationId: string; byUserId?: string }) { return this.send({ cmd: 'platform_suspend' }, data); }
  reactivate(data: { organizationId: string; byUserId?: string }) { return this.send({ cmd: 'platform_reactivate' }, data); }
  extendTrial(data: { organizationId: string; days: number; byUserId?: string }) { return this.send({ cmd: 'platform_extend_trial' }, data); }

  // Auth + staff management
  login(data: { email: string; password: string; code?: string }) { return this.send({ cmd: 'platform_login' }, data); }
  me(data: { userId: string }) { return this.send({ cmd: 'platform_me' }, data); }
  listUsers() { return this.send({ cmd: 'platform_users_list' }, {}); }
  createUser(data: any) { return this.send({ cmd: 'platform_users_create' }, data); }
  updateUser(data: any) { return this.send({ cmd: 'platform_users_update' }, data); }
  resetPassword(data: any) { return this.send({ cmd: 'platform_users_reset_password' }, data); }
  bootstrapOwner(data: any) { return this.send({ cmd: 'platform_bootstrap_owner' }, data); }
  changePassword(data: any) { return this.send({ cmd: 'platform_change_password' }, data); }
  setup2fa(data: any) { return this.send({ cmd: 'platform_2fa_setup' }, data); }
  enable2fa(data: any) { return this.send({ cmd: 'platform_2fa_enable' }, data); }
  disable2fa(data: any) { return this.send({ cmd: 'platform_2fa_disable' }, data); }
  // Operator grant — capabilities, not a tier (reuses the billing service).
  setAddOns(data: { organizationId: string; addOns: string[] }) { return this.send({ cmd: 'billing_admin_set_addons' }, data); }

  // Pricing — READ ONLY. Prices live in `packages/shared/src/billing/*`; the
  // editable price book this replaced kept a second copy in the database that
  // had been quoting deleted tier prices since the model changed.
  pricingList() { return this.send({ cmd: 'platform_pricing_list' }, {}); }
  pricingStripeStatus() { return this.send({ cmd: 'platform_pricing_stripe_status' }, {}); }
}
