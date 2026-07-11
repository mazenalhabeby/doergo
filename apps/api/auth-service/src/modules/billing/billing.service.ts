import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import type Stripe from 'stripe';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StripeService } from './stripe.service';
import {
  countSeats,
  subscriptionTotalCents,
  modulesForTier,
  isLocked,
  trialDaysLeft,
  TRIAL_DAYS,
} from '@hbcfield/shared';
import type {
  PlanTier,
  BillingInterval,
  SeatCounts,
  SubStatus,
  SubscriptionView,
  CheckoutRequest,
  ChangePlanRequest,
} from '@hbcfield/shared';

type PrismaTier = 'STARTER' | 'PROFESSIONAL' | 'BUSINESS' | 'ENTERPRISE';
type PrismaStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE';
type PrismaInterval = 'MONTHLY' | 'ANNUAL';

const TIER_TO_PRISMA: Record<PlanTier, PrismaTier> = {
  starter: 'STARTER',
  professional: 'PROFESSIONAL',
  business: 'BUSINESS',
  enterprise: 'ENTERPRISE',
};
const INTERVAL_TO_PRISMA: Record<BillingInterval, PrismaInterval> = { monthly: 'MONTHLY', annual: 'ANNUAL' };
const tierFromPrisma = (p: PrismaTier | null): PlanTier | null => (p ? (p.toLowerCase() as PlanTier) : null);
const intervalFromPrisma = (p: PrismaInterval): BillingInterval => p.toLowerCase() as BillingInterval;
const statusFromPrisma = (p: PrismaStatus): SubStatus =>
  ({ TRIALING: 'trialing', ACTIVE: 'active', PAST_DUE: 'past_due', CANCELED: 'canceled', INCOMPLETE: 'incomplete' } as const)[p];

/**
 * Read the current period from a Stripe subscription. Newer Stripe API versions
 * moved `current_period_start/end` onto the subscription ITEMS; older ones keep
 * them on the subscription. Read either, defensively.
 */
function subPeriod(sub: Stripe.Subscription): { start: Date | null; end: Date | null } {
  const item = sub.items?.data?.[0] as unknown as { current_period_start?: number; current_period_end?: number } | undefined;
  const s = sub as unknown as { current_period_start?: number; current_period_end?: number };
  const startUnix = item?.current_period_start ?? s.current_period_start;
  const endUnix = item?.current_period_end ?? s.current_period_end;
  return {
    start: startUnix ? new Date(startUnix * 1000) : null,
    end: endUnix ? new Date(endUnix * 1000) : null,
  };
}

/** Map a Stripe subscription.status to our lifecycle status. */
function mapStripeStatus(s: Stripe.Subscription.Status): PrismaStatus {
  switch (s) {
    case 'trialing':
      return 'TRIALING';
    case 'active':
      return 'ACTIVE';
    case 'past_due':
      return 'PAST_DUE';
    case 'canceled':
      return 'CANCELED';
    default:
      return 'INCOMPLETE'; // unpaid / incomplete / incomplete_expired / paused
  }
}

