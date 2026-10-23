import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  agreementFrom,
  agreementEndsWithin,
  isMaterialAgreementDrift,
  runWithCronLock,
  formatCents,
  toISODateString,
  PrismaService,
} from '@hbcfield/shared';
import { OrgBillService } from './org-bill.service';
import { BillingService } from './billing.service';

/**
 * The nightly sweep: usage-priced lines re-billed once a day, and agreed prices
 * checked against the list.
 */
@Injectable()
export class UsageSweepService {
  private readonly logger = new Logger(UsageSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bill: OrgBillService,
    private readonly billing: BillingService,
  ) {}

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
  /**
   * Sweep every paying organization's usage onto its subscription, nightly.
   *
   * Assets, clients and portals move the bill, but deliberately do NOT trigger a
   * sync each: adding fifty flats would be fifty Stripe prorations, and a
   * customer importing a spreadsheet would watch their invoice grow a line per
   * row. Seats, modules and add-ons sync immediately because those are decisions
   * somebody made on a screen; usage accrues, so it is settled once a day.
   *
   * Runs before most billing periods roll over, so what a customer is charged
   * reflects what they were actually holding.
   */
  /**
   * Cron entry point. The work is in reconcileUsageDaily(), which stays directly
   * callable — this only decides whether THIS replica is the one to run it.
  // Sweeps every org and talks to Stripe — running it twice would write subscription lines twice.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async reconcileUsageDailyCron(): Promise<void> {
    await runWithCronLock(
      this.prisma,
      { name: 'billing:reconcileUsageDaily', ttlSeconds: 1800, logger: this.logger },
      () => this.reconcileUsageDaily(),
    );
  }

  async reconcileUsageDaily() {
    const orgs = await this.prisma.organization.findMany({
      where: { subscription: { stripeSubscriptionId: { not: null } } },
      select: { id: true },
    });
    if (!orgs.length) return;

    let synced = 0;
    for (const org of orgs) {
      // Sequential on purpose. This is a background sweep with no deadline, and
      // firing every organization at Stripe at once is how an account meets its
      // rate limit at two in the morning.
      try {
        await this.billing.reconcileSeats(org.id);
        synced++;
      } catch (e) {
        this.logger.error(`Nightly usage reconcile failed for ${org.id}: ${(e as Error).message}`);
      }
    }
    this.logger.log(`Nightly usage reconcile: ${synced}/${orgs.length} organizations`);

    // Same sweep, different question: not "is Stripe in step?" but "does this
    // deal still make sense?". Kept out of the loop above because it must also
    // reach contracted organizations that have no Stripe subscription at all.
    await this.sweepAgreements().catch((e) => this.logger.error(`Agreement sweep failed: ${(e as Error).message}`));
  }

  /**
   * Watch the deals: has a contracted customer outgrown their price, and is a
   * term about to end?
   *
   * Nightly rather than on every change, deliberately. Neither question is
   * urgent — nobody acts on "they added a seat" — and computing a bill per
   * contracted organization on every member edit would be real work for an
   * answer that only matters once a day. The partial index means this reads the
   * contracted rows and not the table.
   *
   * Never throws into the sweep that calls it: an alert that cannot be written
   * is not a reason to fail the nightly reconcile.
   */
  async sweepAgreements() {
    const orgs = await this.prisma.organization.findMany({
      where: { agreedMonthlyCents: { not: null } },
      select: {
        id: true,
        name: true,
        agreedMonthlyCents: true,
        agreedListCents: true,
        agreedUntil: true,
        agreedNote: true,
        agreedSetAt: true,
        agreedSetById: true,
      },
    });
    if (!orgs.length) return;

    for (const org of orgs) {
      const agreement = agreementFrom(org);
      if (!agreement) continue;

      try {
        // The term first: it needs no bill, so an organization whose bill fails
        // to compute still gets its expiry warning.
        if (agreementEndsWithin(agreement)) {
          await this.openAgreementAlert(org.id, 'CONTRACT_EXPIRING', {
            fromCents: agreement.listCentsAtAgreement,
            toCents: agreement.monthlyCents,
            detail:
              `Agreed ${formatCents(agreement.monthlyCents)} ends ` +
              `${agreement.until ? toISODateString(new Date(agreement.until)) : 'unknown'}` +
              `${agreement.note ? ` — ${agreement.note}` : ''}`,
          });
        }

        const bill = await this.bill.compute(org.id);
        if (isMaterialAgreementDrift(agreement.listCentsAtAgreement, bill.listMonthlyCents)) {
          await this.openAgreementAlert(org.id, 'CONTRACT_DRIFT', {
            fromCents: agreement.listCentsAtAgreement,
            toCents: bill.listMonthlyCents,
            detail:
              `Agreed ${formatCents(agreement.monthlyCents)}; list was ` +
              `${formatCents(agreement.listCentsAtAgreement ?? 0)} at the agreement and is now ` +
              formatCents(bill.listMonthlyCents),
          });
        }
      } catch (e) {
        this.logger.error(`Agreement check failed for org ${org.id}: ${(e as Error).message}`);
      }
    }
  }

  /**
   * One OPEN row per organization per kind, counting up — the same discipline as
   * a sync failure, and for the same reason: both of these are true every night
   * until somebody acts, and a nightly duplicate is a feed people learn to
   * scroll past. Acknowledging closes the episode; if it is still true tomorrow
   * a fresh row opens, which is the signal that nothing was done.
   */
  private async openAgreementAlert(
    organizationId: string,
    kind: 'CONTRACT_DRIFT' | 'CONTRACT_EXPIRING',
    data: { fromCents: number | null; toCents: number; detail: string },
  ) {
    const detail = data.detail.slice(0, 300);
    const open = await this.prisma.billingAlert.findFirst({
      where: { organizationId, kind, acknowledgedAt: null },
      select: { id: true, occurrences: true },
    });
    if (open) {
      await this.prisma.billingAlert.update({
        where: { id: open.id },
        data: { occurrences: open.occurrences + 1, lastSeenAt: new Date(), detail, toCents: data.toCents },
      });
      return;
    }
    await this.prisma.billingAlert.create({
      data: { organizationId, kind, fromCents: data.fromCents, toCents: data.toCents, detail },
    });
    this.logger.warn(`[BILLING] ${kind} alert opened for org ${organizationId}: ${detail}`);
  }
}
