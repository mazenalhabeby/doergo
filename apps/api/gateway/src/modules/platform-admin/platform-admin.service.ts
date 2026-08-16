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
  login(data: { email: string; password: string }) { return this.send({ cmd: 'platform_login' }, data); }
  me(data: { userId: string }) { return this.send({ cmd: 'platform_me' }, data); }
  listUsers() { return this.send({ cmd: 'platform_users_list' }, {}); }
  createUser(data: any) { return this.send({ cmd: 'platform_users_create' }, data); }
  updateUser(data: any) { return this.send({ cmd: 'platform_users_update' }, data); }
  resetPassword(data: any) { return this.send({ cmd: 'platform_users_reset_password' }, data); }
  bootstrapOwner(data: any) { return this.send({ cmd: 'platform_bootstrap_owner' }, data); }
  // Org tier (reuse billing admin logic on auth-service)
  setTier(data: { organizationId: string; tier: string }) { return this.send({ cmd: 'billing_admin_set_tier' }, data); }
}
