'use client';

import { billingApi } from '@/lib/api/endpoints';
import type { BillingAlertRow } from '@/lib/api/types';
import { money, date } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import { AlertBadge, BillingBadge } from '@/components/Badges';

const pct = (part: number, whole: number | null) => (whole ? `${Math.round((part / whole) * 100)}%` : '');

/** Bills that fell, syncs that failed, deals outgrown or ending — acknowledge once looked at. */
export function RevenuePanel({ alerts, reload, onOpen, onError }: {
  alerts: BillingAlertRow[];
  reload: () => Promise<void>;
  onOpen: (orgId: string) => void;
  onError: (m: string) => void;
}) {
  const { busy, run } = useAction(onError);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Billing needs a look</h2>
          <p
            className="text-xs text-slate-500">A bill that fell materially — a fifth, or €100 — or a Stripe sync that failed. Acknowledge once you have looked.</p>
        </div>
        <button
          onClick={() => run('reload', reload)}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700">Refresh</button>
      </div>
      {alerts.length === 0 ? (
        <div
          className={"rounded-xl border border-slate-800 p-8 text-center text-sm " +
            "text-slate-500"}>Nothing to look at — no bill has fallen and every sync is landing.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th
                className="px-3 py-2">Organization</th><th
                  className="px-3 py-2">What</th><th
                    className="px-3 py-2">Billing</th><th
                      className="px-3 py-2 text-right">Was</th><th
                        className="px-3 py-2 text-right">Now</th><th
                          className="px-3 py-2 text-right">Drop</th><th className="px-3 py-2">When</th><th className="px-3 py-2"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {alerts.map((a) => (
                <tr key={a.id} className="hover:bg-slate-900/50">
                  <td
                    className="px-3 py-2"><button
                      onClick={() => onOpen(a.organizationId)}
                      className="font-medium hover:text-blue-400">{a.organizationName}</button></td>
                  <td className="px-3 py-2"><AlertBadge kind={a.kind} /></td>
                  <td className="px-3 py-2"><BillingBadge mode={a.billingMode} /></td>
                  {a.kind === 'DROP' ? (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400">{money(a.fromCents ?? 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(a.toCents ?? 0)}</td>
                      <td
                        className="px-3 py-2 text-right tabular-nums font-semibold text-amber-400">−{money(
                          a.dropCents ??
                            0)}<span
                              className="ml-1 text-[11px] font-normal text-slate-500">{pct(a.dropCents ?? 0, a.fromCents)}</span></td>
                    </>
                  ) : a.kind === 'CONTRACT_DRIFT' ? (
                    // List price at the deal, list price now, the growth. The AGREED price is not
                    // here on purpose: it has not changed, and "now" would read as a price rise.
                    <>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400">{money(a.fromCents ?? 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(a.toCents ?? 0)}</td>
                      <td
                        className="px-3 py-2 text-right tabular-nums font-semibold text-amber-400">+{money(
                          Math.max(
                            0,
                            (a.toCents ??
                              0) - (a.fromCents ??
                                0)))}<span
                                  className="ml-1 text-[11px] font-normal text-slate-500">{pct(
                                    (a.toCents ?? 0) - (a.fromCents ?? 0),
                                    a.fromCents)}</span></td>
                    </>
                  ) : a.kind === 'CONTRACT_EXPIRING' ? (
                    <td
                      colSpan={3}
                      className="px-3 py-2 text-amber-300"><span
                        className="text-xs">{a.detail ??
                          'An agreed price is ending'}</span><span
                            className="ml-2 text-[11px] text-slate-500">the price holds until you change it</span></td>
                  ) : (
                    <td colSpan={3} className="px-3 py-2 text-red-300">
                      <span className="text-xs">{a.detail ?? 'Stripe sync failed'}</span>
                      {a.occurrences > 1 &&
                        <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">×{a.occurrences}</span>}
                    </td>
                  )}
                  <td className="px-3 py-2 text-slate-400">{date(a.lastSeenAt ?? a.createdAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      disabled={busy === a.id}
                      onClick={() => run(a.id, () => billingApi.ack(a.id), reload)}
                      className="rounded bg-slate-800 px-2 py-1 text-[11px] hover:bg-slate-700">Looked at it</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
