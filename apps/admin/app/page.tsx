'use client';

/**
 * HBCField Platform Control Center — independent admin app (admin.hbcfield.com).
 * Real staff login (email + password → platform JWT, separate secret), RBAC by
 * role, and a Team screen for the Owner. Token kept in sessionStorage; every call
 * sends `Authorization: Bearer`. The server is authoritative on permissions.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
const TIERS = ['starter', 'professional', 'business', 'enterprise'] as const;
type Tier = (typeof TIERS)[number];
type Cap = 'view' | 'extendTrial' | 'manageOrgs' | 'editPricing' | 'billingOps' | 'manageSupport' | 'manageSupportTeams' | 'managePlatformUsers';
const ROLES = ['OWNER', 'CONTROLLER', 'SUPPORT', 'BILLING'] as const;

const eur = (c?: number | null) => (c == null ? '—' : `€${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
const date = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : '—');

interface Me { user: { id: string; email: string; firstName: string; lastName: string; role: string; twoFactorEnabled?: boolean; isSupportSupervisor?: boolean; supportTeamIds?: string[] }; permissions: Cap[] }
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
  const [code, setCode] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [security, setSecurity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'orgs' | 'team' | 'pricing' | 'support' | 'teams'>('orgs');
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
      const r = await api<{ data: any }>('/platform/auth/login', { method: 'POST', body: JSON.stringify({ email, password, code: code || undefined }) });
      if (r.data?.needs2fa) { setNeeds2fa(true); return; }
      TOKEN = r.data.token; sessionStorage.setItem('platformToken', TOKEN);
      setMe({ user: r.data.user, permissions: r.data.permissions }); setPassword(''); setCode(''); setNeeds2fa(false);
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
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" autoComplete="username" disabled={needs2fa}
            className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:opacity-60" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()} placeholder="password" autoComplete="current-password" disabled={needs2fa}
            className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:opacity-60" />
          {needs2fa && (
            <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()} placeholder="6-digit authenticator code" inputMode="numeric" autoFocus
              className="mb-3 w-full rounded-lg border border-blue-700 bg-slate-950 px-3 py-2 text-center text-lg tracking-widest outline-none focus:border-blue-500" />
          )}
          <button onClick={login} disabled={busy === 'login'} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50">{busy === 'login' ? '…' : needs2fa ? 'Verify' : 'Sign in'}</button>
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
              {can('manageSupport') && <button onClick={() => setTab('support')} className={`rounded px-3 py-1 ${tab === 'support' ? 'bg-slate-800' : 'text-slate-400'}`}>Support</button>}
              {can('manageSupportTeams') && <button onClick={() => setTab('teams')} className={`rounded px-3 py-1 ${tab === 'teams' ? 'bg-slate-800' : 'text-slate-400'}`}>Support Teams</button>}
              {can('managePlatformUsers') && <button onClick={() => setTab('team')} className={`rounded px-3 py-1 ${tab === 'team' ? 'bg-slate-800' : 'text-slate-400'}`}>Team</button>}
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-400">{me.user.firstName} {me.user.lastName} · <span className="text-blue-400">{me.user.role}</span>{me.user.twoFactorEnabled && <span className="ml-1 text-green-400" title="2FA on">🔒</span>}</span>
            <button onClick={() => setSecurity(true)} className="text-xs text-slate-400 hover:text-slate-200">Security</button>
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
        ) : tab === 'support' ? (
          <SupportPanel onError={setError} isSupervisor={!!me.user.isSupportSupervisor} hasTeams={(me.user.supportTeamIds?.length ?? 0) > 0} />
        ) : tab === 'teams' ? (
          <TeamsPanel onError={setError} />
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

      {security && <SecurityModal me={me} onClose={() => setSecurity(false)} onError={setError} onMe={setMe} />}
    </div>
  );
}

function SecurityModal({ me, onClose, onError, onMe }: { me: Me; onClose: () => void; onError: (s: string) => void; onMe: (m: Me) => void }) {
  const [cur, setCur] = useState(''); const [nw, setNw] = useState('');
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string; qr: string } | null>(null);
  const [code, setCode] = useState(''); const [busy, setBusy] = useState<string | null>(null);
  const enabled = !!me.user.twoFactorEnabled;
  const run = async (fn: () => Promise<any>, id: string) => { setBusy(id); try { await fn(); } catch (e) { onError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(null); } };

  const changePw = () => run(async () => { await api('/platform/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: cur, newPassword: nw }) }); setCur(''); setNw(''); onError('Password changed ✓'); }, 'pw');
  const startSetup = () => run(async () => {
    const r = await api<{ data: { secret: string; otpauthUri: string } }>('/platform/auth/2fa/setup', { method: 'POST', body: '{}' });
    const QR = (await import('qrcode')).default; const qr = await QR.toDataURL(r.data.otpauthUri, { margin: 1, width: 200 });
    setSetup({ ...r.data, qr });
  }, 'setup');
  const enable = () => run(async () => { await api('/platform/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) }); onMe({ ...me, user: { ...me.user, twoFactorEnabled: true } }); setSetup(null); setCode(''); }, '2fa');
  const disable = () => run(async () => { await api('/platform/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ code }) }); onMe({ ...me, user: { ...me.user, twoFactorEnabled: false } }); setCode(''); }, '2fa');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Security · {me.user.email}</h2><button onClick={onClose} className="text-slate-400">✕</button></div>

        <div>
          <div className="mb-2 text-sm font-semibold text-slate-300">Change password</div>
          <input type="password" placeholder="current password" value={cur} onChange={(e) => setCur(e.target.value)} className="mb-2 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <input type="password" placeholder="new password (10+ chars)" value={nw} onChange={(e) => setNw(e.target.value)} className="mb-2 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <button disabled={busy === 'pw' || !cur || nw.length < 10} onClick={changePw} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500 disabled:opacity-40">Update password</button>
        </div>

        <div className="border-t border-slate-800 pt-4">
          <div className="mb-2 text-sm font-semibold text-slate-300">Two-factor authentication {enabled ? <span className="text-green-400">· ON</span> : <span className="text-slate-500">· off</span>}</div>
          {enabled ? (
            <div className="flex items-center gap-2">
              <input placeholder="current code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} className="w-32 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-center text-sm tracking-widest" />
              <button disabled={busy === '2fa'} onClick={disable} className="rounded-lg bg-red-600/80 px-3 py-1.5 text-sm hover:bg-red-600">Disable 2FA</button>
            </div>
          ) : setup ? (
            <div className="space-y-2 text-sm">
              <p className="text-slate-400">Scan with your authenticator, then enter the code.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="2FA QR" className="rounded bg-white p-1" width={180} height={180} />
              <p className="break-all font-mono text-[11px] text-slate-500">secret: {setup.secret}</p>
              <div className="flex items-center gap-2">
                <input placeholder="6-digit code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} className="w-32 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-center text-sm tracking-widest" />
                <button disabled={busy === '2fa' || code.length !== 6} onClick={enable} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm hover:bg-green-500 disabled:opacity-40">Enable</button>
              </div>
            </div>
          ) : (
            <button disabled={busy === 'setup'} onClick={startSetup} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500">Set up 2FA</button>
          )}
        </div>
      </div>
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

interface Ticket { id: string; subject: string; status: string; priority?: string; createdBy?: { firstName?: string; lastName?: string; email?: string } | null; lastCustomerMessageAt?: string | null; organizationId?: string; assignedTeamId?: string | null; assignedAgentId?: string | null }
interface Msg { id: string; authorType: string; authorId?: string; body: string; isInternalNote?: boolean; createdAt: string }
const ts = (s?: string | null) => (s ? new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const TSTATUS: Record<string, string> = { OPEN: 'bg-red-500/15 text-red-400', PENDING: 'bg-amber-500/15 text-amber-400', RESOLVED: 'bg-green-500/15 text-green-400', CLOSED: 'bg-slate-500/15 text-slate-400' };

function SupportPanel({ onError, isSupervisor, hasTeams }: { onError: (s: string) => void; isSupervisor: boolean; hasTeams: boolean }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [teamNames, setTeamNames] = useState<Record<string, { name: string; color?: string | null }>>({});
  const [sel, setSel] = useState<string | null>(null);
  const [thread, setThread] = useState<{ ticket: Ticket; messages: Msg[] } | null>(null);
  const [reply, setReply] = useState('');
  const [note, setNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  // Scope view: supervisors default to "all"; scoped agents to their queue.
  const [view, setView] = useState<'all' | 'mine' | 'unassigned' | 'team'>(isSupervisor ? 'all' : 'team');
  const scrollRef = useRef<HTMLDivElement>(null);
  const selRef = useRef(sel); useEffect(() => { selRef.current = sel; }, [sel]);
  const viewRef = useRef(view); useEffect(() => { viewRef.current = view; }, [view]);

  const loadInbox = useCallback(async () => { try { setTickets((await api<{ data: Ticket[] }>(`/platform/support/inbox?view=${viewRef.current}`)).data || []); } catch (e) { onError(e instanceof Error ? e.message : 'Load failed'); } }, [onError]);
  // Team names for the chips (best-effort; empty if the caller can't list teams).
  useEffect(() => { (async () => { try { const r = await api<{ data: Array<{ id: string; name: string; color?: string | null }> }>('/platform/support/teams'); setTeamNames(Object.fromEntries(r.data.map((t) => [t.id, { name: t.name, color: t.color }]))); } catch { /* not a team admin — chips fall back to id-less label */ } })(); }, []);
  const loadThread = useCallback(async (id: string) => { try { const r = await api<{ data: { ticket: Ticket; messages: Msg[] } }>(`/platform/support/tickets/${id}`); setThread(r.data); } catch (e) { onError(e instanceof Error ? e.message : 'Load failed'); } }, [onError]);

  // Real-time via Socket.IO (authenticate as an agent with the platform token) +
  // a slow 30s poll as a safety net if the socket drops.
  useEffect(() => {
    loadInbox();
    let socket: any; let cancelled = false;
    (async () => {
      const { io } = await import('socket.io-client');
      if (cancelled) return;
      const SOCKET_URL = API.replace(/\/api\/v1$/, '');
      socket = io(SOCKET_URL, { auth: { token: TOKEN }, transports: ['websocket', 'polling'], reconnection: true });
      const refresh = () => { loadInbox(); if (selRef.current) loadThread(selRef.current); };
      socket.on('connect', () => { socket.emit('authenticate_agent'); setLive(true); });
      socket.on('disconnect', () => setLive(false));
      socket.on('support.message', refresh);
      socket.on('support.ticketUpdated', refresh);
    })();
    const t = setInterval(() => { loadInbox(); if (selRef.current) loadThread(selRef.current); }, 30000);
    return () => { cancelled = true; socket?.disconnect(); clearInterval(t); };
  }, [loadInbox, loadThread]);
  useEffect(() => { if (sel) loadThread(sel); }, [sel, loadThread]);
  useEffect(() => { loadInbox(); }, [view, loadInbox]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [thread?.messages.length]);

  // Reassign the open ticket to a team (or clear → triage). Agent self-claim is
  // the default POST with no body.
  const assignTeam = async (teamId: string | null) => {
    if (!sel) return; setBusy(true);
    try { await api(`/platform/support/tickets/${sel}/assign`, { method: 'POST', body: JSON.stringify({ teamId }) }); await loadThread(sel); await loadInbox(); }
    catch (e) { onError(e instanceof Error ? e.message : 'Assign failed'); } finally { setBusy(false); }
  };
  const claim = async () => {
    if (!sel) return; setBusy(true);
    try { await api(`/platform/support/tickets/${sel}/assign`, { method: 'POST', body: JSON.stringify({}) }); await loadThread(sel); await loadInbox(); }
    catch (e) { onError(e instanceof Error ? e.message : 'Claim failed'); } finally { setBusy(false); }
  };
  const teamChip = (id?: string | null) => {
    if (!id) return <span className="rounded-full bg-slate-700/50 px-1.5 py-0.5 text-[10px] text-slate-400">triage</span>;
    const t = teamNames[id];
    return <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: (t?.color ?? '#334155') + '33', color: t?.color ?? '#94a3b8' }}>{t?.name ?? 'team'}</span>;
  };

  const send = async () => {
    if (!sel || !reply.trim()) return; setBusy(true);
    try { await api(`/platform/support/tickets/${sel}/messages`, { method: 'POST', body: JSON.stringify({ body: reply.trim(), isInternalNote: note }) }); setReply(''); await loadThread(sel); await loadInbox(); }
    catch (e) { onError(e instanceof Error ? e.message : 'Send failed'); } finally { setBusy(false); }
  };
  const setStatus = async (status: string) => { if (!sel) return; setBusy(true); try { await api(`/platform/support/tickets/${sel}/status`, { method: 'POST', body: JSON.stringify({ status }) }); await loadThread(sel); await loadInbox(); } catch (e) { onError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); } };

  return (
    <div className="flex h-[70vh] gap-4">
      <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Inbox ({tickets.length})<span className={`ml-auto flex items-center gap-1 normal-case ${live ? 'text-green-400' : 'text-slate-600'}`}><span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-green-400' : 'bg-slate-600'}`} />{live ? 'live' : 'offline'}</span></div>
        <div className="flex gap-1 border-b border-slate-800 px-2 py-1.5 text-[11px]">
          {(isSupervisor ? (['all', 'unassigned', 'mine'] as const) : ([...(hasTeams ? (['team'] as const) : []), 'unassigned', 'mine'] as const)).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded px-2 py-0.5 ${view === v ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}>{v === 'team' ? 'My teams' : v === 'mine' ? 'Assigned to me' : v === 'unassigned' ? 'Triage' : 'All'}</button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tickets.length === 0 ? <p className="p-4 text-sm text-slate-500">No tickets in this view.</p> : tickets.map((t) => (
            <button key={t.id} onClick={() => setSel(t.id)} className={`flex w-full flex-col gap-0.5 border-b border-slate-800/60 px-4 py-2.5 text-left hover:bg-slate-800/40 ${sel === t.id ? 'bg-slate-800/60' : ''}`}>
              <div className="flex items-center gap-2"><span className={`rounded-full px-1.5 py-0.5 text-[10px] ${TSTATUS[t.status] ?? 'bg-slate-700'}`}>{t.status?.toLowerCase()}</span>{teamChip(t.assignedTeamId)}{t.assignedAgentId && <span className="truncate text-[10px] text-blue-400">@{t.assignedAgentId}</span>}</div>
              <span className="truncate text-sm font-medium">{t.subject}</span>
              <span className="truncate text-xs text-slate-500">{t.createdBy?.firstName} {t.createdBy?.lastName} · {ts(t.lastCustomerMessageAt)}</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-800">
        {!thread ? <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Select a ticket</div> : (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
              <div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate font-semibold">{thread.ticket.subject}</span>{teamChip(thread.ticket.assignedTeamId)}</div><div className="text-xs text-slate-500">{thread.ticket.createdBy?.email} · {thread.ticket.status?.toLowerCase()}{thread.ticket.assignedAgentId && <span className="text-blue-400"> · @{thread.ticket.assignedAgentId}</span>}</div></div>
              <div className="flex shrink-0 items-center gap-1">
                <select disabled={busy} value={thread.ticket.assignedTeamId ?? ''} onChange={(e) => assignTeam(e.target.value || null)} className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[11px]" title="Route to team"><option value="">Triage</option>{Object.entries(teamNames).map(([id, t]) => <option key={id} value={id}>{t.name}</option>)}</select>
                <button disabled={busy} onClick={claim} className="rounded bg-blue-600/80 px-2 py-1 text-[11px] hover:bg-blue-600" title="Assign to me">Claim</button>
                <button disabled={busy} onClick={() => setStatus('RESOLVED')} className="rounded bg-green-600/80 px-2 py-1 text-[11px] hover:bg-green-600">Resolve</button>
                <button disabled={busy} onClick={() => setStatus('CLOSED')} className="rounded bg-slate-600/80 px-2 py-1 text-[11px] hover:bg-slate-600">Close</button>
              </div>
            </div>
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-950/40 p-4">
              {thread.messages.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.authorType === 'AGENT' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.isInternalNote ? 'border border-amber-700 bg-amber-950/40 text-amber-200' : m.authorType === 'AGENT' ? 'bg-blue-600 text-white' : 'bg-slate-800'}`}>
                    {m.isInternalNote && <div className="mb-0.5 text-[10px] font-semibold">internal note</div>}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  </div>
                  <span className="mt-0.5 text-[10px] text-slate-500">{m.authorType === 'AGENT' ? (m.authorId || 'agent') : 'customer'} · {ts(m.createdAt)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-800 p-3">
              <div className="mb-1.5 flex items-center gap-2 text-xs text-slate-400"><label className="flex items-center gap-1"><input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} /> internal note (not shown to customer)</label></div>
              <div className="flex gap-2">
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={1} placeholder="Reply…" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
                <button disabled={busy || !reply.trim()} onClick={send} className="rounded-lg bg-blue-600 px-4 text-sm hover:bg-blue-500 disabled:opacity-40">Send</button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// ── Support Teams admin ───────────────────────────────────────────────────────
interface TMember { id: string; platformUserId: string; teamRole: 'MANAGER' | 'AGENT'; user?: { firstName?: string; lastName?: string; email?: string; role?: string } | null }
interface TRule { id: string; name: string; isActive: boolean; order: number; conditions: { planTier?: string[]; country?: string[]; state?: string[]; industry?: string[] } }
interface Team { id: string; name: string; color?: string | null; description?: string | null; isActive: boolean; members: TMember[]; routingRules: TRule[]; _count?: { members: number; routingRules: number; pinnedOrgs: number } }
interface TStaff { id: string; firstName: string; lastName: string; email: string; role: string }
interface PinnedOrg { id: string; name: string; planTier?: string | null; country?: string | null; industry?: string | null }

const csv = (a?: string[]) => (a && a.length ? a.join(', ') : '');
const parseCsv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

function TeamsPanel({ onError }: { onError: (s: string) => void }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [staff, setStaff] = useState<TStaff[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [pinned, setPinned] = useState<PinnedOrg[]>([]);
  const [newTeam, setNewTeam] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([
        api<{ data: Team[] }>('/platform/support/teams'),
        api<{ data: TStaff[] }>('/platform/support/teams/staff'),
      ]);
      setTeams(t.data); setStaff(s.data);
      setSelId((cur) => cur ?? t.data[0]?.id ?? null);
    } catch (e) { onError(e instanceof Error ? e.message : 'Load failed'); }
  }, [onError]);
  useEffect(() => { load(); }, [load]);

  const sel = teams.find((t) => t.id === selId) || null;
  const loadPinned = useCallback(async (id: string) => { try { setPinned((await api<{ data: PinnedOrg[] }>(`/platform/support/teams/${id}/pinned-orgs`)).data); } catch { setPinned([]); } }, []);
  useEffect(() => { if (selId) loadPinned(selId); }, [selId, loadPinned]);

  const wrap = async (fn: () => Promise<any>) => { setBusy(true); try { await fn(); await load(); } catch (e) { onError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); } };

  const createTeam = () => { if (!newTeam.trim()) return; wrap(async () => { await api('/platform/support/teams', { method: 'POST', body: JSON.stringify({ name: newTeam.trim() }) }); setNewTeam(''); }); };
  const updateTeam = (patch: Partial<Team>) => sel && wrap(() => api(`/platform/support/teams/${sel.id}`, { method: 'PUT', body: JSON.stringify(patch) }));
  const deleteTeam = () => sel && confirm(`Delete team "${sel.name}"? Tickets return to triage; pinned orgs are unpinned.`) && wrap(async () => { await api(`/platform/support/teams/${sel.id}`, { method: 'DELETE' }); setSelId(null); });
  const addMember = (platformUserId: string, teamRole: 'MANAGER' | 'AGENT') => sel && wrap(() => api(`/platform/support/teams/${sel.id}/members`, { method: 'POST', body: JSON.stringify({ platformUserId, teamRole }) }));
  const removeMember = (platformUserId: string) => sel && wrap(() => api(`/platform/support/teams/${sel.id}/members/${platformUserId}`, { method: 'DELETE' }));
  const saveRule = (r: Partial<TRule> & { conditions: TRule['conditions'] }) => sel && wrap(() => api(`/platform/support/teams/${sel.id}/rules`, { method: 'POST', body: JSON.stringify(r) }));
  const deleteRule = (ruleId: string) => wrap(() => api(`/platform/support/teams/rules/${ruleId}`, { method: 'DELETE' }));
  const unpin = (organizationId: string) => wrap(() => api('/platform/support/teams/pin-org', { method: 'POST', body: JSON.stringify({ organizationId, teamId: null }) }));

  const memberIds = new Set(sel?.members.map((m) => m.platformUserId));
  const addable = staff.filter((s) => !memberIds.has(s.id));

  return (
    <div className="flex h-[72vh] gap-4">
      {/* Teams list */}
      <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-800">
        <div className="border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Support Teams ({teams.length})</div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {teams.map((t) => (
            <button key={t.id} onClick={() => setSelId(t.id)} className={`flex w-full items-center gap-2 border-b border-slate-800/60 px-4 py-2.5 text-left hover:bg-slate-800/40 ${selId === t.id ? 'bg-slate-800/60' : ''}`}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color ?? '#475569' }} />
              <span className="min-w-0 flex-1"><span className={`block truncate text-sm font-medium ${t.isActive ? '' : 'text-slate-500 line-through'}`}>{t.name}</span><span className="text-[11px] text-slate-500">{t._count?.members ?? t.members.length} members · {t._count?.routingRules ?? t.routingRules.length} rules · {t._count?.pinnedOrgs ?? 0} pinned</span></span>
            </button>
          ))}
          {teams.length === 0 && <p className="p-4 text-sm text-slate-500">No teams yet.</p>}
        </div>
        <div className="flex gap-1 border-t border-slate-800 p-2">
          <input value={newTeam} onChange={(e) => setNewTeam(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createTeam()} placeholder="New team name…" className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:border-blue-500" />
          <button disabled={busy || !newTeam.trim()} onClick={createTeam} className="rounded bg-blue-600 px-3 text-sm hover:bg-blue-500 disabled:opacity-40">Add</button>
        </div>
      </aside>

      {/* Team detail */}
      <section className="min-w-0 flex-1 overflow-y-auto rounded-xl border border-slate-800 p-5">
        {!sel ? <div className="flex h-full items-center justify-center text-sm text-slate-500">Select or create a team</div> : (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <input type="color" value={sel.color ?? '#475569'} onChange={(e) => updateTeam({ color: e.target.value })} className="h-8 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent" title="Team color" />
              <input defaultValue={sel.name} key={sel.id + sel.name} onBlur={(e) => e.target.value.trim() && e.target.value !== sel.name && updateTeam({ name: e.target.value.trim() })} className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-lg font-semibold hover:border-slate-700 focus:border-blue-500 focus:outline-none" />
              <label className="flex items-center gap-1 text-xs text-slate-400"><input type="checkbox" checked={sel.isActive} onChange={(e) => updateTeam({ isActive: e.target.checked })} /> active</label>
              <button onClick={deleteTeam} className="rounded bg-red-600/80 px-2 py-1 text-[11px] hover:bg-red-600">Delete</button>
            </div>

            {/* Members */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Members ({sel.members.length})</h3>
              <div className="space-y-1.5">
                {sel.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{m.user?.firstName} {m.user?.lastName} <span className="text-slate-500">· {m.user?.email}</span></span>
                    <select value={m.teamRole} onChange={(e) => addMember(m.platformUserId, e.target.value as any)} className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px]"><option value="AGENT">Agent</option><option value="MANAGER">Manager</option></select>
                    <button onClick={() => removeMember(m.platformUserId)} className="text-[11px] text-red-400 hover:text-red-300">remove</button>
                  </div>
                ))}
                {sel.members.length === 0 && <p className="text-sm text-slate-500">No members — this team's queue is invisible until someone is added.</p>}
              </div>
              {addable.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <select id="addmember" className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"><option value="">Add member…</option>{addable.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.role})</option>)}</select>
                  <button onClick={() => { const el = document.getElementById('addmember') as HTMLSelectElement; if (el?.value) { addMember(el.value, 'AGENT'); el.value = ''; } }} className="rounded bg-slate-800 px-3 py-1 text-sm hover:bg-slate-700">Add</button>
                </div>
              )}
            </div>

            {/* Routing rules */}
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Routing rules ({sel.routingRules.length})</h3>
              <p className="mb-2 text-xs text-slate-500">New tickets from orgs matching a rule auto-route here (first match by order wins; a manual org pin always wins over rules).</p>
              <RuleEditor rules={sel.routingRules} onSave={saveRule} onDelete={deleteRule} busy={busy} />
            </div>

            {/* Pinned orgs */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pinned organizations ({pinned.length})</h3>
              <p className="mb-2 text-xs text-slate-500">Manually assigned orgs (overrides routing rules). Pin an org from its row in the Organizations tab, or paste an org id below.</p>
              <PinBox onPin={(orgId) => sel && wrap(() => api('/platform/support/teams/pin-org', { method: 'POST', body: JSON.stringify({ organizationId: orgId, teamId: sel.id }) }))} busy={busy} />
              <div className="mt-2 space-y-1">
                {pinned.map((o) => (
                  <div key={o.id} className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{o.name} <span className="text-slate-500">· {o.planTier ?? '—'} · {o.country ?? '—'} · {o.industry ?? '—'}</span></span>
                    <button onClick={() => unpin(o.id)} className="text-[11px] text-red-400 hover:text-red-300">unpin</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function RuleEditor({ rules, onSave, onDelete, busy }: { rules: TRule[]; onSave: (r: Partial<TRule> & { conditions: TRule['conditions'] }) => void; onDelete: (id: string) => void; busy: boolean }) {
  const [draft, setDraft] = useState<{ name: string; order: string; planTier: string; country: string; state: string; industry: string }>({ name: '', order: '0', planTier: '', country: '', state: '', industry: '' });
  const save = () => {
    if (!draft.name.trim()) return;
    onSave({ name: draft.name.trim(), order: Number(draft.order) || 0, isActive: true, conditions: { planTier: parseCsv(draft.planTier), country: parseCsv(draft.country), state: parseCsv(draft.state), industry: parseCsv(draft.industry) } });
    setDraft({ name: '', order: '0', planTier: '', country: '', state: '', industry: '' });
  };
  return (
    <div className="space-y-1.5">
      {rules.map((r) => (
        <div key={r.id} className="flex items-start gap-2 rounded-lg border border-slate-800 px-3 py-2 text-sm">
          <span className="mt-0.5 w-6 shrink-0 text-center text-xs text-slate-500">#{r.order}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><span className="font-medium">{r.name}</span>{!r.isActive && <span className="text-[10px] text-slate-500">(inactive)</span>}<button onClick={() => onSave({ id: r.id, name: r.name, order: r.order, isActive: !r.isActive, conditions: r.conditions })} className="text-[10px] text-slate-400 hover:text-slate-200">{r.isActive ? 'disable' : 'enable'}</button></div>
            <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-slate-400">
              {r.conditions.planTier?.length ? <Cond k="tier" v={csv(r.conditions.planTier)} /> : null}
              {r.conditions.country?.length ? <Cond k="country" v={csv(r.conditions.country)} /> : null}
              {r.conditions.state?.length ? <Cond k="region" v={csv(r.conditions.state)} /> : null}
              {r.conditions.industry?.length ? <Cond k="industry" v={csv(r.conditions.industry)} /> : null}
              {!r.conditions.planTier?.length && !r.conditions.country?.length && !r.conditions.state?.length && !r.conditions.industry?.length ? <span className="text-slate-500">any org (catch-all)</span> : null}
            </div>
          </div>
          <button onClick={() => onDelete(r.id)} className="text-[11px] text-red-400 hover:text-red-300">delete</button>
        </div>
      ))}
      <div className="rounded-lg border border-dashed border-slate-700 p-2">
        <div className="mb-1.5 flex gap-2">
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Rule name (e.g. DACH · Pro+)" className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" />
          <input value={draft.order} onChange={(e) => setDraft({ ...draft, order: e.target.value })} type="number" title="order" className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
          <input value={draft.planTier} onChange={(e) => setDraft({ ...draft, planTier: e.target.value })} placeholder="planTier: professional, business" className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs" />
          <input value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} placeholder="country: AT, DE, CH" className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs" />
          <input value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} placeholder="region/state" className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs" />
          <input value={draft.industry} onChange={(e) => setDraft({ ...draft, industry: e.target.value })} placeholder="industry: HVAC" className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs" />
        </div>
        <div className="mt-1.5 flex justify-end"><button disabled={busy || !draft.name.trim()} onClick={save} className="rounded bg-blue-600 px-3 py-1 text-sm hover:bg-blue-500 disabled:opacity-40">Add rule</button></div>
        <p className="mt-1 text-[10px] text-slate-500">Comma-separated = OR within a field; fields AND together; leave a field blank for &quot;any&quot;.</p>
      </div>
    </div>
  );
}

const Cond = ({ k, v }: { k: string; v: string }) => <span className="rounded bg-slate-800 px-1.5 py-0.5"><span className="text-slate-500">{k}:</span> {v}</span>;

function PinBox({ onPin, busy }: { onPin: (orgId: string) => void; busy: boolean }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<OrgRow[]>([]);
  const search = async () => { try { setHits((await api<{ data: OrgRow[] }>(`/platform/orgs?status=all${q ? `&search=${encodeURIComponent(q)}` : ''}`)).data.slice(0, 8)); } catch { setHits([]); } };
  return (
    <div>
      <div className="flex gap-1.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Search org to pin…" className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" />
        <button onClick={search} className="rounded bg-slate-800 px-3 py-1 text-sm hover:bg-slate-700">Search</button>
      </div>
      {hits.length > 0 && (
        <div className="mt-1 space-y-1">
          {hits.map((o) => (
            <div key={o.id} className="flex items-center gap-2 rounded border border-slate-800 px-3 py-1 text-sm">
              <span className="min-w-0 flex-1 truncate">{o.name} <span className="text-slate-500">· {o.planTier ?? '—'}</span></span>
              <button disabled={busy} onClick={() => { onPin(o.id); setHits([]); setQ(''); }} className="rounded bg-blue-600/80 px-2 py-0.5 text-[11px] hover:bg-blue-600">pin here</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
