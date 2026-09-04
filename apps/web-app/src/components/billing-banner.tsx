'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, Lock, ArrowRight } from 'lucide-react';
import { billingApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import type { SubscriptionView } from '@hbcfield/shared/client';

/**
 * Premium status ribbon shown to ADMINS only when billing needs attention:
 * trial countdown, failed payment, or an inactive (locked) subscription. Only
 * the org owner can act on it (all billing endpoints are ADMIN-gated), so
 * managers/members never see the nag — and never make the billing API call.
 * Theme-aware; hidden for healthy active subscriptions.
 */
export function BillingBanner() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [sub, setSub] = useState<SubscriptionView | null>(null);

  useEffect(() => {
    if (!isAdmin) return; // non-admins: no fetch, no banner
    let alive = true;
    billingApi
      .getSubscription()
      .then((s) => alive && setSub(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  if (!isAdmin || !sub) return null;

  let variant: {
    grad: string;
    border: string;
    iconBg: string;
    accent: string;
    Icon: typeof Clock;
    main: string;
    sub: string;
    cta: string;
    /** Solid, not tinted: a read-only account must not read as a suggestion. */
    hard?: boolean;
  } | null = null;

  if (sub.status === 'incomplete' || sub.status === 'canceled') {
    /*
      The account is READ-ONLY, and this is the only thing that says so.

      Every write returns 402 while the app still shows New Task, Clock In and
      Add member — you find out at submit, after typing. That was reported as
      "I can still add tasks in an inactive organization"; the server had
      refused every one of them.

      So this state is not a tinted strip like the others. It is solid, it says
      what is actually true — you can read everything, you can change nothing —
      and it does not scroll away.
    */
    variant = {
      grad: 'from-red-500/15 via-red-500/5',
      border: 'border-red-500/20',
      iconBg: 'bg-red-500/15 text-red-500',
      accent: 'text-red-500',
      Icon: Lock,
      main: 'This account is read-only',
      sub: 'everything is visible, nothing can be changed until payment is set up',
      cta: 'Set up payment',
      hard: true,
    };
  } else if (sub.status === 'past_due') {
    variant = {
      grad: 'from-amber-500/15 via-amber-500/5',
      border: 'border-amber-500/20',
      iconBg: 'bg-amber-500/15 text-amber-500',
      accent: 'text-amber-500',
      Icon: AlertTriangle,
      main: 'A payment failed',
      sub: 'update your payment method to avoid interruption',
      cta: 'Fix payment',
    };
  } else if (sub.status === 'trialing') {
    const d = sub.trialDaysLeft ?? 0;
    const urgent = d <= 3;
    variant = {
      grad: urgent ? 'from-amber-500/15 via-amber-500/5' : 'from-primary/15 via-primary/5',
      border: urgent ? 'border-amber-500/20' : 'border-primary/20',
      iconBg: urgent ? 'bg-amber-500/15 text-amber-500' : 'bg-primary/15 text-primary',
      accent: urgent ? 'text-amber-500' : 'text-primary',
      Icon: Clock,
      main: `${d} day${d === 1 ? '' : 's'} left in your free trial`,
      /*
        There are no plans to choose. Tiers were removed in August — the bill is
        the sum of what the organization switched on — so "choose a plan" sent
        somebody looking for a screen that does not exist, and implied a
        decision they cannot make.

        What is true during a trial: everything works, nothing is owed, and the
        bill is already computable. So the banner points at the bill.
      */
      sub: 'everything is switched on — see what it will cost',
      cta: 'View bill',
    };
  } else {
    return null; // active → no banner
  }

  const { Icon } = variant;

  return (
    <Link
      href="/settings/billing"
      className={
        variant.hard
          ? 'group flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 border-b border-red-600 bg-red-600 px-4 py-2.5 text-white transition-colors hover:bg-red-700'
          : `group flex items-center justify-center gap-2.5 border-b ${variant.border} bg-gradient-to-r ${variant.grad} to-transparent px-4 py-2 backdrop-blur-sm transition-colors`
      }
    >
      <span
        className={
          variant.hard
            ? 'flex size-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-white'
            : `flex size-5 shrink-0 items-center justify-center rounded-full ${variant.iconBg}`
        }
      >
        <Icon className="h-3 w-3" strokeWidth={2.5} />
      </span>
      <span className={variant.hard ? 'text-[13px] font-semibold' : 'text-[13px] font-medium text-foreground'}>
        {variant.main}
      </span>
      <span
        className={
          variant.hard ? 'text-[13px] text-white/80' : 'hidden text-[13px] text-muted-foreground sm:inline'
        }
      >
        — {variant.sub}
      </span>
      <span
        className={
          variant.hard
            ? 'ml-0.5 inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[12px] font-semibold text-red-700 transition-all group-hover:gap-1.5'
            : `ml-0.5 inline-flex items-center gap-1 text-[12px] font-semibold ${variant.accent} transition-all group-hover:gap-1.5`
        }
      >
        {variant.cta}
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
