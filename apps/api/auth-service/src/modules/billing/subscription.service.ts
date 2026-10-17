import { Injectable, HttpStatus } from '@nestjs/common';
import type Stripe from 'stripe';
import { stripeLinesForBill, billsThroughStripe, type BillingMode, isLocked, trialDaysLeft } from '@hbcfield/shared';
import type { SubscriptionView } from '@hbcfield/shared';
import { statusFromPrisma, ok, fail } from './billing-helpers';
import { BillingBase } from './billing.base';

/** The customer's subscription: its status, checkout, the Stripe portal, cancelling. */
@Injectable()
export class SubscriptionService extends BillingBase {
  // ── read ─────────────────────────────────────────────────────────────────────
  /**
   * Subscription STATUS — the Stripe side only.
   *
   * What it costs lives in `getBill`, deliberately separate: they answer
   * different questions and change at different times. Switching a module on
   * moves the bill and not the status; a failed card moves the status and not
   * the bill.
   */
  async getSubscription(organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, include: { subscription: true } });
    if (!org) return fail(HttpStatus.NOT_FOUND, 'Organization not found');

    const status = statusFromPrisma(org.subStatus);
    const seats =
      org.subscription?.officeSeats ?? (await this.prisma.user.count({ where: { organizationId, isActive: true } }));

    const view: SubscriptionView = {
      status,
      seats,
      // What was last actually billed, rather than a figure recomputed here —
      // a second implementation of the bill is a second answer.
      totalCents: org.subscription?.lastBilledCents ?? null,
      // The Stripe id, not the amount: the row exists from the moment the trial
      // starts, and its `lastBilledCents` is 0 until something is billed.
      hasBillingAccount: !!org.subscription?.stripeSubscriptionId,
      trialEndsAt: org.trialEndsAt ? org.trialEndsAt.toISOString() : null,
      currentPeriodEnd: org.currentPeriodEnd ? org.currentPeriodEnd.toISOString() : null,
      cancelAtPeriodEnd: org.cancelAtPeriodEnd,
      locked: isLocked(status),
      trialDaysLeft: trialDaysLeft(org.trialEndsAt, new Date()),
      billedExternally: org.billedExternally,
      billingMode: org.billingMode as BillingMode,
      invoiceDueDays: org.invoiceDueDays,
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
   * them. There is no interval to pick either: billing is monthly. So the call
   * takes no body at all.
   *
   * The line-up is computed at this moment rather than trusted from the client:
   * a body that could name its own lines would let a customer subscribe to a
   * cheaper bill than the one they are using.
   */
  async createCheckout(organizationId: string, successUrl: string, cancelUrl: string) {
    if (!this.stripe.isConfigured) return fail(HttpStatus.SERVICE_UNAVAILABLE, 'Billing is not configured');
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) return fail(HttpStatus.NOT_FOUND, 'Organization not found');
    /*
      EXTERNAL is the only mode with nothing to check out.

      INVOICE still goes through Checkout — Stripe needs the subscription, the
      tax details and the VAT id exactly as it does for a card; it simply
      collects by sending an invoice afterwards instead of charging. Refusing
      here on `billedExternally` would have blocked that, which is why the mode
      is read rather than the old boolean.
    */
    if (!billsThroughStripe(org.billingMode)) {
      return fail(HttpStatus.CONFLICT, 'This organization is billed by agreement — talk to us rather than paying by card.');
    }

    const bill = await this.bill.compute(organizationId);
    const lines = stripeLinesForBill(bill);
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
      // Only the invoice path needs this — Checkout collects its own — but a
      // customer created with an address is correct either way.
      address: {
        line1: org.addressLine1 ?? org.address,
        line2: org.addressLine2,
        city: org.city,
        postal_code: org.postalCode,
        country: org.country,
      },
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

    /*
      INVOICE mode never opens Checkout.

      Checkout in subscription mode always collects a payment method, which is
      exactly wrong for a customer whose accounts department pays by transfer:
      they would hand over a card that is then never charged. The subscription
      is created through the API instead, where send_invoice is accepted, and
      Stripe issues and emails the first invoice itself.

      Nothing to redirect to, so no url comes back — the caller reloads and the
      page shows the subscription that now exists.
    */
    if (org.billingMode === 'INVOICE') {
      /*
        Refused here, in our words, rather than by Stripe in its own.

        Without a country `automatic_tax` fails with "The customer's location
        isn't recognized. Set a valid customer address..." — accurate, and it
        names neither the organization nor the screen that fixes it. Checkout
        never has this problem because it collects an address itself; the
        invoice flow has to be given one.
      */
      if (!org.country) {
        return fail(
          HttpStatus.BAD_REQUEST,
          'Add this organization’s address — country included — in Settings → General before invoicing it. Tax cannot be calculated without it.',
        );
      }
      try {
        const created = await this.stripeLines.createInvoiceSubscription({
          customerId,
          lines,
          invoiceDueDays: org.invoiceDueDays,
          ...(trialDays > 0 ? { trialDays } : {}),
        });
        /*
          Record it NOW rather than waiting for the webhook.

          `stripeSubscriptionId` and the status are what the page reads to decide
          between "Start monthly invoicing" and "Payment & invoices". The webhook
          writes them, and it arrives after the caller has already reloaded — so
          the button stayed on the old answer until somebody refreshed again,
          which reads as the action not having worked.

          The webhook is for changes made OUTSIDE the app. This one we made, and
          we are holding the subscription object. Same `syncSubscription` either
          way, which is idempotent, so the webhook landing a second later writes
          the same thing and nothing is duplicated.
        */
        await this.syncSubscription(created);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.error(`Invoice subscription failed for org ${organizationId}: ${message}`);
        return fail(HttpStatus.BAD_GATEWAY, `Stripe could not start the subscription: ${message}`);
      }
      await this.prisma.subscription.updateMany({
        where: { organizationId },
        data: { lastBilledCents: bill.monthlyCents },
      });
      return ok({ url: undefined });
    }

    /*
      Wrapped, because a Stripe rejection here reached the customer as a bare
      "Internal server error" with nothing written to any log. The cause was a
      parameter Stripe refuses; finding it took a reproduction against the live
      API rather than a stack trace, which is the wrong way round.
    */
    let session: Stripe.Checkout.Session;
    try {
      session = await this.stripeLines.createCheckoutSessionForLines({
        customerId,
        lines,
        successUrl,
        cancelUrl,
        ...(trialDays > 0 ? { trialDays } : {}),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(`Checkout failed for org ${organizationId}: ${message}`);
      return fail(HttpStatus.BAD_GATEWAY, `Stripe could not start checkout: ${message}`);
    }

    await this.prisma.subscription.updateMany({
      where: { organizationId },
      data: { lastBilledCents: bill.monthlyCents },
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

  /*
    THERE IS NO `changePlan`.

    It existed for one purpose — switching between monthly and annual — and
    annual is gone. Everything else about the bill changes by switching a module
    on or off where it lives, which reconciles on its own. Leaving an endpoint
    whose only argument no longer has two values would be an endpoint that
    cannot do anything.
  */

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
}
