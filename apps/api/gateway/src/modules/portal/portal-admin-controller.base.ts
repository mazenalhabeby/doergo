import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { StorageService } from '../../common/storage/storage.service';
import { portalScope } from '../../common/portal-scope';

/** What every /portal/admin controller shares: asking auth-service, and the manage reach on a portal. */
@Injectable()
export abstract class PortalAdminControllerBase {

  constructor(
    @Inject('AUTH_SERVICE') protected readonly authClient: ClientProxy,
    @Inject('TASK_SERVICE') protected readonly taskClient: ClientProxy,
    protected readonly authCache: AuthTokenCache,
    protected readonly storage: StorageService,
  ) {}


  protected auth(cmd: string, payload: any) {
    return firstValueFrom(this.authClient.send({ cmd }, payload));
  }

  /** 404 unless the portal / client / unit is in the caller's reach for `manage`. */
  protected assertManageReach(req: any, refs: { portalId?: string; customerId?: string; unitId?: string }) {
    return this.auth('portal_assert_reach', {
      ...refs,
      organizationId: req.user.organizationId,
      scopeSpaceIds: portalScope(req.user, 'canManagePortals'),
    });
  }
}
