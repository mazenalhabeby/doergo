import { StripeCatalogService } from './stripe-catalog.service';
import { StripeLinesService } from './stripe-lines.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type Stripe from 'stripe';
import { PrismaService } from '@hbcfield/shared';
import { StripeService } from './stripe.service';
import { OrgBillService } from './org-bill.service';
import { collectionMethodFor, type BillingMode } from '@hbcfield/shared';
import { PrismaTier, tierFromPrisma, subPeriod, mapStripeStatus } from './billing-helpers';

/**
 * What the billing services share: their dependencies, and reading a Stripe
 * subscription back onto the organization.
 */
@Injectable()
export abstract class BillingBase {
  /* The Stripe lines part since the split — a property, so the base's constructor (and every subclass) is unchanged. */
  @Inject(StripeLinesService) protected readonly stripeLines!: StripeLinesService;

  /* The Stripe catalog part since the split — a property, so the base's constructor (and every subclass) is unchanged. */
  @Inject(StripeCatalogService) protected readonly stripeCatalog!: StripeCatalogService;
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly stripe: StripeService,
    protected readonly bill: OrgBillService,
  ) {}

  protected async orgIdByCustomer(
    customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
  ): Promise<string | null> {
    const customerId = typeof customer === 'string' ? customer : customer?.id;
    if (!customerId) return null;
    const org = await this.prisma.organization.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } });
    return org?.id ?? null;
  }

  /** Persist everything derived from a Stripe Subscription object. */
  protected async syncSubscription(sub: Stripe.Subscription): Promise<string | null> {
    const orgId = await this.orgIdByCustomer(sub.customer);
    if (!orgId) return null;

    const status = mapStripeStatus(sub.status);
    const officeSeats = sub.items.data.reduce((n, i) => n + (i.quantity ?? 0), 0); // refined below
    // Derive office/field seats from item metadata if present; else keep DB counts.
    const { start: periodStart, end: periodEnd } = subPeriod(sub);
    const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;

    // AUTHORITATIVE tier = what the customer actually pays for, resolved
    // from the subscription's Stripe price IDs. This is the ONLY correct source —
    // reading the denormalized org.planTier would let a Starter buyer keep the
    // trial's Professional entitlements (payment ≠ entitlement). Fall back to the
    // stored tier only when no known price matches (e.g. Enterprise/custom).
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { planTier: true } });
    const resolved = this.stripeCatalog.resolveTierInterval(sub);
    const tier = resolved?.tier ?? tierFromPrisma(org?.planTier ?? null);
    const prismaTier: PrismaTier = tier ? (tier.toUpperCase() as PrismaTier) : (org?.planTier ?? 'PROFESSIONAL');

    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        planTier: prismaTier,
        subStatus: status,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        trialEndsAt: trialEnd,
        // Modules are NOT derived from the subscription any more. A space
        // switches its own on and is billed for them, so a webhook rewriting
        // the org's module list would silently undo somebody's configuration.
      },
    });
    await this.prisma.subscription.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        stripeSubscriptionId: sub.id,
        planTier: prismaTier,
        status,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        trialEndsAt: trialEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        canceledAt: status === 'CANCELED' ? new Date() : null,
      },
      update: {
        stripeSubscriptionId: sub.id,
        planTier: prismaTier,
        status,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        trialEndsAt: trialEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        canceledAt: status === 'CANCELED' ? new Date() : undefined,
      },
    });
    // (officeSeats reduce above intentionally unused for now; seats are authoritative
    // from our DB via reconcileSeats — kept for future item-level attribution.)
    void officeSeats;

    /*
      Apply the organization's collection method now that a subscription EXISTS.

      Stripe Checkout cannot carry one — it refuses the parameter outright — so
      an INVOICE customer completes an ordinary checkout and the subscription
      arrives as charge_automatically. This is the first moment it can be
      corrected, and it uses the same `setCollectionMethod` the operator console
      calls, so there is one implementation rather than two.

      Best-effort and last: a webhook that already recorded the subscription
      must not fail over this, or Stripe retries an event whose work is done.
    */
    try {
      const billing = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { billingMode: true, invoiceDueDays: true },
      });
      const want = collectionMethodFor((billing?.billingMode ?? 'AUTOMATIC') as BillingMode);
      if (want && sub.collection_method !== want) {
        await this.stripe.setCollectionMethod(sub.id, want, billing?.invoiceDueDays ?? 14);
        this.logger.log(`Collection method for org ${orgId} set to ${want}`);
      }
    } catch (e) {
      this.logger.error(`Could not set collection method for org ${orgId}: ${(e as Error).message}`);
    }

    return orgId;
  }
}
