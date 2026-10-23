import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import type Stripe from 'stripe';
import { PrismaStatus, ok, fail } from './billing-helpers';
import { PrismaService } from '@hbcfield/shared';
import { StripeService } from './stripe.service';
import { SubscriptionSyncService } from './subscription-sync.service';

/** Stripe's webhook events, applied once each. */
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly subscriptions: SubscriptionSyncService,
  ) {}

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
          return this.subscriptions.syncSubscription(sub);
        }
        return this.subscriptions.orgIdByCustomer(s.customer);
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        return this.subscriptions.syncSubscription(event.data.object as Stripe.Subscription);
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

  private async setStatusByCustomer(
    customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
    status: PrismaStatus,
  ): Promise<string | null> {
    const orgId = await this.subscriptions.orgIdByCustomer(customer);
    if (!orgId) return null;
    await this.prisma.organization.update({ where: { id: orgId }, data: { subStatus: status } });
    await this.prisma.subscription.updateMany({ where: { organizationId: orgId }, data: { status } });
    return orgId;
  }
}
