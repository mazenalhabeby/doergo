import { Injectable, HttpStatus } from '@nestjs/common';
import { isAddOn } from '@hbcfield/shared';
import { BillingBase } from './billing.base';

/** Operator billing actions: every organization's add-ons. */
@Injectable()
export class BillingAdminService extends BillingBase {
  /**
   * PLATFORM-OPERATOR action (gated by a secret at the gateway — NOT a customer
   * action). Force an org onto a tier — mainly ENTERPRISE, whose price is a
   * custom Stripe quote outside self-serve checkout. Sets planTier + its modules
   * + ACTIVE and clears any trial lock. The subscription webhook preserves this
   * tier because a custom price doesn't resolve to a known tier (see line ~425).
   */
  /** PLATFORM-OPERATOR: list every org with its billing state (one indexed query). */
  async adminListOrgs() {
    const orgs = await this.prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        planTier: true,
        subStatus: true,
        currentPeriodEnd: true,
        trialEndsAt: true,
      },
      orderBy: { name: 'asc' },
    });
    return { success: true, data: orgs };
  }

  /**
   * Operator grant: give an organization capabilities outright.
   *
   * This replaced "set their tier". A negotiated contract now grants the
   * capabilities it covers rather than naming a bundle, which is both more
   * honest and the only thing the gate understands. Marks them ACTIVE and ends
   * the trial, exactly as setting a tier did.
   */
  async adminSetOrgAddOns(data: { organizationId: string; addOns: string[]; byUserId?: string }) {
    const org = await this.prisma.organization.findUnique({
      where: { id: data.organizationId },
      select: { id: true, name: true },
    });
    if (!org) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Organization not found' };
    }
    const unknown = (data.addOns ?? []).filter((k) => !isAddOn(k));
    if (unknown.length) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: `Not an add-on: ${unknown.join(', ')}` };
    }
    const updated = await this.prisma.organization.update({
      where: { id: data.organizationId },
      data: {
        addOns: [...new Set(data.addOns ?? [])].sort(),
        subStatus: 'ACTIVE',
        trialEndsAt: null,
      },
      select: { id: true, name: true, addOns: true, subStatus: true },
    });
    this.logger.warn(
      `[PLATFORM] Org "${org.name}" (${org.id}) add-ons set to [${updated.addOns.join(', ')}] by ${data.byUserId ?? 'operator'}`,
    );
    return { success: true, data: updated };
  }
}
