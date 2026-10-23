import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { stripeLinesForBill, isAddOn, ADD_ON_KEYS, billsThroughStripe, isMaterialDrop } from '@hbcfield/shared';
import { ok, fail } from './billing-helpers';
import { PrismaService } from '@hbcfield/shared';
import { StripeService } from './stripe.service';
import { OrgBillService } from './org-bill.service';
import { StripeLinesService } from './stripe-lines.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly bill: OrgBillService,
    private readonly stripeLines: StripeLinesService,
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

    /*
      Billed by agreement — never charge automatically.

      Checked BEFORE anything else, and before any Stripe call. Without this the
      hazard is silent: attach a card to a contract customer for any reason and
      the next member they add would sync a full subscription and start billing
      them the computed amount. Refusing here means that cannot happen by
      accident, only by deliberately clearing the flag.
    */
    /*
      EXTERNAL never reaches Stripe. INVOICE does — its subscription is real and
      must track seats and modules like any other; the difference is only how it
      is collected, which is set on the subscription itself.
    */
    if (org && !billsThroughStripe(org.billingMode)) return ok(bill);

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

    const lines = stripeLinesForBill(bill);

    /*
      Every change banks its proration onto the next invoice.

      With annual gone there is no case left for charging immediately: a monthly
      customer's next invoice is days away, so a mid-cycle increase is collected
      almost at once anyway, and banking a decrease lets the credit reduce that
      invoice instead of cutting a credit note nobody asked for. (The annual
      increase WAS the exception — waiting would have made a module switched on
      in February free until the following January.)
    */
    try {
      await this.stripeLines.setSubscriptionLines(sub.stripeSubscriptionId, lines, { invoiceNow: false });

      /*
        Revenue leaving is silent.

        An organization dropping from four workspaces to one is a €300/month
        loss that this method processes correctly, prorates fairly and never
        mentions — and nobody finds out until the renewal conversation, by which
        point the reason is a month cold.

        Recorded HERE, at the one moment both numbers are in hand: what they
        were billed and what they are about to be. A nightly job comparing
        totals would have to store yesterday's anyway, and would miss a drop
        that was reversed before it ran.

        Only for a MATERIAL fall (see isMaterialDrop) — an alert that fires when
        somebody removes one seat is ignored by the time one fires that matters.
      */
      const before = sub.lastBilledCents ?? 0;
      /*
        …but not when the fall IS the deal.

        Setting an agreed price takes a bill from €863 to €120 in one reconcile,
        which is a material drop by every measure — and alerting on it would
        report an operator's own deliberate act back to them as revenue leaving,
        thirty seconds after they pressed the button on a screen that showed them
        both numbers. Growth past the deal is watched instead, by the nightly
        sweep, which is where the interesting question actually lives.
      */
      const fallIsTheAgreement = bill.agreement != null && bill.monthlyCents === bill.agreement.monthlyCents;
      if (!fallIsTheAgreement && isMaterialDrop(before, bill.monthlyCents)) {
        await this.prisma.billingAlert.create({
          data: {
            organizationId,
            fromCents: before,
            toCents: bill.monthlyCents,
            dropCents: before - bill.monthlyCents,
          },
        });
        this.logger.warn(
          `[BILLING] Org ${organizationId} bill fell ${(before - bill.monthlyCents) / 100}€ ` +
            `(${before / 100}€ → ${bill.monthlyCents / 100}€)`,
        );
      }

      await this.prisma.subscription.update({
        where: { organizationId },
        data: { lastBilledCents: bill.monthlyCents },
      });
    } catch (e) {
      // Never let a billing sync take down the action that triggered it. A member
      // must still be addable when Stripe is unreachable; the next reconcile —
      // or the nightly one — repairs the subscription.
      this.logger.error(`Stripe reconcile failed for org ${organizationId}: ${(e as Error).message}`);
      /*
        …but somebody has to be told.

        Swallowing the error is right for the request and wrong for the
        business: the only trace was a log line nobody reads, so a subscription
        could drift for weeks while every screen looked healthy. This is the
        same blind spot the drop alert closed in the other direction.

        Deduped into ONE open row per organization. A failing sync retries on
        every member change, and an operator needs a row saying "47 times since
        Tuesday" rather than 47 rows saying the same thing — the second is a
        feed people learn to scroll past.

        Recording the failure must never fail the caller either, so it is
        wrapped: a database that cannot take the alert is not a reason to
        refuse the member who triggered it.
      */
      try {
        await this.recordSyncFailure(organizationId, (e as Error).message);
      } catch (inner) {
        this.logger.error(`Could not record billing sync failure: ${(inner as Error).message}`);
      }
    }

    return ok(bill);
  }

  /**
   * One open row per organization, counting up.
   *
   * `detail` is truncated: an error is a clue for a human, not a log file, and
   * a Stripe stack trace in a console table helps nobody.
   */
  private async recordSyncFailure(organizationId: string, message: string) {
    const detail = (message || 'Unknown error').slice(0, 300);
    const open = await this.prisma.billingAlert.findFirst({
      where: { organizationId, kind: 'SYNC_FAILED', acknowledgedAt: null },
      select: { id: true, occurrences: true },
    });
    if (open) {
      await this.prisma.billingAlert.update({
        where: { id: open.id },
        // The LATEST message: the first failure is often a symptom and the
        // current one is the cause.
        data: { occurrences: open.occurrences + 1, lastSeenAt: new Date(), detail },
      });
      return;
    }
    await this.prisma.billingAlert.create({
      data: { organizationId, kind: 'SYNC_FAILED', detail },
    });
    this.logger.warn(`[BILLING] Sync failure alert opened for org ${organizationId}`);
  }
}
