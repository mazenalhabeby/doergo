'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, ExternalLink, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { billingApi } from '@/lib/api';
import {
  PLANS,
  officeSeatPriceCents,
  fieldSeatPriceCents,
  modulesForTier,
  TIER_RANK,
  type PlanTier,
  type BillingInterval,
  type SubscriptionView,
} from '@hbcfield/shared/client';

const SELF_SERVE: Exclude<PlanTier, 'enterprise'>[] = ['starter', 'professional', 'business'];

const eur = (cents: number | null | undefined) =>
  cents == null ? 'Custom' : `€${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  trialing: { label: 'Trial', cls: 'bg-blue-100 text-blue-700' },
  active: { label: 'Active', cls: 'bg-green-100 text-green-700' },
  past_due: { label: 'Payment due', cls: 'bg-amber-100 text-amber-700' },
  canceled: { label: 'Canceled', cls: 'bg-slate-200 text-slate-600' },
  incomplete: { label: 'Inactive', cls: 'bg-red-100 text-red-700' },
};

export default function BillingPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [sub, setSub] = useState<SubscriptionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    billingApi
      .getSubscription()
      .then((s) => {
        setSub(s);
        setInterval(s.interval || 'monthly');
      })
      .catch((e) => toast.error(e?.message || 'Failed to load billing'))
      .finally(() => setLoading(false));
  }, []);

  const go = async (fn: () => Promise<{ url?: string } | void>, key: string) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res && 'url' in res && res.url) {
        window.location.href = res.url;
      } else {
        const fresh = await billingApi.getSubscription();
        setSub(fresh);
        toast.success('Done');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const st = sub ? STATUS_LABEL[sub.status] ?? STATUS_LABEL.active : STATUS_LABEL.active;
  const currentTier = sub?.planTier ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Billing & plan</h1>
        <p className="mt-1 text-sm text-slate-500">
          Office seats are billed by plan; field (mobile-only) technicians are €19 each.
        </p>
      </div>

      {/* Current status */}
      {sub && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-medium text-slate-800">
                  {currentTier ? PLANS[currentTier].name : 'No plan'}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
              </div>
              <div className="mt-2 text-sm text-slate-500">
                {sub.officeSeats} office · {sub.fieldSeats} field ·{' '}
                <span className="font-medium text-slate-700">
                  {eur(sub.totalCents)}
                  {sub.totalCents != null && `/${sub.interval === 'annual' ? 'yr' : 'mo'}`}
                </span>
              </div>
              {sub.status === 'trialing' && sub.trialDaysLeft != null && (
                <div className="mt-1 text-sm text-blue-600">{sub.trialDaysLeft} days left in trial</div>
              )}
              {sub.cancelAtPeriodEnd && sub.currentPeriodEnd && (
                <div className="mt-1 text-sm text-amber-600">
                  Cancels on {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                </div>
              )}
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                <Button variant="outline" disabled={busy !== null} onClick={() => go(() => billingApi.portal(), 'portal')}>
                  {busy === 'portal' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                  Payment & invoices
                </Button>
                {sub.status !== 'canceled' && !sub.cancelAtPeriodEnd && currentTier && (
                  <Button variant="outline" disabled={busy !== null} onClick={() => go(() => billingApi.cancel(), 'cancel')}>
                    Cancel
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {!isAdmin && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Only an organization admin can change the plan or payment method.
        </div>
      )}

      {/* Interval toggle */}
      <div className="flex items-center gap-2">
        {(['monthly', 'annual'] as BillingInterval[]).map((iv) => (
          <button
            key={iv}
            onClick={() => setInterval(iv)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              interval === iv ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {iv === 'annual' ? 'Annual (2 months free)' : 'Monthly'}
          </button>
        ))}
      </div>

      {/* Plan cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {SELF_SERVE.map((tier) => {
          const p = PLANS[tier];
          const price = officeSeatPriceCents(tier, interval);
          const isCurrent = currentTier === tier;
          const isDowngrade = currentTier ? TIER_RANK[tier] < TIER_RANK[currentTier] : false;
          return (
            <div
              key={tier}
              className={`flex flex-col rounded-xl border bg-white p-6 ${
                isCurrent ? 'border-slate-800 ring-1 ring-slate-800' : 'border-slate-200'
              }`}
            >
              <div className="text-sm font-medium uppercase tracking-wide text-slate-500">{p.name}</div>
              <div className="mt-2">
                <span className="text-3xl font-semibold text-slate-800">{eur(price)}</span>
                <span className="text-sm text-slate-500"> / office seat / {interval === 'annual' ? 'yr' : 'mo'}</span>
              </div>
              <ul className="mt-5 flex-1 space-y-2">
                {modulesForTier(tier).slice(0, 7).map((m) => (
                  <li key={m} className="flex items-center gap-2 text-sm text-slate-600">
                    <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                    {m.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-6"
                disabled={!isAdmin || isCurrent || busy !== null}
                variant={isCurrent ? 'outline' : 'default'}
                onClick={() =>
                  go(
                    () =>
                      currentTier && sub?.status === 'active'
                        ? billingApi.changePlan(tier, interval)
                        : billingApi.checkout(tier, interval),
                    tier,
                  )
                }
              >
                {busy === tier ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {isCurrent ? 'Current plan' : isDowngrade ? 'Downgrade' : currentTier ? 'Switch' : 'Choose'}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Enterprise */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-6">
        <div>
          <div className="text-sm font-medium uppercase tracking-wide text-slate-500">Enterprise</div>
          <div className="mt-1 text-slate-700">From €199/mo — multi-site, custom terms, priority support.</div>
        </div>
        <a
          href="mailto:office@hbcfield.com?subject=HBCField%20Enterprise"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Contact sales <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
