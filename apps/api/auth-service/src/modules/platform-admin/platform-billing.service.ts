import { Injectable, Logger } from '@nestjs/common';
import { StripeService } from '../billing/stripe.service';
import { BillingService } from '../billing/billing.service';
import { OrgBillService } from '../billing/org-bill.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, validateAgreedPrice, modeRequiresBillingEmail, formatCents, toISODateString } from '@hbcfield/shared';

/**
 * Operator billing: an organization's billing mode (card, invoice, agreement), and
 * an agreed price set or cleared.
 */
@Injectable()
export class PlatformBillingService {
  private readonly logger = new Logger(PlatformBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Moving a live subscription between collection methods — the one thing on
    // this console that reaches Stripe.
    private readonly stripe: StripeService,
    // What the price list says this organization owes — the number an agreed
    // price is struck against, and the baseline drift is later measured from.
    private readonly bill: OrgBillService,
    // Pushes a changed price to Stripe the moment it is agreed, rather than at
    // whatever the customer happens to do next.
    private readonly billing: BillingService,
  ) {}

  async setBillingMode(data: {
    organizationId: string;
    mode: 'AUTOMATIC' | 'INVOICE' | 'EXTERNAL';
    invoiceDueDays?: number;
    byUserId?: string;
  }) {
    const org = await this.prisma.organization.findUnique({
      where: { id: data.organizationId },
      select: {
        id: true, name: true, billingMode: true, billingEmail: true, email: true,
        stripeCustomerId: true,
        invoiceDueDays: true, subscription: { select: { stripeSubscriptionId: true } },
      },
    });
    if (!org) return { success: false, statusCode: 404, message: 'Organization not found' } as any;

    if (modeRequiresBillingEmail(data.mode) && !(org.billingEmail || org.email)) {
      return {
        success: false,
        statusCode: 400,
        message: 'Set a billing email on this organization before invoicing it — there is nowhere to send the invoice.',
      } as any;
    }

    // 1–365: a term of zero is due immediately (which is not an invoice) and a
    // term of years is a data-entry slip nobody would notice.
    const dueDays = Math.max(1, Math.min(365, Math.floor(data.invoiceDueDays ?? org.invoiceDueDays ?? 14)));

    const subId = org.subscription?.stripeSubscriptionId;
    const method = data.mode === 'AUTOMATIC' ? 'charge_automatically' : data.mode === 'INVOICE' ? 'send_invoice' : null;

    /*
      Moving to CARD needs a card.

      Stripe accepts the switch whether or not one exists, and then the next
      invoice fails and the organization lands in past_due — days later, for a
      change an operator made on their behalf, announced by a dunning email.

      An invoice customer has never been asked for one: their flow deliberately
      collects no payment method. So this is the normal case, not the edge one,
      and it is refused with the thing that fixes it.
    */
    if (data.mode === 'AUTOMATIC' && subId && org.stripeCustomerId && this.stripe.isConfigured) {
      const payable = await this.stripe.hasPaymentMethod(org.stripeCustomerId).catch(() => true);
      if (!payable) {
        return {
          success: false,
          statusCode: 400,
          message:
            'This organization has no card on file, so charging automatically would fail at the next invoice. Ask an admin to add one from Billing → Payment & invoices first.',
        } as any;
      }
    }

    if (subId && method && this.stripe.isConfigured) {
      try {
        await this.stripe.setCollectionMethod(subId, method, dueDays);
      } catch (e) {
        this.logger.error(`[PLATFORM] Stripe refused collection method ${method} for org ${org.id}: ${String(e)}`);
        return {
          success: false,
          statusCode: 502,
          message: `Stripe refused the change: ${e instanceof Error ? e.message : 'unknown error'}`,
        } as any;
      }
    }

    await this.prisma.organization.update({
      where: { id: org.id },
      data: {
        billingMode: data.mode,
        invoiceDueDays: dueDays,
        billedExternally: data.mode === 'EXTERNAL',
      },
    });

    this.logger.warn(
      `[PLATFORM] Org "${org.name}" (${org.id}) billing mode ${org.billingMode} → ${data.mode}` +
        `${data.mode === 'INVOICE' ? ` (due in ${dueDays}d)` : ''} by ${data.byUserId ?? 'operator'}`,
    );
    return success({ id: org.id, billingMode: data.mode, invoiceDueDays: dueDays });
  }

