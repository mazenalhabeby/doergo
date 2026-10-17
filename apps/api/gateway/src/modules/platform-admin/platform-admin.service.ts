import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
  platformOverview,
  platformListOrgs,
  platformOrgDetail,
  platformAuditList,
  platformSetAgreedPrice,
  platformClearAgreedPrice,
  platformSuspend,
  platformSetOfflineMode,
  platformBillingAlerts,
  platformAckBillingAlert,
  platformSetBillingMode,
  platformReactivate,
  platformExtendTrial,
  platformEndTrial,
  platformLogin,
  platformMe,
  platformUsersList,
  platformUsersCreate,
  platformUsersUpdate,
  platformUsersResetPassword,
  platformBootstrapOwner,
  platformChangePassword,
  platform2faSetup,
  platform2faEnable,
  platform2faDisable,
  platformUsersReset2fa,
  platformLogout,
  platformRefresh,
  billingAdminSetAddons,
  platformPricingList,
  platformPricingStripeStatus,
  platformMailStatus,
  type RpcRequest,
} from '@hbcfield/shared/microservices';

/** Gateway → auth-service proxy for the platform-operator control center. */
@Injectable()
export class PlatformAdminService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.AUTH) authClient: ClientProxy) {
    super(authClient, PlatformAdminService.name);
  }
  overview() {
    return this.call(platformOverview, {});
  }
  listOrgs(data: { search?: string; status?: string; cursor?: string; limit?: number }) {
    return this.call(platformListOrgs, data);
  }
  orgDetail(data: { organizationId: string; viewerRole?: string; memberLimit?: number }) {
    return this.call(platformOrgDetail, data);
  }
  auditList(data: { cursor?: string; limit?: number; actorId?: string; organizationId?: string }) {
    return this.call(platformAuditList, data);
  }
  setAgreedPrice(data: {
    organizationId: string;
    monthlyCents: number;
    until?: string | null;
    note?: string | null;
    byUserId?: string;
  }) {
    return this.call(platformSetAgreedPrice, data);
  }
  clearAgreedPrice(data: { organizationId: string; byUserId?: string }) {
    return this.call(platformClearAgreedPrice, data);
  }
  suspend(data: { organizationId: string; byUserId?: string }) {
    return this.call(platformSuspend, data);
  }
  setOfflineMode(data: { organizationId: string; enabled: boolean; byUserId?: string }) {
    return this.call(platformSetOfflineMode, data);
  }
  billingAlerts(data: { includeAcknowledged?: boolean }) {
    return this.call(platformBillingAlerts, data);
  }
  ackBillingAlert(data: { id: string; byUserId?: string }) {
    return this.call(platformAckBillingAlert, data);
  }
  setBillingMode(data: RpcRequest<typeof platformSetBillingMode>) {
    return this.call(platformSetBillingMode, data);
  }
  reactivate(data: { organizationId: string; byUserId?: string }) {
    return this.call(platformReactivate, data);
  }
  extendTrial(data: { organizationId: string; days: number; byUserId?: string }) {
    return this.call(platformExtendTrial, data);
  }
  endTrial(data: { organizationId: string; byUserId?: string }) {
    return this.call(platformEndTrial, data);
  }

  // Auth + staff management
  login(data: { email: string; password: string; code?: string }) {
    return this.call(platformLogin, data);
  }
  me(data: { userId: string }) {
    return this.call(platformMe, data);
  }
  listUsers() {
    return this.call(platformUsersList, {});
  }
  createUser(data: any) {
    return this.call(platformUsersCreate, data);
  }
  updateUser(data: any) {
    return this.call(platformUsersUpdate, data);
  }
  resetPassword(data: any) {
    return this.call(platformUsersResetPassword, data);
  }
  bootstrapOwner(data: any) {
    return this.call(platformBootstrapOwner, data);
  }
  changePassword(data: any) {
    return this.call(platformChangePassword, data);
  }
  setup2fa(data: any) {
    return this.call(platform2faSetup, data);
  }
  enable2fa(data: any) {
    return this.call(platform2faEnable, data);
  }
  disable2fa(data: any) {
    return this.call(platform2faDisable, data);
  }
  reset2fa(data: { id: string; byUserId?: string }) {
    return this.call(platformUsersReset2fa, data);
  }
  logout(data: { userId: string; iat?: number }) {
    return this.call(platformLogout, data);
  }
  refresh(data: { userId: string; authTime?: number }) {
    return this.call(platformRefresh, data);
  }
  // Operator grant — capabilities, not a tier (reuses the billing service).
  setAddOns(data: { organizationId: string; addOns: string[]; byUserId?: string }) {
    return this.call(billingAdminSetAddons, data);
  }

  // Pricing — READ ONLY. Prices live in `packages/shared/src/billing/*`; the
  // editable price book this replaced kept a second copy in the database that
  // had been quoting deleted tier prices since the model changed.
  pricingList() {
    return this.call(platformPricingList, {});
  }
  pricingStripeStatus() {
    return this.call(platformPricingStripeStatus, {});
  }

  // Is outbound email working? Nothing else in the product surfaces this.
  mailStatus() {
    return this.call(platformMailStatus, {});
  }
}
