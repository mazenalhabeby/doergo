'use client';

import { useEffect, useState } from 'react';
import { pricingApi } from '@/lib/api/endpoints';
import type { PriceList, StripeStatus } from '@/lib/api/types';
import { money } from '@/lib/format';
import { useAction } from '@/lib/hooks';

const exact = (c: number) => money(c, { exact: true });
const section = 'border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500';

/**
 * What the platform charges — read from the code that bills. Read-only by
 * construction: prices live in packages/shared/src/billing/*, so changing one
 * is a reviewed deploy, not a form.
 */
export function PricingPanel({ canCheckStripe, onError }: { canCheckStripe: boolean; onError: (s: string) => void }) {
  const [list, setList] = useState<PriceList | null>(null);
  const [stripe, setStripe] = useState<StripeStatus | null>(null);
  const { busy, run } = useAction(onError);
  useEffect(() => { void run('load', async () => setList(await pricingApi.list())); }, [run]);

  if (!list) return <div className="rounded-xl border border-slate-800 p-8 text-center text-slate-500">Loading pricing…</div>;
  const problems = stripe ? stripe.missing.length + stripe.mismatched.length + stripe.orphaned.length : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">Read-only</span>
        <span className="text-slate-400">Prices live in the code that produces invoices — changing one is a deploy, not a form.</span>
      </div>
      <div className="rounded-xl border border-slate-800">
        <div className={section}>Per person</div>
        <div className="flex items-baseline gap-3 px-4 py-3">
          <span className="text-2xl font-semibold tabular-nums">{exact(list.seatMonthlyCents)}</span>
          <span className="text-sm text-slate-400">per active member / month — the same for everyone, no seat types</span>
        </div>
      </div>
      <div className="rounded-xl border border-slate-800">
        <div className={section}>Modules — per space ({list.modules.length})</div>
        <div className="divide-y divide-slate-800">
          {list.modules.map((m) => (
            <div key={m.key} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="w-40 shrink-0">{m.label}</span>
              <span className="w-24 shrink-0 tabular-nums">{exact(m.monthlyCents)}</span>
              {m.counted && <span className="shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-blue-300">+ per unit</span>}
              <span className="truncate text-xs text-slate-500">{m.description}</span>
              <span className="ml-auto shrink-0 font-mono text-[11px] text-slate-600">{m.key}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-slate-800">
        <div className={section}>Volume ladders — graduated, per space</div>
        <div className="grid gap-px bg-slate-800 sm:grid-cols-3">
          {list.ladders.map((l) => (
            <div key={l.moduleKey} className="bg-slate-950 p-4">
              <div className="text-sm font-medium">{l.label}</div>
              <div className="mt-0.5 text-xs text-slate-500">first {l.included} {l.unit}{l.included === 1 ? '' : 's'} included</div>
              <div className="mt-2 space-y-1 text-xs tabular-nums">
                {l.bands.map((b, i) => {
                  const from = (i === 0 ? l.included : (l.bands[i - 1].upTo ?? 0)) + 1;
                  return <div key={i} className="flex justify-between gap-3"><span className="text-slate-500">{b.upTo == null ? `${from}+` : `${from} – ${b.upTo}`}</span><span>{exact(b.unitCents)}</span></div>;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-slate-800">
        <div className={section}>Add-ons — once per organization ({list.addOns.length})</div>
        <div className="divide-y divide-slate-800">
          {list.addOns.map((a) => (
            <div key={a.key} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="w-40 shrink-0">{a.label}</span>
              <span className="w-24 shrink-0 tabular-nums">{exact(a.monthlyCents)}</span>
              <span className="truncate text-xs text-slate-500">{a.description}</span>
              <span className="ml-auto shrink-0 font-mono text-[11px] text-slate-600">{a.key}</span>
            </div>
          ))}
        </div>
      </div>
      {canCheckStripe ? (
        <div className="rounded-xl border border-slate-800 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold">Does Stripe agree?</span>
            <button onClick={() => run('stripe', async () => setStripe(await pricingApi.stripe()))} disabled={busy === 'stripe'} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700 disabled:opacity-40">{busy === 'stripe' ? 'Checking…' : 'Check Stripe'}</button>
            <span className="text-xs text-slate-500">Reads the live account. Writes nothing — fixes are `tools/stripe/sync-modules.mjs`.</span>
          </div>
          {stripe && (
            <div className="mt-3 space-y-2 text-sm">
              {!stripe.configured ? <div className="text-amber-400">Stripe is not configured on this service.</div> : (
                <>
                  <div className={problems === 0 ? 'text-green-400' : 'text-slate-300'}>{stripe.matched} of {stripe.expected} prices correct{problems === 0 ? ' — Stripe matches the code exactly.' : ''}</div>
                  {stripe.mismatched.length > 0 && (
                    <div className="rounded border border-red-900/60 bg-red-950/30 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-red-400">{stripe.mismatched.length} charging an amount the code does not say</div>
                      {stripe.mismatched.map((m) => <div key={m.lookupKey} className="mt-1 flex gap-3 text-xs tabular-nums"><span className="w-64 font-mono">{m.lookupKey}</span><span className="text-slate-400">code {exact(m.codeCents)}</span><span className="text-red-300">stripe {exact(m.stripeCents)}</span></div>)}
                    </div>
                  )}
                  {stripe.missing.length > 0 && (
                    <div className="rounded border border-amber-900/60 bg-amber-950/20 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-amber-400">{stripe.missing.length} priced in code but absent from Stripe — checkout would fail on these lines</div>
                      {stripe.missing.map((m) => <div key={m.lookupKey} className="mt-1 flex gap-3 text-xs tabular-nums"><span className="w-64 font-mono">{m.lookupKey}</span><span className="text-slate-400">{exact(m.cents)}</span></div>)}
                    </div>
                  )}
                  {stripe.orphaned.length > 0 && (
                    <div className="rounded border border-slate-700 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{stripe.orphaned.length} active in Stripe but gone from the code — sellable, billing nothing</div>
                      {stripe.orphaned.map((o) => <div key={o.lookupKey} className="mt-1 flex gap-3 text-xs tabular-nums"><span className="w-64 font-mono">{o.lookupKey}</span><span className="text-slate-400">{exact(o.cents)} / {o.interval}</span></div>)}
                      <div className="mt-2 text-[11px] text-slate-500">Retire with `sync-modules.mjs --archive-orphans` (skips anything still subscribed).</div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ) : <div className="text-xs text-slate-500">Checking Stripe needs `editPricing`.</div>}
    </div>
  );
}