const ok = (data?: unknown, message?: string) => ({ success: true, statusCode: HttpStatus.OK, data, message });
const fail = (statusCode: number, message: string) => ({ success: false, statusCode, message });

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  // ── debounced seat reconciliation ────────────────────────────────────────────
  // Coalesce a burst of member add/remove/access changes into ONE Stripe sync
  // (one proration event) instead of one per change. Keyed by org; the timer is
  // unref'd so it never keeps the process alive.
  private readonly reconcileTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static readonly RECONCILE_DEBOUNCE_MS = 6000;

  /** Debounced entry point called on every member/seat change — returns at once. */
  scheduleReconcile(organizationId: string) {
    const existing = this.reconcileTimers.get(organizationId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.reconcileTimers.delete(organizationId);
      this.reconcileSeats(organizationId).catch((e) =>
        this.logger.error(`Seat reconcile failed for org ${organizationId}: ${(e as Error).message}`),
      );
    }, BillingService.RECONCILE_DEBOUNCE_MS);
    if (typeof timer.unref === 'function') timer.unref();
    this.reconcileTimers.set(organizationId, timer);
    return ok(undefined, 'scheduled');
  }

  // ── seat counting ──────────────────────────────────────────────────────────
  private async countOrgSeats(organizationId: string): Promise<SeatCounts> {
    const users = await this.prisma.user.findMany({
      where: { organizationId, isActive: true },
      select: { role: true, isActive: true, enabledModules: true },
    });
    return countSeats(users);
  }

  // ── trial (called on org creation) ───────────────────────────────────────────
  /** Start the 14-day trial for a fresh org (top self-serve tier, no card). */
  async startTrial(organizationId: string) {
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
    const seats = await this.countOrgSeats(organizationId);
    await this.prisma.$transaction([
      this.prisma.organization.update({
        where: { id: organizationId },
        data: {
          planTier: 'PROFESSIONAL',
          subStatus: 'TRIALING',
          billingInterval: 'MONTHLY',
          trialEndsAt,
          enabledModules: modulesForTier('professional'),
        },
      }),
      this.prisma.subscription.upsert({
        where: { organizationId },
        create: {
          organizationId,
          planTier: 'PROFESSIONAL',
          status: 'TRIALING',
          interval: 'MONTHLY',
          officeSeats: seats.office,
          fieldSeats: seats.field,
          trialEndsAt,
        },
        update: {},
      }),
    ]);
    return ok();
  }

  // ── read ─────────────────────────────────────────────────────────────────────
  async getSubscription(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { subscription: true },
    });
    if (!org) return fail(HttpStatus.NOT_FOUND, 'Organization not found');

    const status = statusFromPrisma(org.subStatus);
    const tier = tierFromPrisma(org.planTier);
    const interval = intervalFromPrisma(org.billingInterval);
    const seats: SeatCounts = org.subscription
      ? { office: org.subscription.officeSeats, field: org.subscription.fieldSeats, total: org.subscription.officeSeats + org.subscription.fieldSeats }
      : await this.countOrgSeats(organizationId);

    const view: SubscriptionView = {
      planTier: tier,
      status,
      interval,
      officeSeats: seats.office,
      fieldSeats: seats.field,
      totalCents: tier ? subscriptionTotalCents(tier, interval, seats.office, seats.field) : null,
      trialEndsAt: org.trialEndsAt ? org.trialEndsAt.toISOString() : null,
      currentPeriodEnd: org.currentPeriodEnd ? org.currentPeriodEnd.toISOString() : null,
      cancelAtPeriodEnd: org.cancelAtPeriodEnd,
      locked: isLocked(status),
      trialDaysLeft: trialDaysLeft(org.trialEndsAt, new Date()),
    };
    return ok(view);
  }

  // ── checkout / portal ─────────────────────────────────────────────────────────
  async createCheckout(organizationId: string, req: CheckoutRequest, successUrl: string, cancelUrl: string) {
    if (!this.stripe.isConfigured) return fail(HttpStatus.SERVICE_UNAVAILABLE, 'Billing is not configured');
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) return fail(HttpStatus.NOT_FOUND, 'Organization not found');

    const customerId = await this.stripe.ensureCustomer({
      customerId: org.stripeCustomerId,
      email: org.billingEmail ?? org.email,
      name: org.name,
      orgId: organizationId,
    });
    if (customerId !== org.stripeCustomerId) {
      await this.prisma.organization.update({ where: { id: organizationId }, data: { stripeCustomerId: customerId } });
    }

    const seats = await this.countOrgSeats(organizationId);
    const trialEnd = org.subStatus === 'TRIALING' && org.trialEndsAt ? Math.floor(org.trialEndsAt.getTime() / 1000) : null;

    const session = await this.stripe.createCheckoutSession({
      customerId,
      tier: req.tier,
      interval: req.interval,
      officeSeats: seats.office,
      fieldSeats: seats.field,
      successUrl,
      cancelUrl,
      trialEnd,
    });
    return ok({ url: session.url });
  }

  async createPortal(organizationId: string, returnUrl: string) {
    if (!this.stripe.isConfigured) return fail(HttpStatus.SERVICE_UNAVAILABLE, 'Billing is not configured');
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org?.stripeCustomerId) return fail(HttpStatus.BAD_REQUEST, 'No billing account yet');
    const session = await this.stripe.createPortalSession(org.stripeCustomerId, returnUrl);
    return ok({ url: session.url });
  }

  // ── change plan / cancel ───────────────────────────────────────────────────────
  async changePlan(organizationId: string, req: ChangePlanRequest, successUrl: string, cancelUrl: string) {
    // No active Stripe subscription yet → this is effectively a first checkout.
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, include: { subscription: true } });
    if (!org) return fail(HttpStatus.NOT_FOUND, 'Organization not found');
    if (!org.subscription?.stripeSubscriptionId) {
      return this.createCheckout(organizationId, req, successUrl, cancelUrl);
    }
    // Active subscription: swap prices via the Customer Portal is safest; expose portal.
    // (A direct in-app upgrade with proration can be added; portal covers it for launch.)
    return this.createPortal(organizationId, successUrl);
  }

  async cancel(organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, include: { subscription: true } });
    if (!org) return fail(HttpStatus.NOT_FOUND, 'Organization not found');
    if (org.subscription?.stripeSubscriptionId && this.stripe.isConfigured) {
      await this.stripe.cancelAtPeriodEnd(org.subscription.stripeSubscriptionId);
    }
    await this.prisma.organization.update({ where: { id: organizationId }, data: { cancelAtPeriodEnd: true } });
    await this.prisma.subscription.updateMany({ where: { organizationId }, data: { cancelAtPeriodEnd: true } });
    return ok(undefined, 'Subscription will cancel at period end');
  }

  // ── seat reconciliation (debounced target — runs once per burst) ───────────────
  async reconcileSeats(organizationId: string) {
    const seats = await this.countOrgSeats(organizationId);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, include: { subscription: true } });
    if (!org?.subscription) {
      return ok(seats);
    }
    const sub = org.subscription;
    const changed = sub.officeSeats !== seats.office || sub.fieldSeats !== seats.field;

    // Nothing to do — many member edits (rename, schedule) don't touch seat
    // counts, so we skip the DB write AND the Stripe round-trip entirely.
    if (!changed) return ok(seats);

    await this.prisma.subscription.update({
      where: { organizationId },
      data: { officeSeats: seats.office, fieldSeats: seats.field },
    });

    // Push the new quantities to Stripe only when there's a live subscription and
    // the count actually changed.
    if (sub.stripeSubscriptionId && this.stripe.isConfigured && sub.planTier !== 'ENTERPRISE') {
      const tier = tierFromPrisma(sub.planTier)!;
      const interval = intervalFromPrisma(sub.interval);

      // Charge immediately only for an annual INCREASE (a mid-year added seat).
      // Annual DECREASES and all monthly changes bank the proration → the credit
      // (or charge) lands on the next invoice/renewal.
      const oldTotal = subscriptionTotalCents(tier, interval, sub.officeSeats, sub.fieldSeats) ?? 0;
      const newTotal = subscriptionTotalCents(tier, interval, seats.office, seats.field) ?? 0;
      const invoiceNow = interval === 'annual' && newTotal > oldTotal;

      await this.stripe.setSubscriptionQuantities(
        sub.stripeSubscriptionId,
        {
          officePriceId: this.stripe.priceId('office', tier, interval),
          officeQty: seats.office,
          fieldPriceId: this.stripe.priceId('field', tier, interval),
          fieldQty: seats.field,
        },
        { invoiceNow },
      );
    }
    return ok(seats);
  }

  // ── webhook (verified event applied idempotently) ──────────────────────────────
  async applyWebhook(rawBody: string, signature: string) {
    if (!this.stripe.isConfigured) return fail(HttpStatus.SERVICE_UNAVAILABLE, 'Billing not configured');
    let event: Stripe.Event;
    try {
      event = this.stripe.constructEvent(rawBody, signature);
    } catch (err) {
      this.logger.warn(`Stripe webhook signature verification failed: ${(err as Error).message}`);
      return fail(HttpStatus.BAD_REQUEST, 'Invalid signature');
    }

    // Idempotency: skip if already processed.
    const seen = await this.prisma.billingEvent.findUnique({ where: { stripeEventId: event.id } }).catch(() => null);
    if (seen?.processedAt) return ok(undefined, 'duplicate');

    let organizationId: string | null = null;
    try {
      organizationId = await this.handleEvent(event);
    } catch (err) {
      this.logger.error(`Failed to apply webhook ${event.type} (${event.id}): ${(err as Error).message}`);
      // Record but leave unprocessed so Stripe retries.
      await this.prisma.billingEvent.upsert({
        where: { stripeEventId: event.id },
        create: { stripeEventId: event.id, type: event.type, organizationId },
        update: {},
      });
      return fail(HttpStatus.INTERNAL_SERVER_ERROR, 'processing failed');
    }

    await this.prisma.billingEvent.upsert({
      where: { stripeEventId: event.id },
      create: { stripeEventId: event.id, type: event.type, organizationId, processedAt: new Date() },
      update: { processedAt: new Date(), organizationId: organizationId ?? undefined },
    });
    return ok();
  }

  /** Returns the affected organizationId (for the audit row). */
  private async handleEvent(event: Stripe.Event): Promise<string | null> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const subId = typeof s.subscription === 'string' ? s.subscription : s.subscription?.id;
        if (subId) {
          const sub = await this.stripe.getSubscription(subId);
          return this.syncSubscription(sub);
        }
        return this.orgIdByCustomer(s.customer);
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        return this.syncSubscription(event.data.object as Stripe.Subscription);
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        return this.setStatusByCustomer(inv.customer, 'PAST_DUE');
      }
      case 'invoice.paid': {
        const inv = event.data.object as Stripe.Invoice;
        return this.setStatusByCustomer(inv.customer, 'ACTIVE');
      }
      default:
        return null;
    }
  }

  private async orgIdByCustomer(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): Promise<string | null> {
    const customerId = typeof customer === 'string' ? customer : customer?.id;
    if (!customerId) return null;
    const org = await this.prisma.organization.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } });
    return org?.id ?? null;
  }

  private async setStatusByCustomer(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null, status: PrismaStatus): Promise<string | null> {
    const orgId = await this.orgIdByCustomer(customer);
    if (!orgId) return null;
    await this.prisma.organization.update({ where: { id: orgId }, data: { subStatus: status } });
    await this.prisma.subscription.updateMany({ where: { organizationId: orgId }, data: { status } });
    return orgId;
  }

  /** Persist everything derived from a Stripe Subscription object. */
  private async syncSubscription(sub: Stripe.Subscription): Promise<string | null> {
    const orgId = await this.orgIdByCustomer(sub.customer);
    if (!orgId) return null;

    const status = mapStripeStatus(sub.status);
    const officeSeats = sub.items.data.reduce((n, i) => n + (i.quantity ?? 0), 0); // refined below
    // Derive office/field seats from item metadata if present; else keep DB counts.
    const { start: periodStart, end: periodEnd } = subPeriod(sub);
    const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;

    // AUTHORITATIVE tier/interval = what the customer actually pays for, resolved
    // from the subscription's Stripe price IDs. This is the ONLY correct source —
    // reading the denormalized org.planTier would let a Starter buyer keep the
    // trial's Professional entitlements (payment ≠ entitlement). Fall back to the
    // stored tier only when no known price matches (e.g. Enterprise/custom).
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { planTier: true } });
    const resolved = this.stripe.resolveTierInterval(sub);
    const tier = resolved?.tier ?? tierFromPrisma(org?.planTier ?? null);
    const prismaTier: PrismaTier = tier ? (tier.toUpperCase() as PrismaTier) : (org?.planTier ?? 'PROFESSIONAL');
    const prismaInterval: PrismaInterval = resolved ? INTERVAL_TO_PRISMA[resolved.interval] : 'MONTHLY';

    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        planTier: prismaTier,
        billingInterval: prismaInterval,
        subStatus: status,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        trialEndsAt: trialEnd,
        ...(tier ? { enabledModules: modulesForTier(tier) } : {}),
      },
    });
    await this.prisma.subscription.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        stripeSubscriptionId: sub.id,
        planTier: prismaTier,
        status,
        interval: prismaInterval,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        trialEndsAt: trialEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        canceledAt: status === 'CANCELED' ? new Date() : null,
      },
      update: {
        stripeSubscriptionId: sub.id,
        planTier: prismaTier,
        interval: prismaInterval,
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
    return orgId;
  }
}
