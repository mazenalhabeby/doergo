import { SessionEvents } from '../../common/session-events/session-events.service';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { StripeService } from '../billing/stripe.service';
import { BillingService } from '../billing/billing.service';
import { OrgBillService } from '../billing/org-bill.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, clampListLimit, platformCan } from '@hbcfield/shared';
import { ORG_SELECT, LeanOrg, SUB_STATUSES, consoleOrgFields } from './platform-admin-helpers';

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
    // Suspending must also close the members' live connections, not only their next request.
    // Optional: socket revocation is best effort, and unit tests that do not
    // exercise it need not wire it.
    @Optional() private readonly sessionEvents: SessionEvents | undefined,
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
  /**
   * The header numbers, aggregated in the DATABASE.
   *
   * This used to load every organization (with its subscription) and every
   * member grouped by organization, then add them up in memory — on every tab
   * visit. Counts and sums are what the database is for; the only rows still
   * read are the organizations on an agreed price (a handful), because "what
   * the deals cost us" is a per-row difference.
   */
  async overview() {
    const since30 = new Date(Date.now() - 30 * 86_400_000);
    const [totalOrgs, statusGroups, suspended, newLast30, seats, mrr, agreed] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.organization.groupBy({ by: ['subStatus'], _count: { _all: true } }),
      this.prisma.organization.count({ where: { suspendedAt: { not: null } } }),
      this.prisma.organization.count({ where: { createdAt: { gte: since30 } } }),
      // One seat per active member, exactly as the invoice counts them.
      this.prisma.user.count({
        where: { isActive: true, organizationId: { not: null }, role: { not: 'CUSTOMER' as any } },
      }),
      // MRR from ACTIVE, non-suspended orgs only. `lastBilledCents` IS the agreed
      // price once one is set — so MRR stays the truth with no arithmetic of its own.
      this.prisma.subscription.aggregate({
        _sum: { lastBilledCents: true },
        where: { organization: { subStatus: 'ACTIVE', suspendedAt: null } },
      }),
      /*
        What the agreed prices cost us, measured against the list price AS IT WAS
        AT THE AGREEMENT — the number stored with the deal. Growth since the
        handshake is the nightly drift alert's question, not this one.
      */
      this.prisma.organization.findMany({
        where: { agreedMonthlyCents: { not: null } },
        select: { agreedMonthlyCents: true, agreedListCents: true },
      }),
    ]);

    const byStatus: Record<string, number> = {};
    for (const g of statusGroups) byStatus[String(g.subStatus).toLowerCase()] = g._count._all;
    const mrrCents = mrr._sum.lastBilledCents ?? 0;
    const agreedAwayCents = agreed.reduce(
      (sum, o) => sum + Math.max(0, (o.agreedListCents ?? 0) - (o.agreedMonthlyCents ?? 0)),
      0,
    );
    return success({
      totalOrgs,
      byStatus,
      trialing: byStatus.trialing ?? 0,
      suspended,
      newLast30,
      seats,
      mrrCents,
      arrCents: mrrCents * 12,
      agreedCount: agreed.length,
      agreedAwayCents,
      // What the book would bill at list. Only meaningful beside the two above.
      listMrrCents: mrrCents + agreedAwayCents,
      currency: 'eur',
    });
  }

  // ── Organizations list (with seat + member counts) ───────────────────────────
  /**
   * One page of organizations, newest first.
   *
   * Cursor-paginated (`cursor` = the last row's id, `nextCursor` in the reply)
   * rather than a fixed 500: the console asks for a page and a "Load more".
   * Returns exactly the columns the console renders — no Stripe customer id,
   * no VAT number, nothing a screenshot of the list should carry.
   */
  async listOrgs(params: { search?: string; status?: string; cursor?: string; limit?: number } = {}) {
    const where: any = {};
    const search = typeof params.search === 'string' ? params.search.trim().slice(0, 100) : '';
    if (search) where.name = { contains: search, mode: 'insensitive' };
    const status = String(params.status ?? '').toUpperCase();
    if (SUB_STATUSES.has(status)) where.subStatus = status;
    const limit = clampListLimit(params.limit, 100, 200);
    const rows = (await this.prisma.organization.findMany({
      where,
      select: ORG_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    })) as unknown as (LeanOrg & any)[];
    const orgs = rows.slice(0, limit);
    const seatMap = await this.seatsByOrg(orgs);
    // Member totals per org in one grouped query (perf).
    const counts = orgs.length
      ? await this.prisma.user.groupBy({
          by: ['organizationId'],
          where: { organizationId: { in: orgs.map((o) => o.id) } },
          _count: { id: true },
        })
      : [];
    const memberCount = new Map(counts.map((c) => [c.organizationId, c._count.id]));
    return {
      success: true,
      data: orgs.map((o) => ({
        ...consoleOrgFields(o),
        memberCount: memberCount.get(o.id) ?? 0,
        seats: seatMap.get(o.id) ?? 0,
      })),
      nextCursor: rows.length > limit ? (orgs[orgs.length - 1]?.id ?? null) : null,
    };
  }

  // ── One org: full detail + members ───────────────────────────────────────────
  /**
   * One organization, as the console's drawer renders it.
   *
   * Members are capped (`memberLimit`, default 100) with the total beside them,
   * and their EMAIL addresses go only to operators who manage organizations —
   * a support agent reading this panel sees who is in the company, not a
   * contact list. The billing email is reduced to "is there one", which is all
   * the drawer asks of it; the VAT id and Stripe customer id are not sent.
   */
  async orgDetail(organizationId: string, opts: { viewerRole?: string; memberLimit?: number } = {}) {
    const org = (await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        ...ORG_SELECT,
        billingInterval: true,
        currentPeriodEnd: true,
        enabledModules: true,
        billingEmail: true,
        email: true,
      },
    })) as any;
    if (!org) return { success: false, statusCode: 404, message: 'Organization not found' } as any;
    const seats = (await this.seatsByOrg([org as LeanOrg])).get(org.id) ?? 0;
    const memberLimit = clampListLimit(opts.memberLimit, 100, 500);
    const showEmails = platformCan(opts.viewerRole, 'manageOrgs') || platformCan(opts.viewerRole, 'billingOps');
    const memberWhere = { organizationId, role: { not: 'CUSTOMER' as any } };
    const [members, memberTotal] = await Promise.all([
      this.prisma.user.findMany({
        where: memberWhere,
        select: { id: true, firstName: true, lastName: true, email: showEmails, role: true, isActive: true },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        take: memberLimit,
      }),
      this.prisma.user.count({ where: memberWhere }),
    ]);
    /*
      What the price list says they owe TODAY — the live number an agreed price
      is struck against. Never allowed to fail the panel: a bill that cannot be
      computed is a reason to hide a number, not the members beside it.
    */
    const listMonthlyCents = await this.bill
      .compute(organizationId)
      .then((b) => b.listMonthlyCents)
      .catch(() => null);

    return success({
      ...consoleOrgFields(org),
      billingInterval: org.billingInterval ?? null,
      currentPeriodEnd: org.currentPeriodEnd ?? null,
      enabledModules: org.enabledModules ?? [],
      // INVOICE needs somewhere to send the invoice; the drawer warns without it.
      hasBillingEmail: !!(org.billingEmail || org.email),
      seats,
      listMonthlyCents,
      members: members.map((m) => ({ ...m, email: showEmails ? (m as any).email : null })),
      memberTotal,
    });
  }

  // ── Controls ─────────────────────────────────────────────────────────────────
  async suspend(data: { organizationId: string; byUserId?: string }) {
    const org = await this.prisma.organization.findUnique({
      where: { id: data.organizationId },
      select: { id: true, name: true },
    });
    if (!org) return { success: false, statusCode: 404, message: 'Organization not found' } as any;
    await this.prisma.organization.update({ where: { id: org.id }, data: { suspendedAt: new Date() } });
    this.sessionEvents?.organizationSuspended(org.id);
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
    const org = await this.prisma.organization.findUnique({
      where: { id: data.organizationId },
      select: { id: true, name: true },
    });
    if (!org) return { success: false, statusCode: 404, message: 'Organization not found' } as any;
    await this.prisma.organization.update({ where: { id: org.id }, data: { offlineMode: !!data.enabled } });
    this.logger.warn(
      `[PLATFORM] Org "${org.name}" (${org.id}) offline mode ${data.enabled ? 'ON' : 'OFF'} by ${data.byUserId ?? 'operator'}`,
    );
    return success({ id: org.id, offlineMode: !!data.enabled });
  }

  async reactivate(data: { organizationId: string; byUserId?: string }) {
    const org = await this.prisma.organization.findUnique({
      where: { id: data.organizationId },
      select: { id: true, name: true },
    });
    if (!org) return { success: false, statusCode: 404, message: 'Organization not found' } as any;
    await this.prisma.organization.update({ where: { id: org.id }, data: { suspendedAt: null } });
    this.logger.warn(`[PLATFORM] Org "${org.name}" (${org.id}) REACTIVATED by ${data.byUserId ?? 'operator'}`);
    return success({ id: org.id, suspendedAt: null });
  }
}
