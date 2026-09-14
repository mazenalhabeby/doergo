import { Injectable, Logger } from '@nestjs/common';
import { StripeService } from '../billing/stripe.service';
import { BillingService } from '../billing/billing.service';
import { OrgBillService } from '../billing/org-bill.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, validateAgreedPrice } from '@hbcfield/shared';

// Lean shapes — select only what billing/seat classification needs (perf).
const ORG_SELECT = {
  id: true, name: true, planTier: true, subStatus: true, billingInterval: true,
  trialEndsAt: true, currentPeriodEnd: true, suspendedAt: true, usesExternalWorkers: true,
  isActive: true, createdAt: true, stripeCustomerId: true, addOns: true,
  // How they pay. On the LIST, not only the detail: "who is on invoice?" is a
  // question about the whole book, and answering it by opening organizations
  // one at a time is how a contract customer gets missed at renewal.
  billingMode: true, invoiceDueDays: true,
  // An agreed price, if one was struck. On the LIST for the same reason the
  // billing mode is: "who is not on the price list?" is a question about the
  // whole book, and answering it one organization at a time is how a discount
  // outlives the person who agreed it.
  agreedMonthlyCents: true, agreedListCents: true, agreedUntil: true,
  agreedNote: true, agreedSetAt: true, agreedSetById: true,
  // What this org was last billed. MRR reads THIS rather than recomputing from
  // a plan: with modules and usage there is no formula an operator console can
  // re-derive, and a second implementation of the bill is a second answer.
  subscription: { select: { lastBilledCents: true } },
} as const;
type LeanOrg = {
  id: string; name: string; planTier: string | null; subStatus: string;
  suspendedAt: Date | null; usesExternalWorkers: boolean; createdAt: Date;
  addOns?: string[];
  agreedMonthlyCents?: number | null;
  agreedListCents?: number | null;
  agreedUntil?: Date | null;
  subscription?: { lastBilledCents: number } | null;
};

/**
 * Monthly recurring cents for one org — what it was last actually billed.
 *
 * This used to multiply seats by a tier price. Under the module model there is
 * no such formula: the bill is seats plus each space's modules plus its usage
 * ladders plus org add-ons, and re-deriving that here would be a second
 * implementation of the bill that could disagree with the invoice. So the
 * operator console reports the number the billing engine last computed.
 *
 * Zero means "never billed" — a trial, or an org that has not checked out.
 */
function orgMrrCents(org: { subscription?: { lastBilledCents: number } | null }): number {
  return org.subscription?.lastBilledCents ?? 0;
}

/**
 * PLATFORM-OPERATOR (company super-admin) read/control surface. Never a customer
 * path — reached only through the gateway's constant-time platform-admin gate.
 * Seat counting is delegated to the shared `countSeats` so it can never drift
 * from the billing engine (DRY). Queries are aggregate + 2-pass grouped in memory
 * (no N+1): one orgs query + one members query per view.
 */
@Injectable()
export class PlatformAdminService {
  private readonly logger = new Logger(PlatformAdminService.name);
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

  /**
   * Seats per org — one per active member, exactly as the invoice counts them.
   *
   * This used to call the shared `countSeats` classifier and report an
   * office / field / in-house split. That split is gone: a seat is €9.99
   * whatever the member's access, and the billing engine counts
   * `user.count({ isActive: true })`. Keeping the classifier here would have
   * this screen report three numbers the bill does not distinguish, and the
   * classifier reads an access profile that no longer changes the price.
   *
   * One grouped query, not one per org.
   */
  private async seatsByOrg(orgs: LeanOrg[]): Promise<Map<string, number>> {
    const ids = orgs.map((o) => o.id);
    const rows = ids.length
      ? await this.prisma.user.groupBy({
          by: ['organizationId'],
          where: { organizationId: { in: ids }, isActive: true, role: { not: 'CUSTOMER' as any } },
          _count: { _all: true },
        })
      : [];
    const out = new Map<string, number>();
    for (const o of orgs) out.set(o.id, 0);
    for (const r of rows) if (r.organizationId) out.set(r.organizationId, r._count._all);
    return out;
  }

