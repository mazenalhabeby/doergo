'use client';

/**
 * PLATFORM CONTROL CENTER (HBC internal — NOT a customer page). Hidden route, no
 * customer login. Gated purely by PLATFORM_ADMIN_KEY: paste it once (kept in
 * sessionStorage) and every request sends it as `x-platform-admin-key`. Lets the
 * operator run the whole SaaS: overview metrics, organizations, seats/members,
 * and org controls (tier / trial / suspend). Editable pricing is a later phase.
 */
import { useCallback, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
const TIERS = ['starter', 'professional', 'business', 'enterprise'] as const;
type Tier = (typeof TIERS)[number];

const eur = (cents?: number | null) =>
  cents == null ? '—' : `€${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const date = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : '—');

interface Seats { office: number; field: number; fieldInhouse: number; total: number }
interface Overview {
  totalOrgs: number; trialing: number; suspended: number; newLast30: number;
  byStatus: Record<string, number>; seats: Seats; mrrCents: number; arrCents: number;
}
interface OrgRow {
  id: string; name: string; planTier: string | null; subStatus: string;
  trialEndsAt: string | null; currentPeriodEnd: string | null; suspendedAt: string | null;
  createdAt: string; memberCount: number; seats: Seats; mrrCents: number; stripeCustomerId: string | null;
}
interface OrgDetail extends OrgRow {
  enabledModules: string[]; billingEmail: string | null; vatId: string | null;
  members: Array<{ id: string; firstName: string; lastName: string; email: string; role: string; isActive: boolean; employmentType: string | null; lastActiveAt: string | null }>;
}

async function apiFetch<T>(path: string, key: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'x-platform-admin-key': key, ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
  return body as T;
}

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-500/15 text-green-400', trialing: 'bg-blue-500/15 text-blue-400',
  past_due: 'bg-amber-500/15 text-amber-400', canceled: 'bg-slate-500/15 text-slate-400',
  incomplete: 'bg-red-500/15 text-red-400',
};

export default function OperatorPage() {
  const [key, setKey] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  useEffect(() => { const s = sessionStorage.getItem('platformKey'); if (s) setKey(s); }, []);

  const load = useCallback(async (k: string) => {
    setLoading(true); setError(null);
    try {
      const [ov, list] = await Promise.all([
        apiFetch<{ data: Overview }>('/platform/overview', k),
        apiFetch<{ data: OrgRow[] }>(`/platform/orgs?status=${status}${search ? `&search=${encodeURIComponent(search)}` : ''}`, k),
      ]);
      setOverview(ov.data); setOrgs(list.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      if (String(e).includes('Forbidden')) { setKey(''); sessionStorage.removeItem('platformKey'); }
    } finally { setLoading(false); }
  }, [status, search]);

  useEffect(() => { if (key) load(key); }, [key, load]);

  const act = async (id: string, path: string, init?: RequestInit) => {
    setBusyId(id);
    try { await apiFetch(`/platform/orgs/${id}${path}`, key, { method: 'POST', ...init }); await load(key); if (detail?.id === id) openDetail(id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusyId(null); }
  };
  const setTier = async (id: string, tier: Tier) => {
    setBusyId(id);
    try { await apiFetch('/billing/admin/org-tier', key, { method: 'POST', body: JSON.stringify({ organizationId: id, tier }) }); await load(key); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setBusyId(null); }
  };
  const openDetail = async (id: string) => {
    try { const r = await apiFetch<{ data: OrgDetail }>(`/platform/orgs/${id}`, key); setDetail(r.data); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  };

  // ── Key gate ──
  if (!key) {
    return (
      <div style={{ minHeight: '100vh' }} className="flex items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h1 className="mb-1 text-lg font-semibold">Platform Control Center</h1>
          <p className="mb-4 text-sm text-slate-400">Enter the operator key.</p>
          <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && keyInput) { sessionStorage.setItem('platformKey', keyInput); setKey(keyInput); } }}
            placeholder="PLATFORM_ADMIN_KEY" className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          <button onClick={() => { if (keyInput) { sessionStorage.setItem('platformKey', keyInput); setKey(keyInput); } }}
            className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-500">Unlock</button>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>
      </div>
    );
  }

  const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh' }} className="bg-slate-950 p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Platform Control Center</h1>
          <button onClick={() => { setKey(''); sessionStorage.removeItem('platformKey'); }} className="text-xs text-slate-400 hover:text-slate-200">Lock</button>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}

        {/* Overview */}
        {overview && (
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <Stat label="MRR" value={eur(overview.mrrCents)} sub={`${eur(overview.arrCents)} ARR`} />
            <Stat label="Organizations" value={String(overview.totalOrgs)} sub={`+${overview.newLast30} in 30d`} />
            <Stat label="Active" value={String(overview.byStatus.active ?? 0)} />
            <Stat label="Trialing" value={String(overview.trialing)} />
            <Stat label="Suspended" value={String(overview.suspended)} />
            <Stat label="Seats" value={String(overview.seats.total)} sub={`${overview.seats.office} office · ${overview.seats.field + overview.seats.fieldInhouse} field`} />
          </div>
        )}

        {/* Filters */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(key)}
            placeholder="Search org…" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm outline-none focus:border-blue-500" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm">
            {['all', 'active', 'trialing', 'past_due', 'canceled', 'incomplete'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => load(key)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700">{loading ? '…' : 'Refresh'}</button>
        </div>

        {/* Orgs table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Organization</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2 text-right">Members</th><th className="px-3 py-2 text-right">Seats</th>
                <th className="px-3 py-2 text-right">MRR</th><th className="px-3 py-2">Trial ends</th><th className="px-3 py-2">Created</th><th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {orgs.map((o) => (
                <tr key={o.id} className="hover:bg-slate-900/50">
                  <td className="px-3 py-2">
                    <button onClick={() => openDetail(o.id)} className="font-medium text-slate-100 hover:text-blue-400">{o.name}</button>
                    {o.suspendedAt && <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">SUSPENDED</span>}
                  </td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_COLOR[o.subStatus?.toLowerCase()] ?? 'bg-slate-700 text-slate-300'}`}>{o.subStatus?.toLowerCase()}</span></td>
                  <td className="px-3 py-2">
                    <select value={(o.planTier ?? '').toLowerCase()} disabled={busyId === o.id} onChange={(e) => setTier(o.id, e.target.value as Tier)}
                      className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-xs">
                      <option value="">—</option>
                      {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.memberCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400" title={`${o.seats.office} office · ${o.seats.field} field · ${o.seats.fieldInhouse} in-house`}>{o.seats.total}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{eur(o.mrrCents)}</td>
                  <td className="px-3 py-2 text-slate-400">{date(o.trialEndsAt)}</td>
                  <td className="px-3 py-2 text-slate-400">{date(o.createdAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button disabled={busyId === o.id} onClick={() => act(o.id, '/extend-trial', { body: JSON.stringify({ days: 14 }) })} className="rounded bg-slate-800 px-2 py-1 text-[11px] hover:bg-slate-700" title="Extend trial 14 days">+14d</button>
                      {o.suspendedAt ? (
                        <button disabled={busyId === o.id} onClick={() => act(o.id, '/reactivate')} className="rounded bg-green-600/80 px-2 py-1 text-[11px] hover:bg-green-600">Reactivate</button>
                      ) : (
                        <button disabled={busyId === o.id} onClick={() => act(o.id, '/suspend')} className="rounded bg-red-600/80 px-2 py-1 text-[11px] hover:bg-red-600">Suspend</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && !loading && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">No organizations.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setDetail(null)}>
          <div className="h-full w-full max-w-lg overflow-y-auto border-l border-slate-800 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">{detail.name}</h2>
                <p className="text-xs text-slate-500">{detail.id}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-slate-500">Status</div>{detail.subStatus?.toLowerCase()}{detail.suspendedAt && ' (suspended)'}</div>
              <div><div className="text-xs text-slate-500">Tier</div>{detail.planTier?.toLowerCase() ?? '—'}</div>
              <div><div className="text-xs text-slate-500">MRR</div>{eur(detail.mrrCents)}</div>
              <div><div className="text-xs text-slate-500">Seats</div>{detail.seats.office} office · {detail.seats.field} field · {detail.seats.fieldInhouse} in-house</div>
              <div><div className="text-xs text-slate-500">Trial ends</div>{date(detail.trialEndsAt)}</div>
              <div><div className="text-xs text-slate-500">Period ends</div>{date(detail.currentPeriodEnd)}</div>
              <div className="col-span-2"><div className="text-xs text-slate-500">Billing email / VAT</div>{detail.billingEmail ?? '—'} · {detail.vatId ?? '—'}</div>
            </div>
            <div className="mb-4">
              <div className="mb-1 text-xs text-slate-500">Modules ({detail.enabledModules?.length ?? 0})</div>
              <div className="flex flex-wrap gap-1">{(detail.enabledModules ?? []).map((m) => <span key={m} className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300">{m}</span>)}</div>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">Members ({detail.members.length})</div>
              <div className="divide-y divide-slate-800 rounded-lg border border-slate-800">
                {detail.members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div><span className={m.isActive ? '' : 'text-slate-500 line-through'}>{m.firstName} {m.lastName}</span> <span className="text-xs text-slate-500">{m.email}</span></div>
                    <span className="text-xs text-slate-400">{m.role?.toLowerCase()}{m.employmentType ? ` · ${m.employmentType.toLowerCase()}` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
