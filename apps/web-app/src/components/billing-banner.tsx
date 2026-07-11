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
  } | null = null;

  if (sub.status === 'incomplete' || sub.status === 'canceled') {
    variant = {
      grad: 'from-red-500/15 via-red-500/5',
      border: 'border-red-500/20',
      iconBg: 'bg-red-500/15 text-red-500',
      accent: 'text-red-500',
      Icon: Lock,
      main: 'Your subscription is inactive',
      sub: 'add a payment method to unlock full access',
      cta: 'Reactivate',
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
      sub: 'choose a plan to keep everything running',
      cta: 'Choose plan',
    };
  } else {
    return null; // active → no banner
  }

  const { Icon } = variant;

  return (
    <Link
      href="/settings/billing"
      className={`group flex items-center justify-center gap-2.5 border-b ${variant.border} bg-gradient-to-r ${variant.grad} to-transparent px-4 py-2 backdrop-blur-sm transition-colors`}
    >
      <span className={`flex size-5 shrink-0 items-center justify-center rounded-full ${variant.iconBg}`}>
        <Icon className="h-3 w-3" strokeWidth={2.5} />
      </span>
      <span className="text-[13px] font-medium text-foreground">{variant.main}</span>
      <span className="hidden text-[13px] text-muted-foreground sm:inline">— {variant.sub}</span>
      <span
        className={`ml-0.5 inline-flex items-center gap-1 text-[12px] font-semibold ${variant.accent} transition-all group-hover:gap-1.5`}
      >
        {variant.cta}
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
