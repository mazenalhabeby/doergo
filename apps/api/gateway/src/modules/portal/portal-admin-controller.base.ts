import { ServiceCalls } from '../../common/microservices/service-calls';
import { Injectable } from '@nestjs/common';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { StorageService } from '../../common/storage/storage.service';
import { portalScope } from '../../common/portal-scope';
import { portalAssertReach, type RpcContract } from '@hbcfield/shared/microservices';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
/** What every /portal/admin controller shares: asking auth-service, and the manage reach on a portal. */
@Injectable()
export abstract class PortalAdminControllerBase {
  constructor(
    protected readonly services: ServiceCalls,
    protected readonly authCache: AuthTokenCache,
    protected readonly storage: StorageService,
  ) {}

  /** A message contract; the payload is checked against it. The reply is not typed yet (it was `any`). */
  protected auth<Req>(contract: RpcContract<Req, unknown>, payload: NoInfer<Req>): Promise<any> {
    return this.services.auth.ask(contract, payload);
  }

  /** 404 unless the portal / client / unit is in the caller's reach for `manage`. */
  protected assertManageReach(req: AuthedRequest, refs: { portalId?: string; customerId?: string; unitId?: string }) {
    return this.auth(portalAssertReach, {
      ...refs,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }
}
