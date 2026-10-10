'use client';

import { useState } from 'react';
import { orgsApi } from '@/lib/api/endpoints';
import type { BillingMode, Cap, OrgDetail } from '@/lib/api/types';
import { isAbort } from '@/lib/api/client';
import { money, date } from '@/lib/format';
import { useAbortableEffect, useAction } from '@/lib/hooks';
import { toggleActiveAction } from '@/lib/org-actions';
import { BILLING_BADGE } from '@/components/Badges';
import { AgreedPrice } from './AgreedPrice';

/**
 * One organization, opened from the list or from a billing alert. Loads itself
 * by id and again after any change (`version`), so the list and the drawer can
 * never show two different states of the same company.
 */
export function OrgDrawer({ id, version, can, onClose, onChanged, onError }: {
  id: string;
  version: number;
  can: (c: Cap) => boolean;
  onClose: () => void;
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const { busy, run } = useAction(onError);
  useAbortableEffect(async (signal) => {
    try { setDetail(await orgsApi.detail(id, { signal })); } catch (e) { if (!isAbort(e)) onError((e as Error).message); }
  }, [id, version]);
  const act = (key: string, action: () => Promise<unknown>) => run(key, action, onChanged);

  const setMode = (d: OrgDetail, m: BillingMode) => {
    const days = m === 'INVOICE' ? Number(window.prompt('Payment terms — days until the invoice is due:', String(d.invoiceDueDays ?? 14))) : undefined;
    if (m === 'INVOICE' && (!days || days < 1)) return;
    const ok = window.confirm(
      m === 'AUTOMATIC'
        ? `Charge ${d.name}'s card automatically from now on?`
        : m === 'INVOICE'
          ? `Invoice ${d.name} instead of charging a card? Stripe will email the invoice, due in ${days} days.`
          : `Stop charging ${d.name} entirely? Nothing will be billed and no invoice raised.`,
    );
    if (ok) void act(d.id, () => orgsApi.setBillingMode(d.id, m, days));
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div role="dialog" aria-label="Organization" className="h-full w-full max-w-lg overflow-y-auto border-l border-slate-800 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
        {!detail ? <div className="text-sm text-slate-500">Loading…</div> : (
          <>
            <div className="mb-4 flex items-start justify-between">
              <div><h2 className="text-lg font-semibold">{detail.name}</h2><p className="text-xs text-slate-500">{detail.id}</p></div>
              <button onClick={onClose} aria-label="Close" className="text-slate-400">✕</button>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-slate-500">Status</div>{detail.subStatus?.toLowerCase()}{detail.suspendedAt && ' · deactivated'}</div>
              <div><div className="text-xs text-slate-500">MRR</div>{money(detail.mrrCents)}</div>
              <div><div className="text-xs text-slate-500">Seats</div>{detail.seats} active member{detail.seats === 1 ? '' : 's'}</div>
              <div><div className="text-xs text-slate-500">Trial ends</div>{date(detail.trialEndsAt)}</div>
              <div><div className="text-xs text-slate-500">Period ends</div>{date(detail.currentPeriodEnd)}</div>
            </div>

            {/* What they pay — after "can they use it", before "how they pay". */}
            {can('billingOps') && <AgreedPrice org={detail} busy={busy === detail.id} run={act} onError={onError} />}

            {can('manageOrgs') && (
              <div className="mb-4 rounded-lg border border-slate-800 p-3">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="text-xs text-slate-500">Access</span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${detail.suspendedAt ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'}`}>{detail.suspendedAt ? 'Deactivated' : 'Active'}</span>
                </div>
                <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
                  {detail.suspendedAt ? `Nobody in this organization can sign in. Deactivated ${date(detail.suspendedAt)}.` : 'Members can sign in and work normally.'}
                </p>
                <button disabled={busy === detail.id} onClick={() => { const a = toggleActiveAction(detail); if (a) void act(detail.id, a); }}
                  className={`rounded px-2.5 py-1 text-[11px] ${detail.suspendedAt ? 'bg-green-600/80 hover:bg-green-600' : 'bg-red-600/80 hover:bg-red-600'}`}>
                  {detail.suspendedAt ? 'Activate organization' : 'Deactivate organization'}
                </button>
              </div>
            )}

            {/* How they pay — not a toggle: each mode is its own button, and the two that change money confirm first. */}
            {can('billingOps') && (
              <div className="mb-4 rounded-lg border border-slate-800 p-3">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="text-xs text-slate-500">How they pay</span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${BILLING_BADGE[detail.billingMode ?? 'AUTOMATIC'].cls}`}>{BILLING_BADGE[detail.billingMode ?? 'AUTOMATIC'].label}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(['AUTOMATIC', 'INVOICE', 'EXTERNAL'] as BillingMode[]).map((m) => {
                    const current = (detail.billingMode ?? 'AUTOMATIC') === m;
                    return (
                      <button key={m} disabled={current || busy === detail.id} title={BILLING_BADGE[m].hint} onClick={() => setMode(detail, m)}
                        className={`rounded px-2 py-1 text-[11px] ${current ? 'bg-slate-700 text-slate-300' : 'bg-slate-800 hover:bg-slate-700'} disabled:opacity-60`}>
                        {BILLING_BADGE[m].label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  {BILLING_BADGE[detail.billingMode ?? 'AUTOMATIC'].hint}
                  {detail.billingMode === 'INVOICE' && ` · due in ${detail.invoiceDueDays ?? 14} days`}
                </p>
                {!detail.hasBillingEmail && <p className="mt-1 text-[11px] text-amber-400">No billing email — invoicing is refused until one is set.</p>}
              </div>
            )}

            <div className="mb-3">
              <div className="mb-1 text-xs text-slate-500">Options ({detail.addOns?.length ?? 0})</div>
              <div className="flex flex-wrap gap-1">
                {(detail.addOns ?? []).length === 0 ? <span className="text-[11px] text-slate-600">none purchased</span> : detail.addOns.map((a) => <span key={a} className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[11px] text-blue-300">{a}</span>)}
              </div>
            </div>
            <div className="mb-3">
              <div className="mb-1 text-xs text-slate-500">Org default modules ({detail.enabledModules?.length ?? 0})</div>
              <div className="flex flex-wrap gap-1">{(detail.enabledModules ?? []).map((m) => <span key={m} className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px]">{m}</span>)}</div>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">
                Members ({detail.memberTotal}){detail.memberTotal > detail.members.length && ` — first ${detail.members.length} shown`}
              </div>
              <div className="divide-y divide-slate-800 rounded-lg border border-slate-800">
                {detail.members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div><span className={m.isActive ? '' : 'text-slate-500 line-through'}>{m.firstName} {m.lastName}</span> {m.email && <span className="text-xs text-slate-500">{m.email}</span>}</div>
                    <span className="text-xs text-slate-400">{m.role?.toLowerCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
