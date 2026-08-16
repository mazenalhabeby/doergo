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
  suspend(data: { organizationId: string }) { return this.send({ cmd: 'platform_suspend' }, data); }
  reactivate(data: { organizationId: string }) { return this.send({ cmd: 'platform_reactivate' }, data); }
  extendTrial(data: { organizationId: string; days: number }) { return this.send({ cmd: 'platform_extend_trial' }, data); }
}