  // ── Overview metrics ─────────────────────────────────────────────────────────
  async overview() {
    const orgs = (await this.prisma.organization.findMany({ select: ORG_SELECT })) as unknown as LeanOrg[];
    const seatMap = await this.seatsByOrg(orgs);

    const byStatus: Record<string, number> = {};
    let suspended = 0, trialing = 0, mrrCents = 0, seatTotal = 0;
    /*
      What the agreed prices cost us, and how many organizations are on one.

      Measured against the list price AS IT WAS AT THE AGREEMENT — the number
      stored with the deal — rather than recomputing every contracted bill here.
      This method runs on every tab of the console, and a fresh bill per
      contracted organization would put eight queries each behind a header.
      Growth since the handshake is a different question with a different
      answer: the nightly drift alert.
    */
    let agreedCount = 0, agreedAwayCents = 0;
    const now = Date.now();
    let newLast30 = 0;
    for (const o of orgs) {
      const st = (o.subStatus ?? '').toLowerCase();
      byStatus[st] = (byStatus[st] ?? 0) + 1;
      if (o.suspendedAt) suspended += 1;
      if (st === 'trialing') trialing += 1;
      if (o.createdAt && now - new Date(o.createdAt).getTime() < 30 * 86_400_000) newLast30 += 1;
      seatTotal += seatMap.get(o.id) ?? 0;
      // MRR from ACTIVE, non-suspended orgs only. It reads `lastBilledCents`,
      // which IS the agreed price once one is set — so MRR stays the truth with
      // no arithmetic of its own.
      if (st === 'active' && !o.suspendedAt) mrrCents += orgMrrCents(o);
      if (o.agreedMonthlyCents != null) {
        agreedCount += 1;
        agreedAwayCents += Math.max(0, (o.agreedListCents ?? 0) - o.agreedMonthlyCents);
      }
    }
    return success({
      totalOrgs: orgs.length,
      byStatus,
      trialing,
      suspended,
      newLast30,
      seats: seatTotal,
      mrrCents,
      arrCents: mrrCents * 12,
      agreedCount,
      agreedAwayCents,
      // What the book would bill at list. Only meaningful beside the two above.
      listMrrCents: mrrCents + agreedAwayCents,
      currency: 'eur',
    });
  }

  // ── Organizations list (with seat + member counts) ───────────────────────────
  async listOrgs(params: { search?: string; status?: string } = {}) {
    const where: any = {};
    if (params.search) where.name = { contains: params.search, mode: 'insensitive' };
    if (params.status && params.status !== 'all') where.subStatus = params.status.toUpperCase();
    const orgs = (await this.prisma.organization.findMany({ where, select: ORG_SELECT, orderBy: { createdAt: 'desc' }, take: 500 })) as unknown as (LeanOrg & any)[];
    const seatMap = await this.seatsByOrg(orgs);
    // Member totals per org in one grouped query (perf).
    const counts = orgs.length
      ? await this.prisma.user.groupBy({ by: ['organizationId'], where: { organizationId: { in: orgs.map((o) => o.id) } }, _count: { id: true } })
      : [];
    const memberCount = new Map(counts.map((c) => [c.organizationId, c._count.id]));
    return success(
      orgs.map((o) => {
        const seats = seatMap.get(o.id) ?? 0;
        return {
          id: o.id, name: o.name, planTier: o.planTier, subStatus: o.subStatus,
          billingInterval: (o as any).billingInterval, trialEndsAt: o.trialEndsAt,
          currentPeriodEnd: (o as any).currentPeriodEnd, suspendedAt: o.suspendedAt,
          createdAt: o.createdAt, stripeCustomerId: (o as any).stripeCustomerId ?? null,
          agreedMonthlyCents: o.agreedMonthlyCents ?? null,
          agreedListCents: o.agreedListCents ?? null,
          agreedUntil: o.agreedUntil ?? null,
          agreedNote: (o as any).agreedNote ?? null,
          agreedSetAt: (o as any).agreedSetAt ?? null,
          memberCount: memberCount.get(o.id) ?? 0,
          seats,
          // What this org has actually BOUGHT. `planTier` is a vestige kept for
          // the webhook's fallback; nothing reads it to decide access any more,
          // so the console reports the add-ons that do.
          addOns: (o as any).addOns ?? [],
          billingMode: (o as any).billingMode ?? 'AUTOMATIC',
          invoiceDueDays: (o as any).invoiceDueDays ?? 14,
          mrrCents: (o.subStatus ?? '').toLowerCase() === 'active' && !o.suspendedAt ? orgMrrCents(o) : 0,
        };
      }),
    );
  }

