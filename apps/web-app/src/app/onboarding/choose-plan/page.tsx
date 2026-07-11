'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, ArrowRight, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { billingApi } from '@/lib/api';
import {
  PLANS,
  officeSeatPriceCents,
  modulesForTier,
  type PlanTier,
  type BillingInterval,
} from '@hbcfield/shared/client';

const SELF_SERVE: Exclude<PlanTier, 'enterprise'>[] = ['starter', 'professional', 'business'];

const eur = (cents: number | null | undefined) =>
  cents == null ? 'Custom' : `€${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export default function ChoosePlanPage() {
  const router = useRouter();
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [busy, setBusy] = useState<string | null>(null);

  const subscribe = async (tier: Exclude<PlanTier, 'enterprise'>) => {
    setBusy(tier);
    try {
      const { url } = await billingApi.checkout(tier, interval);
      if (url) window.location.href = url;
      else toast.error('Could not start checkout');
    } catch (e: any) {
      toast.error(e?.message || 'Could not start checkout');
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Choose your plan</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
          You&apos;re on a 14-day free trial of Professional — no credit card needed. Subscribe now, or do it any
          time from Settings → Billing.
        </p>
      </div>

      {/* Interval toggle */}
      <div className="mt-8 flex items-center justify-center gap-2">
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
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {SELF_SERVE.map((tier) => {
          const p = PLANS[tier];
          const popular = tier === 'professional';
          return (
            <div
              key={tier}
              className={`flex flex-col rounded-xl border bg-white p-6 ${
                popular ? 'border-slate-800 ring-1 ring-slate-800' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium uppercase tracking-wide text-slate-500">{p.name}</span>
                {popular && (
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase text-white">
                    Popular
                  </span>
                )}
              </div>
              <div className="mt-2">
                <span className="text-3xl font-semibold text-slate-800">{eur(officeSeatPriceCents(tier, interval))}</span>
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
                variant={popular ? 'default' : 'outline'}
                disabled={busy !== null}
                onClick={() => subscribe(tier)}
              >
                {busy === tier ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Subscribe
              </Button>
            </div>
          );
        })}
      </div>

      {/* Enterprise */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <div className="text-sm text-slate-600">
          <span className="font-medium text-slate-700">Enterprise</span> — from €199/mo, multi-site & custom terms.
        </div>
        <a
          href="mailto:office@hbcfield.com?subject=HBCField%20Enterprise"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:underline"
        >
          Contact sales <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>

      {/* Skip → keep trialing */}
      <div className="mt-8 flex flex-col items-center gap-2">
        <button
          onClick={() => router.replace('/dashboard')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Continue with your 14-day free trial <ArrowRight className="h-4 w-4" />
        </button>
        <p className="text-xs text-slate-400">You won&apos;t be charged now.</p>
      </div>
    </div>
  );
}
