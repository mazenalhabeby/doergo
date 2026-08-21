import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  success,
  countSeats,
  PLANS,
  FIELD_SEAT_MONTHLY_CENTS,
  IN_HOUSE_FIELD_SEAT_MONTHLY_CENTS,
  type PlanTier,
  type SeatClassifiable,
} from '@hbcfield/shared';

// Lean shapes — select only what billing/seat classification needs (perf).
const ORG_SELECT = {
  id: true, name: true, planTier: true, subStatus: true, billingInterval: true,
  trialEndsAt: true, currentPeriodEnd: true, suspendedAt: true, usesExternalWorkers: true,
  isActive: true, createdAt: true, stripeCustomerId: true, addOns: true,
  // What this org was last billed. MRR reads THIS rather than recomputing from
  // a plan: with modules and usage there is no formula an operator console can
  // re-derive, and a second implementation of the bill is a second answer.
  subscription: { select: { lastBilledCents: true } },
} as const;
const MEMBER_SELECT = {
  id: true, organizationId: true, role: true, enabledModules: true,
  employmentType: true, isActive: true,
} as const;

type LeanOrg = {
  id: string; name: string; planTier: string | null; subStatus: string;
  suspendedAt: Date | null; usesExternalWorkers: boolean; createdAt: Date;
  addOns?: string[];
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
  constructor(private readonly prisma: PrismaService) {}

  /** Group active members by org and count seats per org (shared classifier). */
  private async seatsByOrg(orgs: LeanOrg[]): Promise<Map<string, ReturnType<typeof countSeats>>> {
    const ids = orgs.map((o) => o.id);
    const members = ids.length
      ? await this.prisma.user.findMany({ where: { organizationId: { in: ids }, role: { not: 'CUSTOMER' as any } }, select: MEMBER_SELECT })
      : [];
    const byOrg = new Map<string, SeatClassifiable[]>();
    for (const m of members) {
      const list = byOrg.get(m.organizationId!) ?? [];
      list.push(m as SeatClassifiable);
      byOrg.set(m.organizationId!, list);
    }
    const out = new Map<string, ReturnType<typeof countSeats>>();
    for (const o of orgs) out.set(o.id, countSeats(byOrg.get(o.id) ?? [], { usesExternalWorkers: o.usesExternalWorkers }));
    return out;
  }

  // ── Overview metrics ─────────────────────────────────────────────────────────
  async overview() {
    const orgs = (await this.prisma.organization.findMany({ select: ORG_SELECT })) as unknown as LeanOrg[];
    const seatMap = await this.seatsByOrg(orgs);

    const byStatus: Record<string, number> = {};
    let suspended = 0, trialing = 0, mrrCents = 0, officeSeats = 0, fieldSeats = 0, inhouseSeats = 0;
    const now = Date.now();
    let newLast30 = 0;
    for (const o of orgs) {
      const st = (o.subStatus ?? '').toLowerCase();
      byStatus[st] = (byStatus[st] ?? 0) + 1;
      if (o.suspendedAt) suspended += 1;
      if (st === 'trialing') trialing += 1;
      if (o.createdAt && now - new Date(o.createdAt).getTime() < 30 * 86_400_000) newLast30 += 1;
      const seats = seatMap.get(o.id)!;
      officeSeats += seats.office; fieldSeats += seats.field; inhouseSeats += seats.fieldInhouse;
      // MRR from ACTIVE, non-suspended orgs only.
      if (st === 'active' && !o.suspendedAt) mrrCents += orgMrrCents(o);
    }
    return success({
      totalOrgs: orgs.length,
      byStatus,
      trialing,
      suspended,
      newLast30,
      seats: { office: officeSeats, field: fieldSeats, fieldInhouse: inhouseSeats, total: officeSeats + fieldSeats + inhouseSeats },
      mrrCents,
      arrCents: mrrCents * 12,
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
        const seats = seatMap.get(o.id)!;
        return {
          id: o.id, name: o.name, planTier: o.planTier, subStatus: o.subStatus,
          billingInterval: (o as any).billingInterval, trialEndsAt: o.trialEndsAt,
          currentPeriodEnd: (o as any).currentPeriodEnd, suspendedAt: o.suspendedAt,
          createdAt: o.createdAt, stripeCustomerId: (o as any).stripeCustomerId ?? null,
          memberCount: memberCount.get(o.id) ?? 0,
          seats,
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
    const seats = (await this.seatsByOrg([org as LeanOrg])).get(org.id)!;
    const members = await this.prisma.user.findMany({
      where: { organizationId, role: { not: 'CUSTOMER' as any } },
      select: { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true, enabledModules: true, employmentType: true, lastActiveAt: true, createdAt: true },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      take: 1000,
    });
    return success({
      ...org,
      seats,
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

  async reactivate(data: { organizationId: string; byUserId?: string }) {
    const org = await this.prisma.organization.findUnique({ where: { id: data.organizationId }, select: { id: true, name: true } });
    if (!org) return { success: false, statusCode: 404, message: 'Organization not found' } as any;
    await this.prisma.organization.update({ where: { id: org.id }, data: { suspendedAt: null } });
    this.logger.warn(`[PLATFORM] Org "${org.name}" (${org.id}) REACTIVATED by ${data.byUserId ?? 'operator'}`);
    return success({ id: org.id, suspendedAt: null });
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
