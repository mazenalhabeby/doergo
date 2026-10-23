import { ServiceCalls } from '../../common/microservices/service-calls';
import { Injectable } from '@nestjs/common';
import { portalScope } from '../../common/portal-scope';
import { portalAssertReach, type RpcContract } from '@hbcfield/shared/microservices';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';

/** What the /portal/admin controllers ask auth-service: any portal message, and the manage reach on a portal. */
@Injectable()
export class PortalAdminCalls {
  constructor(private readonly services: ServiceCalls) {}

  /** A message contract; the payload is checked against it. The reply is not typed yet (it was `any`). */
  ask<Req>(contract: RpcContract<Req, unknown>, payload: NoInfer<Req>): Promise<any> {
    return this.services.auth.ask(contract, payload);
  }

  /** 404 unless the portal / client / unit is in the caller's reach for `manage`. */
  assertManageReach(req: AuthedRequest, refs: { portalId?: string; customerId?: string; unitId?: string }) {
    return this.ask(portalAssertReach, {
      ...refs,
      organizationId: callerOrgId(req.user),
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }
}
