import { Injectable } from '@nestjs/common';
import { SpaceRolesService } from './space-roles.service';
import { RebillService } from '../../common/billing/rebill.service';

/** What the space-roles controllers share: re-billing after a change that can move a seat's price. */
@Injectable()
export abstract class SpaceRolesControllerBase {

  constructor(
    protected readonly service: SpaceRolesService,
    protected readonly billing: RebillService,
  ) {}


  /**
   * Run a change that can move the bill, then re-price the organization.
   *
   * An external member's seat is priced from the permissions their SPACE role
   * grants (an Observer €2, a Supervisor €9.99), so giving, changing or taking a
   * space role — or editing what a role grants — changes what is owed. These
   * routes did not re-bill; the change reached Stripe only with the nightly
   * sweep. Only after success: a refused change moved nothing.
   */
  protected async thenRebill<T>(req: any, change: Promise<T>): Promise<T> {
    const result = await change;
    this.billing.rebill(req.user?.organizationId);
    return result;
  }
}
