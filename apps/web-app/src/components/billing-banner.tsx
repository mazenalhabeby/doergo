'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, Lock, ArrowRight } from 'lucide-react';
import { billingApi } from '@/lib/api';
import type { SubscriptionView } from '@hbcfield/shared/client';

/**
 * Slim status banner shown across the dashboard when billing needs attention:
 * trial countdown, failed payment, or an inactive (locked) subscription. Hidden
 * for healthy active subscriptions. Links to /settings/billing.
 */
export function BillingBanner() {
  const [sub, setSub] = useState<SubscriptionView | null>(null);

  useEffect(() => {
    let alive = true;
    billingApi
      .getSubscription()
      .then((s) => alive && setSub(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!sub) return null;

  let cls = '';
  let icon = null as React.ReactNode;
  let text = '';

  if (sub.status === 'incomplete' || sub.status === 'canceled') {
    cls = 'bg-red-50 text-red-800 hover:bg-red-100';
    icon = <Lock className="h-3.5 w-3.5 shrink-0" />;
    text = 'Your subscription is inactive — add a payment method to unlock full access.';
  } else if (sub.status === 'past_due') {
    cls = 'bg-amber-50 text-amber-800 hover:bg-amber-100';
    icon = <AlertTriangle className="h-3.5 w-3.5 shrink-0" />;
    text = 'A payment failed — please update your payment method.';
  } else if (sub.status === 'trialing') {
    const d = sub.trialDaysLeft ?? 0;
    cls = d <= 3 ? 'bg-amber-50 text-amber-800 hover:bg-amber-100' : 'bg-blue-50 text-blue-800 hover:bg-blue-100';
    icon = <Clock className="h-3.5 w-3.5 shrink-0" />;
    text = `${d} day${d === 1 ? '' : 's'} left in your free trial — choose a plan to keep everything running.`;
  } else {
    return null; // active → no banner
  }

  return (
    <Link
      href="/settings/billing"
      className={`flex items-center justify-center gap-2 border-b border-black/5 px-4 py-2 text-center text-[13px] font-medium transition-colors ${cls}`}
    >
      {icon}
      <span>{text}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0" />
    </Link>
  );
}
