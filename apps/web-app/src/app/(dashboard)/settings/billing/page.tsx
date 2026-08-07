'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, ExternalLink, ArrowUpRight, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { notify } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { billingApi } from '@/lib/api';
import {
  PLANS,
  officeSeatPriceCents,
  FIELD_SEAT_MONTHLY_CENTS,
  IN_HOUSE_FIELD_SEAT_MONTHLY_CENTS,
  TIER_RANK,
  type PlanTier,
  type BillingInterval,
  type SubscriptionView,
} from '@hbcfield/shared/client';
import { tierDelta, planFeatureLabel } from '@/lib/plan-features';

const SELF_SERVE: Exclude<PlanTier, 'enterprise'>[] = ['starter', 'professional', 'business'];

const eur = (cents: number | null | undefined) =>
  cents == null ? 'Custom' : `€${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  trialing: { label: 'Trial', cls: 'bg-primary/10 text-primary' },
  active: { label: 'Active', cls: 'bg-emerald-500/10 text-emerald-500' },
  past_due: { label: 'Payment due', cls: 'bg-amber-500/10 text-amber-500' },
  canceled: { label: 'Canceled', cls: 'bg-muted text-muted-foreground' },
  incomplete: { label: 'Inactive', cls: 'bg-red-500/10 text-red-500' },
};

export default function BillingPage() {
  const { t } = useTranslation();
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
      .catch((e) => notify.error(e?.message || t('toast.billingLoadFailed', "Couldn't load billing details.")))
      .finally(() => setLoading(false));
  }, []);

  const go = async (fn: () => Promise<{ url?: string } | void>, key: string) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res && 'url' in res && res.url) {
        window.location.href = res.url;
      } else {
        setSub(await billingApi.getSubscription());
        notify.success(t('toast.billingUpdated', 'Billing updated.'));
      }
    } catch (e: any) {
      notify.error(e?.message);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const st = sub ? STATUS_BADGE[sub.status] ?? STATUS_BADGE.active : STATUS_BADGE.active;
  const currentTier = sub?.planTier ?? null;

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Billing & plan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Office seats are billed by plan; field (mobile-only) technicians are {eur(FIELD_SEAT_MONTHLY_CENTS)} each
            ({eur(IN_HOUSE_FIELD_SEAT_MONTHLY_CENTS)} for in-house/employed techs).
          </p>
        </div>

        {/* Current status */}
        {sub && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-lg font-semibold text-foreground">
                    {currentTier ? PLANS[currentTier].name : 'No plan'}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  <span>{sub.officeSeats} office</span>
                  <span className="text-border">·</span>
                  <span>{sub.fieldSeats} field</span>
                  {sub.fieldInhouseSeats > 0 && (
                    <>
                      <span className="text-border">·</span>
                      <span>{sub.fieldInhouseSeats} in-house</span>
                    </>
                  )}
                  {sub.totalCents != null && (
                    <>
                      <span className="text-border">·</span>
                      <span className="font-medium text-foreground">
                        {eur(sub.totalCents)}/{sub.interval === 'annual' ? 'yr' : 'mo'}
                      </span>
                    </>
                  )}
                </div>
                {sub.status === 'trialing' && sub.trialDaysLeft != null && (
                  <div className="mt-1.5 text-sm font-medium text-primary">{sub.trialDaysLeft} days left in trial</div>
                )}
                {sub.cancelAtPeriodEnd && sub.currentPeriodEnd && (
                  <div className="mt-1.5 text-sm text-amber-500">
                    Cancels on {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                  </div>
                )}
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => go(() => billingApi.portal(), 'portal')}>
                    {busy === 'portal' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                    Payment & invoices
                  </Button>
                  {sub.status !== 'canceled' && !sub.cancelAtPeriodEnd && currentTier && (
                    <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => go(() => billingApi.cancel(), 'cancel')}>
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {!isAdmin && (
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Only an organization admin can change the plan or payment method.
          </div>
        )}

        {/* Interval toggle */}
        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 p-1">
          {(['monthly', 'annual'] as BillingInterval[]).map((iv) => (
            <button
              key={iv}
              onClick={() => setInterval(iv)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                interval === iv ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {iv === 'annual' ? 'Annual · 2 months free' : 'Monthly'}
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
            const popular = tier === 'professional';
            const { prevName, features } = tierDelta(tier);
            return (
              <div
                key={tier}
                className={`relative flex flex-col rounded-xl border bg-card p-6 transition-colors ${
                  isCurrent ? 'border-primary ring-1 ring-primary/40' : 'border-border hover:border-foreground/20'
                }`}
              >
                {popular && !isCurrent && (
                  <span className="absolute -top-2.5 right-5 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                    <Sparkles className="h-3 w-3" /> Popular
                  </span>
                )}
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{p.name}</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold text-foreground">{eur(price)}</span>
                  <span className="text-sm text-muted-foreground">/ seat / {interval === 'annual' ? 'yr' : 'mo'}</span>
                </div>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {prevName && (
                    <li className="text-sm font-medium text-muted-foreground">Everything in {prevName}, plus:</li>
                  )}
                  {features.map((m) => (
                    <li key={m} className="flex items-center gap-2 text-sm text-foreground/80">
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                        <Check className="h-2.5 w-2.5 text-emerald-500" strokeWidth={3} />
                      </span>
                      {planFeatureLabel(m)}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-6 w-full"
                  disabled={!isAdmin || isCurrent || busy !== null}
                  variant={isCurrent ? 'outline' : popular ? 'default' : 'secondary'}
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
                  {busy === tier ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {isCurrent ? 'Current plan' : isDowngrade ? 'Downgrade' : currentTier ? 'Switch' : 'Choose'}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Enterprise */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-muted/40 p-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enterprise</div>
            <div className="mt-1 text-sm text-foreground/80">
              From €199/mo — multi-site, custom terms, priority support.
            </div>
          </div>
          <a
            href="mailto:office@hbcfield.com?subject=HBCField%20Enterprise"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Contact sales <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
