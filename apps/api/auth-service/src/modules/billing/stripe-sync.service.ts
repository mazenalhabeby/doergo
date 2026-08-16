import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StripeService } from './stripe.service';
import type { PlanTier, SeatType } from '@hbcfield/shared';

const ok = <T>(data: T) => ({ success: true, data });
const fail = (message: string, statusCode = 400) => ({ success: false, statusCode, message });

type Change = {
  kind: 'seat';
  seatType: string;
  tier: string | null;
  interval: 'monthly' | 'annual';
  currentCents: number | null;
  nextCents: number;
  currentPriceId: string;
  product: string;
  newPriceId?: string;
};

/**
 * C3 — sync a PUBLISHED price book to Stripe. Designed to be SAFE:
 *  • `preview` is READ-ONLY (retrieves current Stripe prices, diffs vs the book).
 *  • `apply` is HARD-GATED behind `PLATFORM_PRICING_SYNC_ENABLED=true` (set only
 *    AFTER a test-clock rehearsal) and only CREATES new orphan Stripe prices +
 *    records their ids. It does NOT change product defaults and NEVER touches any
 *    existing subscription → existing customers are fully grandfathered (zero
 *    charge impact). Making the new prices take effect for new checkouts is a
 *    further, separate, rehearsed step.
 */
@Injectable()
export class StripeSyncService {
  private readonly logger = new Logger(StripeSyncService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
  ) {}

  private get enabled(): boolean {
    return this.config.get<string>('PLATFORM_PRICING_SYNC_ENABLED') === 'true';
  }

  private async activeBook() {
    return this.prisma.pricingConfig.findFirst({ where: { active: true }, include: { seatPrices: true, modulePrices: true }, orderBy: { version: 'desc' } });
  }

  /** Compute the changes needed to bring Stripe in line with the active book. */
  private async computeChanges(): Promise<Change[]> {
    const book = await this.activeBook();
    if (!book) return [];
    const changes: Change[] = [];
    for (const s of book.seatPrices) {
      for (const interval of ['monthly', 'annual'] as const) {
        const nextCents = interval === 'monthly' ? s.monthlyCents : s.annualCents;
        let currentPriceId: string;
        try { currentPriceId = this.stripe.priceId(s.seatType as SeatType, (s.tier ?? 'starter') as PlanTier, interval); }
        catch { continue; } // no mapped Stripe price for this line — skip
        let info: { unitAmount: number | null; product: string } | null = null;
        try { info = await this.stripe.getPriceInfo(currentPriceId); } catch { info = null; }
        const currentCents = info?.unitAmount ?? null;
        if (info && currentCents !== nextCents) {
          changes.push({ kind: 'seat', seatType: s.seatType, tier: s.tier, interval, currentCents, nextCents, currentPriceId, product: info.product });
        }
      }
    }
    return changes;
  }

  /** READ-ONLY preview: what would change + how many subs are affected (0 — grandfathered). */
  async preview() {
    if (!this.stripe.isConfigured) return fail('Stripe not configured', 400);
    const changes = await this.computeChanges();
    const activeSubs = await this.prisma.organization.count({ where: { subStatus: 'ACTIVE' } });
    return ok({
      enabled: this.enabled,
      changeCount: changes.length,
      changes,
      existingSubsAffected: 0, // grandfathered — apply never touches subscriptions
      activeSubs,
      note: this.enabled ? 'Apply will CREATE new Stripe prices (orphan) and record ids. No subscription or default is changed.' : 'Apply is DISABLED. Rehearse on a Stripe test clock, then set PLATFORM_PRICING_SYNC_ENABLED=true.',
    });
  }

  /** GATED apply: create new Stripe prices + record ids. No defaults, no subs. */
  async apply(data: { confirm?: string; byUserId?: string }) {
    if (!this.stripe.isConfigured) return fail('Stripe not configured', 400);
    if (!this.enabled) return fail('Pricing sync is disabled. Rehearse on a Stripe test clock first, then set PLATFORM_PRICING_SYNC_ENABLED=true.', 409);
    if (data.confirm !== 'APPLY') return fail('Confirmation required (confirm: "APPLY")', 400);

    const changes = await this.computeChanges();
    if (changes.length === 0) return ok({ created: 0, changes: [] });

    const book = await this.activeBook();
    for (const c of changes) {
      try {
        c.newPriceId = await this.stripe.createRecurringPrice({ product: c.product, unitAmount: c.nextCents, interval: c.interval === 'annual' ? 'year' : 'month' });
        // Record the MONTHLY new price id on the book row (best-effort; both ids logged).
        if (c.interval === 'monthly' && book) {
          const row = book.seatPrices.find((s) => s.seatType === c.seatType && s.tier === c.tier);
          if (row) await this.prisma.seatPrice.update({ where: { id: row.id }, data: { stripePriceId: c.newPriceId } });
        }
        this.logger.warn(`[PLATFORM] C3 created Stripe price ${c.newPriceId} for ${c.seatType}/${c.tier ?? '-'}/${c.interval} @ ${c.nextCents} (product ${c.product}) by ${data.byUserId ?? 'operator'}`);
      } catch (e) {
        this.logger.error(`[PLATFORM] C3 price create failed for ${c.seatType}/${c.interval}: ${(e as Error).message}`);
      }
    }
    return ok({ created: changes.filter((c) => c.newPriceId).length, changes, note: 'New orphan prices created + ids recorded. Existing subscriptions untouched (grandfathered). Making them take effect for new checkouts is the next rehearsed step.' });
  }
}