  /**
   * Agree a fixed monthly price with one organization.
   *
   * The most powerful control on this console: it decides what a real customer
   * is charged, directly, with no computation between the operator's keystroke
   * and the invoice. So it is written to refuse rather than to interpret.
   *
   * SECURITY. Reached only through the platform-admin gate, and there is no
   * customer-facing route anywhere that writes these columns — an organization's
   * own admin reads their agreed price on their billing page and cannot
   * influence it. `byUserId` is the operator, recorded with the row; it is never
   * taken from the request body.
   */
  async setAgreedPrice(data: {
    organizationId: string;
    monthlyCents: number;
    until?: string | null;
    note?: string | null;
    byUserId?: string;
  }) {
    const org = await this.prisma.organization.findUnique({
      where: { id: data.organizationId },
      select: { id: true, name: true, agreedMonthlyCents: true },
    });
    if (!org) return { success: false, statusCode: 404, message: 'Organization not found' } as any;

    const parsed = validateAgreedPrice(data);
    if (!parsed.ok) return { success: false, statusCode: 400, message: parsed.message } as any;

    /*
      The list price AT THIS MOMENT, stored with the deal.

      This is the baseline the drift alert measures against, and it can only be
      captured here — a month from now nobody can reconstruct what the bill came
      to on the day the price was agreed. Computed from the live bill rather than
      taken from the request, so what is recorded is what the system believes and
      not what a stale screen sent.

      Deliberately BEFORE the price is written, so `compute` still returns the
      list price rather than the agreement about to replace it.
    */
    const listCents = (await this.bill.compute(org.id)).listMonthlyCents;

    await this.prisma.organization.update({
      where: { id: org.id },
      data: {
        agreedMonthlyCents: parsed.monthlyCents,
        agreedListCents: listCents,
        agreedUntil: parsed.until,
        agreedNote: parsed.note,
        agreedSetAt: new Date(),
        agreedSetById: data.byUserId ?? null,
      },
    });

    /*
      Push it to Stripe now, not at the next member change.

      An agreed price that only took effect the next time somebody was added
      would leave the operator reading €120 on this console while the customer is
      invoiced €863 — the exact disagreement this billing system exists to make
      impossible. reconcileSeats swallows Stripe failures and records them as an
      alert, so a Stripe outage cannot lose the agreement itself.
    */
    await this.billing.reconcileSeats(org.id).catch((e) =>
      this.logger.error(`[PLATFORM] Agreed price stored but Stripe sync failed for ${org.id}: ${String(e)}`),
    );

    this.logger.warn(
      `[PLATFORM] Org "${org.name}" (${org.id}) agreed price ` +
        `${org.agreedMonthlyCents == null ? 'set' : 'changed'} to ${formatCents(parsed.monthlyCents, 'EUR')} ` +
        `(list ${formatCents(listCents, 'EUR')})${parsed.until ? ` until ${toISODateString(parsed.until)}` : ''} ` +
        `by ${data.byUserId ?? 'operator'}`,
    );
    return success({
      id: org.id,
      agreedMonthlyCents: parsed.monthlyCents,
      agreedListCents: listCents,
      agreedUntil: parsed.until,
    });
  }

  /**
   * Put an organization back on the price list.
   *
   * This can multiply what a customer pays — 120 back to 863 — so it is a
   * deliberate, confirmed act on the console rather than something that happens
   * to a date. Any open drift or expiry alert is closed with it: the alert asked
   * a question, and this is an answer.
   */
  async clearAgreedPrice(data: { organizationId: string; byUserId?: string }) {
    const org = await this.prisma.organization.findUnique({
      where: { id: data.organizationId },
      select: { id: true, name: true, agreedMonthlyCents: true },
    });
    if (!org) return { success: false, statusCode: 404, message: 'Organization not found' } as any;
    if (org.agreedMonthlyCents == null) return success({ id: org.id, agreedMonthlyCents: null });

    await this.prisma.organization.update({
      where: { id: org.id },
      data: {
        agreedMonthlyCents: null, agreedListCents: null, agreedUntil: null,
        agreedNote: null, agreedSetAt: null, agreedSetById: null,
      },
    });
    await this.prisma.billingAlert.updateMany({
      where: {
        organizationId: org.id,
        kind: { in: ['CONTRACT_DRIFT', 'CONTRACT_EXPIRING'] },
        acknowledgedAt: null,
      },
      data: { acknowledgedAt: new Date(), acknowledgedBy: data.byUserId ?? 'operator' },
    });
    await this.billing.reconcileSeats(org.id).catch((e) =>
      this.logger.error(`[PLATFORM] Agreed price cleared but Stripe sync failed for ${org.id}: ${String(e)}`),
    );

    this.logger.warn(
      `[PLATFORM] Org "${org.name}" (${org.id}) agreed price REMOVED ` +
        `(was ${formatCents(org.agreedMonthlyCents, 'EUR')}) by ${data.byUserId ?? 'operator'}`,
    );
    return success({ id: org.id, agreedMonthlyCents: null });
  }
}
