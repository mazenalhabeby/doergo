import { HttpStatus } from '@nestjs/common';
import type Stripe from 'stripe';
import type { PlanTier, SubStatus } from '@hbcfield/shared';

type PrismaTier = 'STARTER' | 'PROFESSIONAL' | 'BUSINESS' | 'ENTERPRISE';

type PrismaStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE';

const tierFromPrisma = (p: PrismaTier | null): PlanTier | null => (p ? (p.toLowerCase() as PlanTier) : null);

const statusFromPrisma = (p: PrismaStatus): SubStatus =>
  ({ TRIALING: 'trialing', ACTIVE: 'active', PAST_DUE: 'past_due', CANCELED: 'canceled', INCOMPLETE: 'incomplete' } as const)[p];

/**
 * Read the current period from a Stripe subscription. Newer Stripe API versions
 * moved `current_period_start/end` onto the subscription ITEMS; older ones keep
 * them on the subscription. Read either, defensively.
 */
function subPeriod(sub: Stripe.Subscription): { start: Date | null; end: Date | null } {
  const item = sub.items?.data?.[0] as unknown as { current_period_start?: number; current_period_end?: number } | undefined;
  const s = sub as unknown as { current_period_start?: number; current_period_end?: number };
  const startUnix = item?.current_period_start ?? s.current_period_start;
  const endUnix = item?.current_period_end ?? s.current_period_end;
  return {
    start: startUnix ? new Date(startUnix * 1000) : null,
    end: endUnix ? new Date(endUnix * 1000) : null,
  };
}

/** Map a Stripe subscription.status to our lifecycle status. */
function mapStripeStatus(s: Stripe.Subscription.Status): PrismaStatus {
  switch (s) {
    case 'trialing':
      return 'TRIALING';
    case 'active':
      return 'ACTIVE';
    case 'past_due':
      return 'PAST_DUE';
    case 'canceled':
      return 'CANCELED';
    default:
      return 'INCOMPLETE'; // unpaid / incomplete / incomplete_expired / paused
  }
}

const ok = (data?: unknown, message?: string) => ({ success: true, statusCode: HttpStatus.OK, data, message });

const fail = (statusCode: number, message: string) => ({ success: false, statusCode, message });

export { PrismaTier, PrismaStatus, tierFromPrisma, statusFromPrisma, subPeriod, mapStripeStatus, ok, fail };
