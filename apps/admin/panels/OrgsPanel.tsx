'use client';

import { useState } from 'react';
import { orgsApi } from '@/lib/api/endpoints';
import type { Cap, OrgRow, Overview } from '@/lib/api/types';
import { isAbort } from '@/lib/api/client';
import { money, date } from '@/lib/format';
import { useAbortableEffect, useAction, useDebounced } from '@/lib/hooks';
import { toggleActiveAction } from '@/lib/org-actions';
import { Stat } from '@/components/Stat';
import { BillingBadge, SubStatusPill } from '@/components/Badges';

const STATUSES = ['all', 'active', 'trialing', 'past_due', 'canceled', 'incomplete'];

/**
 * The organization list and the header numbers.
 *
 * The overview loads once when the tab is opened and again after a change
 * (`version`), not on every keystroke. The search waits 300 ms for the
 * operator to stop typing and cancels the request it replaces, so a slow
 * answer to "ac" can never overwrite the answer to "acme".
 */
export function OrgsPanel({ can, version, onChanged, onOpen, onError }: {
  can: (c: Cap) => boolean;
  version: number;
  onChanged: () => void;
  onOpen: (id: string) => void;
  onError: (m: string) => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const term = useDebounced(search.trim(), 300);
  const { busy, run } = useAction(onError);

  useAbortableEffect(async (signal) => {
    try { setOverview(await orgsApi.overview({ signal })); } catch (e) { if (!isAbort(e)) onError((e as Error).message); }
  }, [version]);

  useAbortableEffect(async (signal) => {
    setLoading(true);
    try {
      const page = await orgsApi.list({ search: term, status }, { signal });
      setOrgs(page.data);
      setCursor(page.nextCursor);
    } catch (e) {
      if (!isAbort(e)) onError((e as Error).message);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [term, status, version]);

  const loadMore = () => cursor && run('more', async () => {
    const page = await orgsApi.list({ search: term, status, cursor });
    setOrgs((cur) => [...cur, ...page.data]);
    setCursor(page.nextCursor);
  });

  const act = (key: string, action: () => Promise<unknown>) => run(key, action, onChanged);

  return (
    <>
      {overview && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <Stat label="MRR" value={money(overview.mrrCents)} sub={`${money(overview.arrCents)} ARR`} />
          <Stat label="Organizations" value={String(overview.totalOrgs)} sub={`+${overview.newLast30} in 30d`} />
          <Stat label="Active" value={String(overview.byStatus.active ?? 0)} />
          <Stat label="Trialing" value={String(overview.trialing)} />
          <Stat label="Deactivated" value={String(overview.suspended)} />
          <Stat label="Seats" value={String(overview.seats)} sub="one price, all members" />
          {overview.agreedCount > 0 && (
            <Stat label="Agreed away" value={money(overview.agreedAwayCents)} sub={`${overview.agreedCount} on an agreed price`} />
          )}
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input aria-label="Search organizations" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search org…"
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm outline-none focus:border-blue-500" />
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm">
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={onChanged} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700">Refresh</button>
        {loading && <span className="text-xs text-slate-500">loading…</span>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th
                className="px-3 py-2">Organization</th><th
                  className="px-3 py-2">Status</th><th className="px-3 py-2">Billing</th><th className="px-3 py-2">Options</th>
              <th
                className="px-3 py-2 text-right">Members</th><th
                  className="px-3 py-2 text-right">Seats</th><th className="px-3 py-2 text-right">Charged</th>
              <th className="px-3 py-2 text-right">List</th><th className="px-3 py-2">Trial ends</th><th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {orgs.map((o) => (
              <tr key={o.id} className="hover:bg-slate-900/50">
                <td className="px-3 py-2">
                  <button onClick={() => onOpen(o.id)} className="font-medium hover:text-blue-400">{o.name}</button>
                  {o.suspendedAt && <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">DEACTIVATED</span>}
                  {o.agreedMonthlyCents != null && (
                    <span
                      title={`Agreed ${money(o.agreedMonthlyCents)}/mo${o.agreedNote ? ` — ${o.agreedNote}` : ''}`}
                      className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">AGREED</span>
                  )}
                </td>
                <td className="px-3 py-2"><SubStatusPill status={o.subStatus} /></td>
                <td className="px-3 py-2"><BillingBadge mode={o.billingMode} /></td>
                <td className="px-3 py-2">
                  {o.addOns?.length
                    ? <span className="text-xs text-slate-300" title={o.addOns.join(', ')}>{o.addOns.length}</span>
                    : <span className="text-xs text-slate-600">none</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{o.memberCount}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-400">{o.seats}</td>
                {/* Charged is revenue; List is what the product is worth to them — the gap is the point. */}
                <td className="px-3 py-2 text-right tabular-nums">{money(o.mrrCents)}</td>
                <td
                  className="px-3 py-2 text-right tabular-nums text-slate-500">{o.agreedMonthlyCents != null
                    ? money(o.agreedListCents ?? 0)
                    : money(o.mrrCents)}</td>
                <td className="px-3 py-2 text-slate-400">{date(o.trialEndsAt)}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    {can('extendTrial') && (
                      <button
                        disabled={busy === o.id}
                        onClick={() => act(o.id, () => orgsApi.extendTrial(o.id, 14))}
                        className="rounded bg-slate-800 px-2 py-1 text-[11px] hover:bg-slate-700">+14d</button>
                    )}
                    {/* End the trial now — the operator's cue that the conversation about paying has begun. */}
                    {can('extendTrial') && o.subStatus?.toLowerCase() === 'trialing' && (
                      <button
                        disabled={busy === o.id}
                        onClick={() => { if (window.confirm(
                          `End ${o.name}'s trial now? They will be asked to set up payment.`)) act(o.id, () => orgsApi.endTrial(o.id)); }}
                        className="rounded bg-slate-800 px-2 py-1 text-[11px] text-amber-400 hover:bg-slate-700">End trial</button>
                    )}
                    {can('manageOrgs') && (
                      <button disabled={busy === o.id} onClick={() => { const a = toggleActiveAction(o); if (a) act(o.id, a); }}
                        className={`rounded px-2 py-1 text-[11px] ${o.suspendedAt
                          ? 'bg-green-600/80 hover:bg-green-600'
                          : 'bg-red-600/80 hover:bg-red-600'}`}>
                        {o.suspendedAt ? 'Activate' : 'Deactivate'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {orgs.length === 0 &&
              !loading &&
              <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-500">No organizations.</td></tr>}
          </tbody>
        </table>
      </div>
      {cursor && (
        <div className="mt-3 text-center">
          <button
            disabled={busy === 'more'}
            onClick={loadMore}
            className={"rounded-lg bg-slate-800 px-4 py-1.5 text-sm hover:bg-slate-700 " + "disabled:opacity-40"}>Load more</button>
        </div>
      )}
    </>
  );
}
