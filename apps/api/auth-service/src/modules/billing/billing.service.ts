import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type Stripe from 'stripe';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StripeService } from './stripe.service';
import { OrgBillService } from './org-bill.service';
import {
  stripeLinesForBill,
  isAddOn,
  ADD_ON_KEYS,
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

  async adminSetOrgTier(data: { organizationId: string; tier: PlanTier }) {
    const org = await this.prisma.organization.findUnique({
      where: { id: data.organizationId },
      select: { id: true, name: true },
    });
    if (!org) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Organization not found' };
    }
    const updated = await this.prisma.organization.update({
      where: { id: data.organizationId },
      data: {
        planTier: TIER_TO_PRISMA[data.tier],
        subStatus: 'ACTIVE',
        enabledModules: modulesForTier(data.tier),
        trialEndsAt: null,
      },
      select: { id: true, name: true, planTier: true, subStatus: true },
    });
    this.logger.warn(`[PLATFORM] Org "${org.name}" (${org.id}) set to ${updated.planTier} by operator`);
    return { success: true, data: updated };
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly bill: OrgBillService,
  ) {}

  // ── the module model ─────────────────────────────────────────────────────────

  /**
   * The whole bill, itemised: seats, every space's modules and ladders, and the
   * organization's add-ons.
   *
   * The SAME object the Stripe sync is built from, which is the point — the old
   * model let the screen compute a price from a tier table while Stripe was told
   * something assembled separately, and only an invoice would show they had
   * disagreed.
   */
  async getBill(organizationId: string) {
    return ok(await this.bill.compute(organizationId));
  }

  /**
   * Set which capabilities the organization has bought.
   *
   * The list is REPLACED, not merged: "these are the add-ons I want" is a single
   * decision an admin makes on one screen, and a merge would make removing one
   * impossible through the same call that adds one.
   *
   * Every key is validated against the catalogue. An unknown key is refused
   * rather than stored and ignored — stored, it would sit on the organization
   * looking like an entitlement, and the day somebody adds a real add-on with
   * that name it would silently become one.
   *
   * `organizationId` comes from the caller's token at the gateway, never from
   * the body, so an admin cannot buy add-ons for another tenant.
   */
  async setAddOns(organizationId: string, keys: string[]) {
    if (!Array.isArray(keys)) return fail(HttpStatus.BAD_REQUEST, 'addOns must be an array');

    const unknown = keys.filter((k) => typeof k !== 'string' || !isAddOn(k));
    if (unknown.length) {
      return fail(HttpStatus.BAD_REQUEST, `Not an add-on: ${unknown.join(', ')}. Known: ${ADD_ON_KEYS.join(', ')}`);
    }

    // Deduplicated and ordered, so the stored value is comparable between
    // requests and an invoice line cannot appear twice.
    const addOns = [...new Set(keys)].sort();

    const org = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { addOns },
      select: { id: true, addOns: true },
    });

    // The bill changed, so Stripe has to be told. Debounced with the seat sync:
    // toggling four add-ons on one screen is one proration, not four.
    this.scheduleReconcile(organizationId);

    this.logger.log(`Org ${organizationId} add-ons set to [${addOns.join(', ')}]`);
    return ok(org.addOns, 'Add-ons updated');
  }

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
    const [org, users] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { usesExternalWorkers: true },
      }),
      this.prisma.user.findMany({
        where: { organizationId, isActive: true },
        select: { role: true, isActive: true, enabledModules: true, employmentType: true },
      }),
    ]);
    // Only split field seats into in-house/external when the org opted in;
    // otherwise every field seat bills at the standard rate.
    return countSeats(users, { usesExternalWorkers: org?.usesExternalWorkers ?? false });
  }

  // ── trial (called on org creation) ───────────────────────────────────────────
  /** Start the 14-day trial for a fresh org (top self-serve tier, no card). */
  async startTrial(organizationId: string) {
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
    // 1) Set the TIER on the org first and independently. This is the single
    //    value PlanGuard reads, so it must land durably — a fresh org can never
    //    be left on a null tier (which would 402 every premium feature). Kept
    //    OUT of the transaction below so a subscription-row hiccup can't roll it
    //    back into a hard lockout.
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        planTier: 'PROFESSIONAL',
        subStatus: 'TRIALING',
        billingInterval: 'MONTHLY',
        trialEndsAt,
        enabledModules: modulesForTier('professional'),
      },
    });
    // 2) Seat-accurate subscription row — best-effort. If seat counting or the
    //    upsert fails the org still has a working trial tier; the row is
    //    reconciled on the next seat change / checkout anyway.
    try {
      const seats = await this.countOrgSeats(organizationId);
      await this.prisma.subscription.upsert({
        where: { organizationId },
        create: {
          organizationId,
          planTier: 'PROFESSIONAL',
          status: 'TRIALING',
          interval: 'MONTHLY',
          officeSeats: seats.office,
          fieldSeats: seats.field,
          fieldInhouseSeats: seats.fieldInhouse,
          trialEndsAt,
        },
        update: {},
      });
    } catch (e) {
      this.logger.warn(
        `startTrial: tier set but subscription row upsert failed for org ${organizationId}: ${(e as Error).message}`,
      );
    }
    return ok();
  }

  /**
   * Hourly sweep: lock "no-card" trials whose 14-day window has ended.
   *
   * Orgs that entered a card have a Stripe subscription id, and their trial end is
   * governed by Stripe's own events (trial → active charge, or a cancel_at_period_end
   * → canceled) — we never touch those here. Only pure trials (no stripeSubscriptionId)
   * need this, because nothing else fires when their trial lapses. They're flipped to
   * INCOMPLETE ("Inactive"), which blocks writes via isLocked() until they subscribe;
   * data is preserved and access is restored the moment they check out.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireTrials() {
    const now = new Date();
    const expired = await this.prisma.organization.findMany({
      where: {
        subStatus: 'TRIALING',
        trialEndsAt: { lt: now },
        subscription: { is: { stripeSubscriptionId: null } },
      },
      select: { id: true },
    });
    if (expired.length === 0) return;
    const ids = expired.map((o) => o.id);
    await this.prisma.$transaction([
      this.prisma.organization.updateMany({
        where: { id: { in: ids } },
        data: { subStatus: 'INCOMPLETE' },
      }),
      this.prisma.subscription.updateMany({
        where: { organizationId: { in: ids } },
        data: { status: 'INCOMPLETE' },
      }),
    ]);
    this.logger.log(`Trial sweep: locked ${ids.length} expired no-card trial org(s)`);
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
      ? {
          office: org.subscription.officeSeats,
          field: org.subscription.fieldSeats,
          fieldInhouse: org.subscription.fieldInhouseSeats,
          total: org.subscription.officeSeats + org.subscription.fieldSeats + org.subscription.fieldInhouseSeats,
        }
      : await this.countOrgSeats(organizationId);

    const view: SubscriptionView = {
      planTier: tier,
      status,
      interval,
      officeSeats: seats.office,
      fieldSeats: seats.field,
      fieldInhouseSeats: seats.fieldInhouse,
      totalCents: tier ? subscriptionTotalCents(tier, interval, seats.office, seats.field, seats.fieldInhouse) : null,
      trialEndsAt: org.trialEndsAt ? org.trialEndsAt.toISOString() : null,
      currentPeriodEnd: org.currentPeriodEnd ? org.currentPeriodEnd.toISOString() : null,
      cancelAtPeriodEnd: org.cancelAtPeriodEnd,
      locked: isLocked(status),
      trialDaysLeft: trialDaysLeft(org.trialEndsAt, new Date()),
    };
    return ok(view);
  }

  // ── checkout / portal ─────────────────────────────────────────────────────────
  /**
   * Start Checkout for what the organization already has.
   *
   * There is nothing to pick. Under the tier model this call took a tier, because
   * the tier WAS the purchase; here the purchase is the seats, modules and
   * add-ons already switched on, and Checkout exists only to collect a card for
   * them. So the only choice left is monthly or annual.
   *
   * The line-up is computed at this moment rather than trusted from the client:
   * a body that could name its own lines would let a customer subscribe to a
   * cheaper bill than the one they are using.
   */
  async createCheckout(organizationId: string, req: { interval: BillingInterval }, successUrl: string, cancelUrl: string) {
    if (!this.stripe.isConfigured) return fail(HttpStatus.SERVICE_UNAVAILABLE, 'Billing is not configured');
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) return fail(HttpStatus.NOT_FOUND, 'Organization not found');

    const bill = await this.bill.compute(organizationId);
    const lines = stripeLinesForBill(bill, req.interval);
    if (!lines.length) {
      return fail(
        HttpStatus.BAD_REQUEST,
        'There is nothing to subscribe to yet — add a member, or switch a module on in a space.',
      );
    }

    const customerId = await this.stripe.ensureCustomer({
      customerId: org.stripeCustomerId,
      email: org.billingEmail ?? org.email,
      name: org.name,
      orgId: organizationId,
    });
    if (customerId !== org.stripeCustomerId) {
      await this.prisma.organization.update({ where: { id: organizationId }, data: { stripeCustomerId: customerId } });
    }

    // Carry the remaining trial across so subscribing early never costs somebody
    // days they were given.
    const trialDays =
      org.subStatus === 'TRIALING' && org.trialEndsAt
        ? Math.max(0, Math.ceil((org.trialEndsAt.getTime() - Date.now()) / 86_400_000))
        : 0;

    const session = await this.stripe.createCheckoutSessionForLines({
      customerId,
      lines,
      successUrl,
      cancelUrl,
      ...(trialDays > 0 ? { trialDays } : {}),
    });

    await this.prisma.subscription.updateMany({
      where: { organizationId },
      data: { interval: INTERVAL_TO_PRISMA[req.interval], lastBilledCents: bill.monthlyCents },
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
  /**
   * Switch between monthly and annual.
   *
   * All that is left of "change plan". There are no tiers to move between, and
   * the rest of the bill changes by switching modules on and off where they
   * live — this is the one billing choice that is not also a product choice.
   *
   * Every line moves together: a subscription holding a mix of monthly and
   * annual prices renews on two different clocks and is impossible to explain on
   * an invoice.
   */
  async changePlan(organizationId: string, req: { interval: BillingInterval }, successUrl: string, cancelUrl: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { subscription: true },
    });
    if (!org) return fail(HttpStatus.NOT_FOUND, 'Organization not found');

    // No subscription yet → this is a first checkout, not a change.
    if (!org.subscription?.stripeSubscriptionId) {
      return this.createCheckout(organizationId, req, successUrl, cancelUrl);
    }

    const bill = await this.bill.compute(organizationId);
    const lines = stripeLinesForBill(bill, req.interval);

    await this.prisma.subscription.update({
      where: { organizationId },
      data: { interval: INTERVAL_TO_PRISMA[req.interval], lastBilledCents: bill.monthlyCents },
    });

    // Switching TO annual is charged now: the customer is buying a year, and
    // banking that proration would give the year away and collect at renewal.
    await this.stripe.setSubscriptionLines(org.subscription.stripeSubscriptionId, lines, {
      invoiceNow: req.interval === 'annual',
    });

    return ok({ interval: req.interval }, 'Billing interval updated');
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
  /**
   * Make Stripe hold exactly what the organization now owes.
   *
   * Called (debounced) whenever anything that can move a bill moves: a member
   * added or removed, a module switched on in a space, an add-on bought, an
   * asset or client created. It used to be seats only — which is why it is still
   * named for them at the call sites — but under this model a module toggle
   * changes the bill just as much as a hire does.
   *
   * The line-up is recomputed from scratch rather than diffed, because working
   * out "what changed" is exactly the arithmetic that drifts. Stripe is told the
   * whole target and works out the proration itself.
   */
  async reconcileSeats(organizationId: string) {
    const bill = await this.bill.compute(organizationId);

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { subscription: true },
    });
    const sub = org?.subscription;
    if (!sub) return ok(bill);

    // Keep the stored seat count in step — the operator console and the trial
    // logic both read it, and it is the cheapest possible "has anything moved?".
    if (sub.officeSeats !== bill.seatCount) {
      await this.prisma.subscription.update({
        where: { organizationId },
        data: { officeSeats: bill.seatCount },
      });
    }

    if (!sub.stripeSubscriptionId || !this.stripe.isConfigured) return ok(bill);

    const interval = intervalFromPrisma(sub.interval);
    const lines = stripeLinesForBill(bill, interval);

    /*
      Charge immediately only for an annual INCREASE.

      Annual decreases and every monthly change bank the proration onto the next
      invoice — a monthly customer's next invoice is days away, and banking a
      decrease lets the credit reduce the renewal rather than cutting an
      immediate credit note. An annual increase is the one case where waiting
      would give away most of a year: without this, a module switched on in
      February is free until the following January.
    */
    const previous = sub.lastBilledCents ?? 0;
    const invoiceNow = interval === 'annual' && bill.monthlyCents > previous;

    try {
      await this.stripe.setSubscriptionLines(sub.stripeSubscriptionId, lines, { invoiceNow });
      await this.prisma.subscription.update({
        where: { organizationId },
        data: { lastBilledCents: bill.monthlyCents },
      });
    } catch (e) {
      // Never let a billing sync take down the action that triggered it. A member
      // must still be addable when Stripe is unreachable; the next reconcile —
      // or the nightly one — repairs the subscription.
      this.logger.error(`Stripe reconcile failed for org ${organizationId}: ${(e as Error).message}`);
    }

    return ok(bill);
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