  // ── One org: full detail + members ───────────────────────────────────────────
  async orgDetail(organizationId: string) {
    const org = (await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { ...ORG_SELECT, enabledModules: true, billingEmail: true, vatId: true },
    })) as any;
    if (!org) return { success: false, statusCode: 404, message: 'Organization not found' } as any;
    const seats = (await this.seatsByOrg([org as LeanOrg])).get(org.id) ?? 0;
    const members = await this.prisma.user.findMany({
      where: { organizationId, role: { not: 'CUSTOMER' as any } },
      select: { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true, enabledModules: true, employmentType: true, lastActiveAt: true, createdAt: true },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      take: 1000,
    });
    /*
      What the price list says they owe TODAY.

      Computed here and not on the list, because this is the screen where a price
      is agreed and the operator needs the live number to agree it against — the
      one stored with an old deal has aged. One bill for one organization the
      operator deliberately opened is cheap; the same on a 500-row table would
      not be.

      Never allowed to fail the panel: a bill that cannot be computed is a reason
      to hide a number, not to hide the members and the controls beside it.
    */
    const listMonthlyCents = await this.bill
      .compute(organizationId)
      .then((b) => b.listMonthlyCents)
      .catch(() => null);

    return success({
      ...org,
      seats,
      listMonthlyCents,
      mrrCents: (org.subStatus ?? '').toLowerCase() === 'active' && !org.suspendedAt ? orgMrrCents(org) : 0,
      members,
    });
  }

  // ── Controls ─────────────────────────────────────────────────────────────────
  async suspend(data: { organizationId: string; byUserId?: string }) {
    const org = await this.prisma.organization.findUnique({ where: { id: data.organizationId }, select: { id: true, name: true } });
    if (!org) return { success: false, statusCode: 404, message: 'Organization not found' } as any;
    await this.prisma.organization.update({ where: { id: org.id }, data: { suspendedAt: new Date() } });
    this.logger.warn(`[PLATFORM] Org "${org.name}" (${org.id}) SUSPENDED by ${data.byUserId ?? 'operator'}`);
    return success({ id: org.id, suspendedAt: new Date() });
  }

  /**
   * Offline mode for one organization — the rollout switch.
   *
   * Reaches each phone with its next session refresh. Turning it OFF never
   * throws work away: a phone still sends whatever it had queued, and only
   * stops queuing new work.
   */
  async setOfflineMode(data: { organizationId: string; enabled: boolean; byUserId?: string }) {
    const org = await this.prisma.organization.findUnique({ where: { id: data.organizationId }, select: { id: true, name: true } });
    if (!org) return { success: false, statusCode: 404, message: 'Organization not found' } as any;
    await this.prisma.organization.update({ where: { id: org.id }, data: { offlineMode: !!data.enabled } });
    this.logger.warn(`[PLATFORM] Org "${org.name}" (${org.id}) offline mode ${data.enabled ? 'ON' : 'OFF'} by ${data.byUserId ?? 'operator'}`);
    return success({ id: org.id, offlineMode: !!data.enabled });
  }

  async reactivate(data: { organizationId: string; byUserId?: string }) {
    const org = await this.prisma.organization.findUnique({ where: { id: data.organizationId }, select: { id: true, name: true } });
    if (!org) return { success: false, statusCode: 404, message: 'Organization not found' } as any;
    await this.prisma.organization.update({ where: { id: org.id }, data: { suspendedAt: null } });
    this.logger.warn(`[PLATFORM] Org "${org.name}" (${org.id}) REACTIVATED by ${data.byUserId ?? 'operator'}`);
    return success({ id: org.id, suspendedAt: null });
  }

  /**
   * How an organization pays us.
   *
   * The most consequential switch on this console, so it is written to be hard
   * to use by accident:
   *
   *   • INVOICE is refused without a billing email. An invoice with nowhere to
   *     go is discovered a month later, as a payment that never arrived —
   *     checked where the mode is SET, not where the invoice is sent.
   *   • A LIVE subscription is moved, not recreated. Its prices, history and
   *     period stay put, so this is a billing decision rather than a migration,
   *     and a customer mid-month is not re-charged.
   *   • Stripe first, database second. If Stripe refuses, nothing is written
   *     and the console still shows the truth; the reverse order would leave a
   *     row claiming a collection method Stripe never accepted.
   *   • `billedExternally` is written in step. Nothing reads it any more, but
   *     reports and scripts do, and a boolean that silently stops tracking its
   *     replacement is worse than one that is gone.
   */
  /**
   * Bills that fell, newest first.
   *
   * Unacknowledged by default: the question an operator asks is "what changed
   * recently and have we looked at it?", which is a list with a state rather
   * than a feed. Capped at 200 — a console that has to paginate a backlog this
   * size has a bigger problem than pagination.
   */
  async listBillingAlerts(data: { includeAcknowledged?: boolean }) {
    const rows = await this.prisma.billingAlert.findMany({
      where: data.includeAcknowledged ? {} : { acknowledgedAt: null },
      // By LAST SEEN, not first: a sync that failed again a minute ago matters
      // more than one that opened last week and stopped.
      orderBy: { lastSeenAt: 'desc' },
      take: 200,
      // The organization's NAME, not just its id: an alert identified by a cuid
      // is one somebody has to go and look up before they can act on it.
      include: { organization: { select: { id: true, name: true, billingMode: true } } },
    });
    return success(
      rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        organizationId: r.organizationId,
        organizationName: r.organization?.name ?? '—',
        billingMode: r.organization?.billingMode ?? 'AUTOMATIC',
        fromCents: r.fromCents,
        toCents: r.toCents,
        dropCents: r.dropCents,
        detail: r.detail,
        occurrences: r.occurrences,
        lastSeenAt: r.lastSeenAt,
        createdAt: r.createdAt,
        acknowledgedAt: r.acknowledgedAt,
        acknowledgedBy: r.acknowledgedBy,
      })),
    );
  }

  /** Mark one as looked at. Idempotent — acknowledging twice is not an error. */
  async acknowledgeBillingAlert(data: { id: string; byUserId?: string }) {
    const alert = await this.prisma.billingAlert.findUnique({ where: { id: data.id }, select: { id: true, acknowledgedAt: true } });
    if (!alert) return { success: false, statusCode: 404, message: 'Alert not found' } as any;
    if (alert.acknowledgedAt) return success({ id: alert.id, acknowledgedAt: alert.acknowledgedAt });
    const updated = await this.prisma.billingAlert.update({
      where: { id: data.id },
      data: { acknowledgedAt: new Date(), acknowledgedBy: data.byUserId ?? null },
    });
    return success({ id: updated.id, acknowledgedAt: updated.acknowledgedAt });
  }

  /**
   * End a trial now, rather than waiting for it to run out.
   *
   * The mirror of extendTrial, and the operator half of a deliberate flow: the
   * customer sees no "Set up payment" while they are trialing — nothing is owed
   * yet, and asking for a card mid-trial is asking a question they have not
   * reached — so somebody here decides when the trial is over and the
   * conversation about paying begins.
   *
   * Does exactly what `expireTrials()` does on the hour, and no more: status to
   * INCOMPLETE on both rows, `trialEndsAt` moved to now so the record agrees
   * with the state. Reusing the same end-state rather than inventing a second
   * one is the point — two ways to end a trial that differ by a field is how a
   * customer ends up in a state no guard was written for.
   *
   * Refused once a real subscription exists: `expireTrials` skips those (they
   * are paying, so there is nothing to expire), and locking a paying customer
   * out of their own account is not something an operator should be able to do
   * by clicking the wrong row.
   */
  async endTrial(data: { organizationId: string; byUserId?: string }) {
    const org = await this.prisma.organization.findUnique({
      where: { id: data.organizationId },
      select: {
        id: true, name: true, subStatus: true,
        subscription: { select: { stripeSubscriptionId: true } },
      },
    });
    if (!org) return { success: false, statusCode: 404, message: 'Organization not found' } as any;
    if (org.subStatus !== 'TRIALING') {
      return { success: false, statusCode: 400, message: 'This organization is not on a trial.' } as any;
    }
    if (org.subscription?.stripeSubscriptionId) {
      return {
        success: false,
        statusCode: 400,
        message: 'This organization already has a subscription — end the trial in Stripe, not here.',
      } as any;
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.organization.update({
        where: { id: org.id },
        data: { subStatus: 'INCOMPLETE', trialEndsAt: now },
      }),
      this.prisma.subscription.updateMany({
        where: { organizationId: org.id },
        data: { status: 'INCOMPLETE' },
      }),
    ]);
    this.logger.warn(`[PLATFORM] Org "${org.name}" (${org.id}) trial ENDED by ${data.byUserId ?? 'operator'}`);
    return success({ id: org.id, subStatus: 'INCOMPLETE', trialEndsAt: now });
  }

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

    if (data.mode === 'INVOICE' && !(org.billingEmail || org.email)) {
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
        `${org.agreedMonthlyCents == null ? 'set' : 'changed'} to EUR${(parsed.monthlyCents / 100).toFixed(2)} ` +
        `(list EUR${(listCents / 100).toFixed(2)})${parsed.until ? ` until ${parsed.until.toISOString().slice(0, 10)}` : ''} ` +
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
        `(was EUR${(org.agreedMonthlyCents / 100).toFixed(2)}) by ${data.byUserId ?? 'operator'}`,
    );
    return success({ id: org.id, agreedMonthlyCents: null });
  }

  async extendTrial(data: { organizationId: string; days: number; byUserId?: string }) {
    const org = await this.prisma.organization.findUnique({ where: { id: data.organizationId }, select: { id: true, name: true, trialEndsAt: true } });
    if (!org) return { success: false, statusCode: 404, message: 'Organization not found' } as any;
    const days = Math.max(1, Math.min(365, Math.floor(data.days || 0)));
    const base = org.trialEndsAt && org.trialEndsAt.getTime() > Date.now() ? org.trialEndsAt.getTime() : Date.now();
    const trialEndsAt = new Date(base + days * 86_400_000);
    await this.prisma.organization.update({ where: { id: org.id }, data: { trialEndsAt, subStatus: 'TRIALING' } });
    this.logger.warn(`[PLATFORM] Org "${org.name}" (${org.id}) trial extended +${days}d → ${trialEndsAt.toISOString()} by ${data.byUserId ?? 'operator'}`);
    return success({ id: org.id, trialEndsAt });
  }
}
