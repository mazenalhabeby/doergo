import type { RebillService } from '../../common/billing/rebill.service';

import type { AuthedRequest } from '../../common/request.types';

/**
 * Run a change that can move the bill, then re-price the organization.
 *
 * An external member's seat is priced from the permissions their SPACE role
 * grants (an Observer €2, a Supervisor €9.99), so giving, changing or taking a
 * space role — or editing what a role grants — changes what is owed. These
 * routes did not re-bill; the change reached Stripe only with the nightly
 * sweep. Only after success: a refused change moved nothing.
 */
export async function thenRebill<T>(billing: RebillService, req: AuthedRequest, change: Promise<T>): Promise<T> {
  const result = await change;
  billing.rebill(req.user?.organizationId);
  return result;
}
