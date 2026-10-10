'use client';

import { useCallback, useEffect, useState } from 'react';
import { auditApi } from '@/lib/api/endpoints';
import type { AuditRow } from '@/lib/api/types';
import { dateTime } from '@/lib/format';
import { useAction } from '@/lib/hooks';

const ACTOR: Record<AuditRow['actorType'], string> = { STAFF: 'bg-blue-500/15 text-blue-300', STATIC_KEY: 'bg-amber-500/15 text-amber-400', ANONYMOUS: 'bg-slate-700 text-slate-300' };

/**
 * The operator audit trail — read-only. Every platform change and every
 * static-key call, newest first. The table cannot be edited from anywhere
 * (the database refuses UPDATE and DELETE), so neither can this screen.
 */
export function AuditPanel({ onError, onOpenOrg }: { onError: (s: string) => void; onOpenOrg: (id: string) => void }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const { busy, run } = useAction(onError);

  const load = useCallback(async () => { const p = await auditApi.list({}); setRows(p.data); setCursor(p.nextCursor); }, []);
  const more = () => cursor && run('more', async () => { const p = await auditApi.list({ cursor }); setRows((r) => [...r, ...p.data]); setCursor(p.nextCursor); });
  useEffect(() => { void run('load', load); }, [run, load]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Audit trail</h2>
          <p className="text-xs text-slate-500">Who did what on this console — and every call made with the static platform key. Append-only.</p>
        </div>
        <button onClick={() => run('load', load)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700">Refresh</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Who</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Organization</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">From</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((r) => (
              <tr key={r.id} className="align-top hover:bg-slate-900/50">
                <td className="whitespace-nowrap px-3 py-2 text-slate-400">{dateTime(r.createdAt)}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${ACTOR[r.actorType] ?? ''}`}>{r.actorType === 'STATIC_KEY' ? 'static key' : r.actorType.toLowerCase()}</span>
                  <span className="ml-1.5 text-xs">{r.actorLabel ?? '—'}</span>{r.actorRole && <span className="ml-1 text-[10px] text-slate-500">{r.actorRole}</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="font-mono text-xs">{r.action}</div>
                  <div className="text-[10px] text-slate-500">{r.method} {r.route}</div>
                  {r.summary != null && (
                    <details className="mt-0.5 text-[10px] text-slate-500"><summary className="cursor-pointer">request</summary><pre className="max-w-md overflow-x-auto whitespace-pre-wrap">{JSON.stringify(r.summary, null, 1)}</pre></details>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">{r.targetOrganizationId ? <button onClick={() => onOpenOrg(r.targetOrganizationId!)} className="hover:text-blue-400">{r.targetOrganizationName ?? r.targetOrganizationId}</button> : '—'}</td>
                <td className="px-3 py-2 text-xs">{r.ok ? <span className="text-green-400">ok</span> : <span className="text-red-400" title={r.error ?? undefined}>failed {r.statusCode ?? ''}</span>}</td>
                <td className="px-3 py-2 text-[10px] text-slate-500">{r.ipAddress ?? '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Nothing recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {cursor && <div className="mt-3 text-center"><button disabled={busy === 'more'} onClick={more} className="rounded-lg bg-slate-800 px-4 py-1.5 text-sm hover:bg-slate-700 disabled:opacity-40">Load more</button></div>}
    </div>
  );
}
