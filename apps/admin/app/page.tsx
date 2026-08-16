'use client';

/**
 * HBCField Platform Control Center — independent admin app (admin.hbcfield.com).
 * Real staff login (email + password → platform JWT, separate secret), RBAC by
 * role, and a Team screen for the Owner. Token kept in sessionStorage; every call
 * sends `Authorization: Bearer`. The server is authoritative on permissions.
 */
import { useCallback, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
const TIERS = ['starter', 'professional', 'business', 'enterprise'] as const;
type Tier = (typeof TIERS)[number];
type Cap = 'view' | 'extendTrial' | 'manageOrgs' | 'editPricing' | 'billingOps' | 'manageSupport' | 'managePlatformUsers';
const ROLES = ['OWNER', 'CONTROLLER', 'SUPPORT', 'BILLING'] as const;

const eur = (c?: number | null) => (c == null ? '—' : `€${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
const date = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : '—');

interface Me { user: { id: string; email: string; firstName: string; lastName: string; role: string }; permissions: Cap[] }
interface Seats { office: number; field: number; fieldInhouse: number; total: number }
interface Overview { totalOrgs: number; trialing: number; suspended: number; newLast30: number; byStatus: Record<string, number>; seats: Seats; mrrCents: number; arrCents: number }
interface OrgRow { id: string; name: string; planTier: string | null; subStatus: string; trialEndsAt: string | null; suspendedAt: string | null; createdAt: string; memberCount: number; seats: Seats; mrrCents: number }
interface OrgDetail extends OrgRow { enabledModules: string[]; billingEmail: string | null; vatId: string | null; currentPeriodEnd: string | null; members: Array<{ id: string; firstName: string; lastName: string; email: string; role: string; isActive: boolean; employmentType: string | null }> }
interface StaffUser { id: string; email: string; firstName: string; lastName: string; role: string; isActive: boolean; lastLoginAt: string | null }

let TOKEN = '';
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}), ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
  return body as T;
}

const STATUS_COLOR: Record<string, string> = { active: 'bg-green-500/15 text-green-400', trialing: 'bg-blue-500/15 text-blue-400', past_due: 'bg-amber-500/15 text-amber-400', canceled: 'bg-slate-500/15 text-slate-400', incomplete: 'bg-red-500/15 text-red-400' };

export default function ControlCenter() {
  const [me, setMe] = useState<Me | null>(null);
  const [booting, setBooting] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'orgs' | 'team' | 'pricing'>('orgs');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const can = (c: Cap) => !!me?.permissions.includes(c);

  const loadOrgs = useCallback(async () => {
    try {
      const [ov, list] = await Promise.all([
        api<{ data: Overview }>('/platform/overview'),
        api<{ data: OrgRow[] }>(`/platform/orgs?status=${status}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
      ]);
      setOverview(ov.data); setOrgs(list.data || []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Load failed'); }
  }, [status, search]);
  const loadStaff = useCallback(async () => { try { setStaff((await api<{ data: StaffUser[] }>('/platform/users')).data || []); } catch (e) { setError(e instanceof Error ? e.message : 'Load failed'); } }, []);

  // Boot: restore session.
  useEffect(() => {
    const t = sessionStorage.getItem('platformToken');
    if (!t) { setBooting(false); return; }
    TOKEN = t;
    api<{ data: Me }>('/platform/auth/me').then((r) => setMe(r.data)).catch(() => { TOKEN = ''; sessionStorage.removeItem('platformToken'); }).finally(() => setBooting(false));
  }, []);
  useEffect(() => { if (me && tab === 'orgs') loadOrgs(); if (me && tab === 'team') loadStaff(); }, [me, tab, loadOrgs, loadStaff]);

  const login = async () => {
    setError(null); setBusy('login');
    try {
      const r = await api<{ data: { token: string; user: Me['user']; permissions: Cap[] } }>('/platform/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      TOKEN = r.data.token; sessionStorage.setItem('platformToken', TOKEN);
      setMe({ user: r.data.user, permissions: r.data.permissions }); setPassword('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Login failed'); } finally { setBusy(null); }
  };
  const logout = () => { TOKEN = ''; sessionStorage.removeItem('platformToken'); setMe(null); };
  const act = async (id: string, path: string, init?: RequestInit) => {
    setBusy(id);
    try { await api(`/platform/orgs/${id}${path}`, { method: 'POST', ...init }); await loadOrgs(); if (detail?.id === id) setDetail((await api<{ data: OrgDetail }>(`/platform/orgs/${id}`)).data); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); } finally { setBusy(null); }
  };

  if (booting) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-500">…</div>;

  // ── Login ──
  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h1 className="mb-1 text-lg font-semibold">Platform Control Center</h1>
          <p className="mb-4 text-sm text-slate-400">HBC staff sign-in.</p>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" autoComplete="username"
            className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()} placeholder="password" autoComplete="current-password"
            className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          <button onClick={login} disabled={busy === 'login'} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50">{busy === 'login' ? '…' : 'Sign in'}</button>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>
      </div>
    );
  }

  const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div>{sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}</div>
  );

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Platform Control Center</h1>
            <div className="flex gap-1 rounded-lg border border-slate-800 p-0.5 text-sm">
              <button onClick={() => setTab('orgs')} className={`rounded px-3 py-1 ${tab === 'orgs' ? 'bg-slate-800' : 'text-slate-400'}`}>Organizations</button>
              <button onClick={() => setTab('pricing')} className={`rounded px-3 py-1 ${tab === 'pricing' ? 'bg-slate-800' : 'text-slate-400'}`}>Pricing</button>
              {can('managePlatformUsers') && <button onClick={() => setTab('team')} className={`rounded px-3 py-1 ${tab === 'team' ? 'bg-slate-800' : 'text-slate-400'}`}>Team</button>}
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-400">{me.user.firstName} {me.user.lastName} · <span className="text-blue-400">{me.user.role}</span></span>
            <button onClick={logout} className="text-xs text-slate-400 hover:text-slate-200">Sign out</button>
          </div>
        </div>
        {error && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error} <button onClick={() => setError(null)} className="ml-2 opacity-60">✕</button></div>}

        {tab === 'orgs' ? (
          <>
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
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadOrgs()} placeholder="Search org…" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm outline-none focus:border-blue-500" />
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm">{['all', 'active', 'trialing', 'past_due', 'canceled', 'incomplete'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
              <button onClick={loadOrgs} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700">Refresh</button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Organization</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Tier</th><th className="px-3 py-2 text-right">Members</th><th className="px-3 py-2 text-right">Seats</th><th className="px-3 py-2 text-right">MRR</th><th className="px-3 py-2">Trial ends</th><th className="px-3 py-2"></th></tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {orgs.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-900/50">
                      <td className="px-3 py-2"><button onClick={async () => setDetail((await api<{ data: OrgDetail }>(`/platform/orgs/${o.id}`)).data)} className="font-medium hover:text-blue-400">{o.name}</button>{o.suspendedAt && <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">SUSPENDED</span>}</td>
                      <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_COLOR[o.subStatus?.toLowerCase()] ?? 'bg-slate-700'}`}>{o.subStatus?.toLowerCase()}</span></td>
                      <td className="px-3 py-2">
                        {can('manageOrgs') ? (
                          <select value={(o.planTier ?? '').toLowerCase()} disabled={busy === o.id} onChange={(e) => act(o.id, '/tier', { body: JSON.stringify({ tier: e.target.value }) })} className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-xs"><option value="">—</option>{TIERS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                        ) : <span className="text-xs text-slate-400">{o.planTier?.toLowerCase() ?? '—'}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{o.memberCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400" title={`${o.seats.office} office · ${o.seats.field} field · ${o.seats.fieldInhouse} in-house`}>{o.seats.total}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{eur(o.mrrCents)}</td>
                      <td className="px-3 py-2 text-slate-400">{date(o.trialEndsAt)}</td>
                      <td className="px-3 py-2 text-right"><div className="flex justify-end gap-1">
                        {can('extendTrial') && <button disabled={busy === o.id} onClick={() => act(o.id, '/extend-trial', { body: JSON.stringify({ days: 14 }) })} className="rounded bg-slate-800 px-2 py-1 text-[11px] hover:bg-slate-700">+14d</button>}
                        {can('manageOrgs') && (o.suspendedAt
                          ? <button disabled={busy === o.id} onClick={() => act(o.id, '/reactivate')} className="rounded bg-green-600/80 px-2 py-1 text-[11px] hover:bg-green-600">Reactivate</button>
                          : <button disabled={busy === o.id} onClick={() => act(o.id, '/suspend')} className="rounded bg-red-600/80 px-2 py-1 text-[11px] hover:bg-red-600">Suspend</button>)}
                      </div></td>
                    </tr>
                  ))}
                  {orgs.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">No organizations.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        ) : tab === 'pricing' ? (
          <PricingPanel canEdit={can('editPricing')} onError={setError} />
        ) : (
          <TeamPanel staff={staff} reload={loadStaff} onError={setError} meId={me.user.id} />
        )}
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setDetail(null)}>
          <div className="h-full w-full max-w-lg overflow-y-auto border-l border-slate-800 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between"><div><h2 className="text-lg font-semibold">{detail.name}</h2><p className="text-xs text-slate-500">{detail.id}</p></div><button onClick={() => setDetail(null)} className="text-slate-400">✕</button></div>
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-slate-500">Status</div>{detail.subStatus?.toLowerCase()}{detail.suspendedAt && ' (suspended)'}</div>
              <div><div className="text-xs text-slate-500">Tier</div>{detail.planTier?.toLowerCase() ?? '—'}</div>
              <div><div className="text-xs text-slate-500">MRR</div>{eur(detail.mrrCents)}</div>
              <div><div className="text-xs text-slate-500">Seats</div>{detail.seats.office} office · {detail.seats.field} field · {detail.seats.fieldInhouse} in-house</div>
              <div><div className="text-xs text-slate-500">Trial ends</div>{date(detail.trialEndsAt)}</div>
              <div><div className="text-xs text-slate-500">Period ends</div>{date(detail.currentPeriodEnd)}</div>
            </div>
            <div className="mb-3"><div className="mb-1 text-xs text-slate-500">Modules ({detail.enabledModules?.length ?? 0})</div><div className="flex flex-wrap gap-1">{(detail.enabledModules ?? []).map((m) => <span key={m} className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px]">{m}</span>)}</div></div>
            <div><div className="mb-1 text-xs text-slate-500">Members ({detail.members.length})</div><div className="divide-y divide-slate-800 rounded-lg border border-slate-800">{detail.members.map((m) => <div key={m.id} className="flex items-center justify-between px-3 py-2 text-sm"><div><span className={m.isActive ? '' : 'text-slate-500 line-through'}>{m.firstName} {m.lastName}</span> <span className="text-xs text-slate-500">{m.email}</span></div><span className="text-xs text-slate-400">{m.role?.toLowerCase()}</span></div>)}</div></div>
          </div>
        </div>
      )}
    </div>
  );
}

function TeamPanel({ staff, reload, onError, meId }: { staff: StaffUser[]; reload: () => void; onError: (s: string) => void; meId: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: '', firstName: '', lastName: '', role: 'SUPPORT', password: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (fn: () => Promise<any>, id: string) => { setBusy(id); try { await fn(); reload(); } catch (e) { onError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(null); } };
  return (
    <div className="rounded-xl border border-slate-800">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3"><h2 className="text-sm font-semibold">Team</h2><button onClick={() => setOpen((v) => !v)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500">Add staff</button></div>
      {open && (
        <div className="grid grid-cols-2 gap-2 border-b border-slate-800 bg-slate-900/50 p-4 md:grid-cols-5">
          <input placeholder="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm" />
          <input placeholder="first name" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm" />
          <input placeholder="last name" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm" />
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm">{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
          <input placeholder="temp password (10+)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm" />
          <button disabled={busy === 'add'} onClick={() => run(async () => { await api('/platform/users', { method: 'POST', body: JSON.stringify(f) }); setOpen(false); setF({ email: '', firstName: '', lastName: '', role: 'SUPPORT', password: '' }); }, 'add')} className="col-span-2 rounded bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500 md:col-span-1">Create</button>
        </div>
      )}
      <div className="divide-y divide-slate-800">
        {staff.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1"><span className={u.isActive ? 'font-medium' : 'font-medium text-slate-500 line-through'}>{u.firstName} {u.lastName}</span> <span className="text-xs text-slate-500">{u.email}</span>{u.id === meId && <span className="ml-2 text-[10px] text-slate-500">(you)</span>}</div>
            <select value={u.role} disabled={busy === u.id} onChange={(e) => run(() => api(`/platform/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ role: e.target.value }) }), u.id)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs">{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
            <span className="text-xs text-slate-500">{u.lastLoginAt ? `seen ${date(u.lastLoginAt)}` : 'never'}</span>
            <button disabled={busy === u.id || u.id === meId} onClick={() => run(() => api(`/platform/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !u.isActive }) }), u.id)} className={`rounded px-2 py-1 text-[11px] ${u.isActive ? 'bg-red-600/80 hover:bg-red-600' : 'bg-green-600/80 hover:bg-green-600'} disabled:opacity-40`}>{u.isActive ? 'Deactivate' : 'Reactivate'}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

interface SeatPrice { id: string; seatType: string; tier: string | null; monthlyCents: number; annualCents: number }
interface ModulePrice { id: string; moduleKey: string; monthlyCents: number; annualCents: number; billingScope: string }
interface PriceConfig { id: string; version: number; active: boolean; note: string | null; createdAt: string; seatPrices: SeatPrice[]; modulePrices: ModulePrice[] }
const seatLabel = (s: SeatPrice) => s.seatType === 'office' ? `Office · ${s.tier}` : s.seatType === 'field_inhouse' ? 'Field · in-house' : 'Field · external';

function PricingPanel({ canEdit, onError }: { canEdit: boolean; onError: (s: string) => void }) {
  const [active, setActive] = useState<PriceConfig | null>(null);
  const [versions, setVersions] = useState<PriceConfig[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null); // the draft being edited
  const [busy, setBusy] = useState<string | null>(null);
  const [mod, setMod] = useState({ moduleKey: '', euro: '', billingScope: 'per_org' });
  const [sync, setSync] = useState<any | null>(null);
  const [confirmTxt, setConfirmTxt] = useState('');

  const load = useCallback(async () => {
    try { const r = await api<{ data: { active: PriceConfig | null; versions: PriceConfig[] } }>('/platform/pricing'); setActive(r.data.active); setVersions(r.data.versions || []); }
    catch (e) { onError(e instanceof Error ? e.message : 'Load failed'); }
  }, [onError]);
  useEffect(() => { load(); }, [load]);

  const draft = versions.find((v) => v.id === editingId && !v.active) || null;
  const shown = draft || active;

  const run = async (fn: () => Promise<any>, id: string) => { setBusy(id); try { await fn(); await load(); } catch (e) { onError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(null); } };
  const createDraft = () => run(async () => { const r = await api<{ data: PriceConfig }>('/platform/pricing/draft', { method: 'POST', body: JSON.stringify({}) }); setEditingId(r.data.id); }, 'draft');
  const setSeat = (seatId: string, euro: string) => run(() => api(`/platform/pricing/${draft!.id}/seat/${seatId}`, { method: 'PATCH', body: JSON.stringify({ monthlyCents: Math.round(parseFloat(euro || '0') * 100) }) }), seatId);
  const addModule = () => { if (!mod.moduleKey.trim()) return; run(async () => { await api(`/platform/pricing/${draft!.id}/module`, { method: 'POST', body: JSON.stringify({ moduleKey: mod.moduleKey.trim(), monthlyCents: Math.round(parseFloat(mod.euro || '0') * 100), billingScope: mod.billingScope }) }); setMod({ moduleKey: '', euro: '', billingScope: 'per_org' }); }, 'addmod'); };
  const delModule = (id: string) => run(() => api(`/platform/pricing/${draft!.id}/module/${id}`, { method: 'DELETE' }), id);
  const publish = () => run(async () => { await api(`/platform/pricing/${draft!.id}/publish`, { method: 'POST', body: '{}' }); setEditingId(null); }, 'publish');

  if (!shown) return <div className="rounded-xl border border-slate-800 p-8 text-center text-slate-500">Loading pricing…</div>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-400">Active: <span className="text-slate-200">v{active?.version}</span></span>
        {draft ? (
          <>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">editing draft v{draft.version}</span>
            <button disabled={busy === 'publish'} onClick={publish} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm hover:bg-green-500">Publish v{draft.version}</button>
            <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:text-slate-200">Discard view</button>
          </>
        ) : canEdit ? (
          <button disabled={busy === 'draft'} onClick={createDraft} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500">Edit prices (new draft)</button>
        ) : <span className="text-xs text-slate-500">Read-only (needs editPricing)</span>}
        <span className="ml-auto text-xs text-slate-500">Publishing changes DISPLAY only — Stripe sync is a separate step (C3).</span>
      </div>

      <div className="rounded-xl border border-slate-800">
        <div className="border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Seats (monthly, € · annual = ×10)</div>
        <div className="divide-y divide-slate-800">
          {shown.seatPrices.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-44">{seatLabel(s)}</span>
              {draft ? (
                <input type="number" min="0" step="1" defaultValue={(s.monthlyCents / 100).toString()} disabled={busy === s.id}
                  onBlur={(e) => e.target.value !== (s.monthlyCents / 100).toString() && setSeat(s.id, e.target.value)}
                  className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm" />
              ) : <span className="w-24 tabular-nums">€{(s.monthlyCents / 100).toFixed(0)}</span>}
              <span className="text-xs text-slate-500">/mo · €{(s.annualCents / 100).toFixed(0)}/yr</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800">
        <div className="border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Module add-ons {draft ? '' : `(${shown.modulePrices.length})`}</div>
        <div className="divide-y divide-slate-800">
          {shown.modulePrices.length === 0 && <div className="px-4 py-3 text-sm text-slate-500">No paid modules — modules are free within their tier. {draft && 'Add one below to charge for it.'}</div>}
          {shown.modulePrices.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-44 font-mono text-xs">{m.moduleKey}</span>
              <span className="w-24 tabular-nums">€{(m.monthlyCents / 100).toFixed(0)}/mo</span>
              <span className="text-xs text-slate-500">{m.billingScope}</span>
              {draft && <button disabled={busy === m.id} onClick={() => delModule(m.id)} className="ml-auto rounded bg-red-600/80 px-2 py-1 text-[11px] hover:bg-red-600">Remove</button>}
            </div>
          ))}
        </div>
        {draft && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 bg-slate-900/50 p-3">
            <input placeholder="module key (e.g. tracking)" value={mod.moduleKey} onChange={(e) => setMod({ ...mod, moduleKey: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm" />
            <input placeholder="€/mo" type="number" min="0" value={mod.euro} onChange={(e) => setMod({ ...mod, euro: e.target.value })} className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm" />
            <select value={mod.billingScope} onChange={(e) => setMod({ ...mod, billingScope: e.target.value })} className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm">
              {['per_org', 'per_office_seat', 'per_space'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button disabled={busy === 'addmod'} onClick={addModule} className="rounded bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500">Add module price</button>
          </div>
        )}
      </div>

      {versions.length > 1 && (
        <div className="text-xs text-slate-500">Versions: {versions.map((v) => <span key={v.id} className={`mr-2 ${v.active ? 'text-green-400' : ''}`}>v{v.version}{v.active ? ' (active)' : ''}</span>)}</div>
      )}

      {/* C3 — Stripe sync (live billing) */}
      {canEdit && (
        <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-amber-300">⚠ Sync to Stripe (live billing)</span>
            <button onClick={() => run(async () => setSync((await api<{ data: any }>('/platform/pricing/sync/preview')).data), 'syncprev')} disabled={busy === 'syncprev'} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700">Preview sync</button>
            <span className="text-xs text-slate-500">Reads Stripe, changes nothing. Existing subscriptions are always grandfathered.</span>
          </div>
          {sync && (
            <div className="mt-3 space-y-2 text-sm">
              <div className="text-slate-300">{sync.changeCount} price change(s) · existing subs affected: <span className="text-green-400">0 (grandfathered)</span> · apply: <span className={sync.enabled ? 'text-green-400' : 'text-red-400'}>{sync.enabled ? 'ENABLED' : 'DISABLED'}</span></div>
              {(sync.changes ?? []).map((c: any, i: number) => (
                <div key={i} className="flex gap-3 rounded border border-slate-800 px-3 py-1.5 text-xs">
                  <span className="w-40">{c.seatType}{c.tier ? `/${c.tier}` : ''} · {c.interval}</span>
                  <span className="tabular-nums text-slate-400">€{((c.currentCents ?? 0) / 100).toFixed(0)} → </span>
                  <span className="tabular-nums text-amber-300">€{(c.nextCents / 100).toFixed(0)}</span>
                  {c.newPriceId && <span className="ml-auto font-mono text-green-400">{c.newPriceId}</span>}
                </div>
              ))}
              <p className="text-xs text-slate-500">{sync.note}</p>
              {sync.enabled && sync.changeCount > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <input placeholder='type APPLY to confirm' value={confirmTxt} onChange={(e) => setConfirmTxt(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm" />
                  <button disabled={busy === 'syncapply' || confirmTxt !== 'APPLY'} onClick={() => run(async () => { setSync((await api<{ data: any }>('/platform/pricing/sync/apply', { method: 'POST', body: JSON.stringify({ confirm: 'APPLY' }) })).data); setConfirmTxt(''); }, 'syncapply')} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm hover:bg-red-500 disabled:opacity-40">Apply to Stripe</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
