import { Inject, Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrgEventsService } from '../../common/events/org-events.service';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { AuthTokenCache } from '../../common/cache/auth-token-cache.service';
import { SpaceModulesService } from '../../common/space-modules.service';
import { sendRpc, getCustomer, type RpcContract } from '@hbcfield/shared/microservices';

/**
 * What every /customers controller shares: asking auth-service, a write that
 * re-bills and announces, the caller as auth-service reads them, the workspace's
 * CRM module, and a client the caller manages.
 */
@Injectable()
export abstract class CustomersControllerBase {
  constructor(
    @Inject('AUTH_SERVICE') protected readonly authClient: ClientProxy,
    protected readonly spaceModules: SpaceModulesService,
    protected readonly authCache: AuthTokenCache,
    protected readonly orgEvents: OrgEventsService,
  ) {}

  /** A message contract; the payload is checked against it. The reply is not typed yet (it was `any`). */
  protected auth<Req>(contract: RpcContract<Req, unknown>, payload: NoInfer<Req>): Promise<any> {
    return firstValueFrom(sendRpc(this.authClient, contract, payload));
  }

  /**
   * Run a CRM mutation and tell the org to re-read (audit C-D2). Nothing in the
   * CRM announced anything: a rep adding an activity was invisible to a
   * co-manager viewing the same client, and a new client never appeared on another
   * admin's list. Broadcast on success only — a refused mutation changed nothing.
   */
  protected async authMutation<Req>(
    contract: RpcContract<Req, unknown>,
    payload: NoInfer<Req>,
    organizationId: string,
    customerId?: string,
  ) {
    const res = await this.auth(contract, payload);
    if (!res || res.success !== false) {
      this.orgEvents.customerChanged(organizationId, customerId ?? res?.data?.id ?? res?.id);
    }
    return res;
  }

  /** Caller context for CRM cap resolution + per-record ownership (server-authoritative). */
  protected caller(req: any) {
    return { userId: req.user.id, role: req.user.role };
  }

  /** Assert the space has a module enabled (per-space gate; defence in depth). */
  protected async requireSpaceModule(spaceId: string | null | undefined, organizationId: string, mod: string) {
    if (!spaceId) throw new BadRequestException('spaceId is required');
    await this.spaceModules.assertEnabled(spaceId, organizationId, mod);
  }

  /**
   * The client, read AS the caller (404 when out of their reach), and refused
   * unless they may manage it where it is filed — `crmCaps` on the record is
   * customers.service's answer for org ∪ that workspace, never the org flag.
   */
  protected async managedCustomer(id: string, organizationId: string, caller: { userId: string; role: string }) {
    const res: any = await this.auth(getCustomer, { id, organizationId, caller });
    const customer = res?.data ?? res;
    if (!customer?.id) throw new BadRequestException('Customer not found');
    if (!customer.crmCaps?.manage) throw new ForbiddenException('Not allowed to manage this client');
    return customer;
  }
}
