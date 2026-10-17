import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Role } from '@prisma/client';
import { ADD_ON_KEYS, DEFAULT_ORG_MODULES, countSeats, TRIAL_DAYS, runWithCronLock } from '@hbcfield/shared';
import type { SeatCounts } from '@hbcfield/shared';
import { ok } from './billing-helpers';
import { BillingBase } from './billing.base';

/** The 14-day trial: starting one (with today's seats), and locking those that ran out with no card. */
@Injectable()
export class BillingTrialService extends BillingBase {
  // ── seat counting ──────────────────────────────────────────────────────────
  private async countOrgSeats(organizationId: string): Promise<SeatCounts> {
    const [org, users] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { usesExternalWorkers: true },
      }),
      this.prisma.user.findMany({
        // CUSTOMER is excluded in the query as well as in `countSeats` — the
        // classifier is what guarantees the rule, this just avoids loading rows
        // only to drop them, on orgs whose portal has more logins than staff.
        where: { organizationId, isActive: true, role: { not: Role.CUSTOMER } },
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
        subStatus: 'TRIALING',
        billingInterval: 'MONTHLY',
        trialEndsAt,
        // A trial is everything, for fourteen days. There is no tier to put
        // somebody on, and a trial that hides half the product cannot tell
        // anyone whether the product is worth buying.
        addOns: ADD_ON_KEYS,
        enabledModules: DEFAULT_ORG_MODULES,
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
   * Cron entry point. The work is in expireTrials(), which stays directly
   * callable — this only decides whether THIS replica is the one to run it.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireTrialsCron(): Promise<void> {
    await runWithCronLock(
      this.prisma,
      { name: 'billing:expireTrials', ttlSeconds: 600, logger: this.logger },
      () => this.expireTrials(),
    );
  }

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
}
