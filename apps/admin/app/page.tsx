'use client';

/**
 * HBCField Platform Control Center — independent admin app (admin.hbcfield.com).
 *
 * This file is the shell only: the session (sign-in, mandatory 2FA enrolment,
 * sliding refresh, idle sign-out, server-side sign-out, any 401 → sign-in), the
 * header, and which panel a tab renders. Calls go through lib/api (one client);
 * screens live in panels/ and components/. The server is authoritative on every
 * permission — the tab table only hides what it would refuse.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { clearToken, getToken, setToken, ENROLMENT_REQUIRED_EVENT, SESSION_EXPIRED_EVENT } from '@/lib/api/client';
import { authApi, billingApi, systemApi } from '@/lib/api/endpoints';
import type { BillingAlertRow, Cap, MailStatus, Me, SessionResponse } from '@/lib/api/types';
import { useSessionKeeper } from '@/lib/session';
import { tabsFor, type TabKey } from '@/lib/tabs';
import { LoginScreen } from '@/components/LoginScreen';
import { EnrolmentScreen } from '@/components/EnrolmentScreen';
import { SecurityModal } from '@/components/SecurityModal';
import { MailBanner } from '@/components/MailBanner';
import { OrgsPanel } from '@/panels/OrgsPanel';
import { OrgDrawer } from '@/panels/OrgDrawer';
import { RevenuePanel } from '@/panels/RevenuePanel';
import { PricingPanel } from '@/panels/PricingPanel';
import { SupportPanel } from '@/panels/SupportPanel';
import { TeamsPanel } from '@/panels/TeamsPanel';
import { LibraryPanel } from '@/panels/LibraryPanel';
import { StaffPanel } from '@/panels/StaffPanel';
import { AuditPanel } from '@/panels/AuditPanel';

export default function ControlCenter() {
  const [me, setMe] = useState<Me | null>(null);
  const [booting, setBooting] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('orgs');
  const [security, setSecurity] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  // Bumped after any change to an organization: the list, the header numbers
  // and an open drawer all reload from it — once, not per screen.
  const [orgsVersion, setOrgsVersion] = useState(0);
  const [alerts, setAlerts] = useState<BillingAlertRow[]>([]);
  const [mail, setMail] = useState<MailStatus | null>(null);

  const onError = useCallback((m: string) => setError(m), []);
  const can = useCallback((c: Cap) => !!me?.permissions.includes(c), [me]);
  const orgsChanged = useCallback(() => setOrgsVersion((v) => v + 1), []);

  const applySession = useCallback((s: SessionResponse) => {
    setToken(s.token);
    setMe({ user: s.user, permissions: s.permissions });
  }, []);

  const endLocal = useCallback((why: string | null) => {
    clearToken();
    setMe(null);
    setDetailId(null);
    setSecurity(false);
    setNotice(why);
  }, []);

  /** Sign out on the SERVER first (the token dies everywhere), then forget it here. */
  const signOut = useCallback(async (why: string | null = null) => {
    try { if (getToken()) await authApi.logout(); } catch { /* already expired: nothing to end */ }
    endLocal(why);
  }, [endLocal]);

  // Boot: restore the session if this tab still holds a token.
  useEffect(() => {
    if (!getToken()) { setBooting(false); return; }
    authApi.me().then(setMe).catch(() => clearToken()).finally(() => setBooting(false));
  }, []);

  // Any 401, from any screen → back to sign-in. A 403 "enrol first" → re-read who we are.
  useEffect(() => {
    const expired = () => endLocal('Your session ended — please sign in again.');
    const enrol = () => { authApi.me().then(setMe).catch(() => undefined); };
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    window.addEventListener(ENROLMENT_REQUIRED_EVENT, enrol);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
      window.removeEventListener(ENROLMENT_REQUIRED_EVENT, enrol);
    };
  }, [endLocal]);

  const working = !!me && !me.user.enrolmentRequired;
  useSessionKeeper(!!me, () => void signOut('Signed out after 30 minutes without activity.'));

  // Header data, once per session: the billing-alert count (only for those who
  // can read alerts) and outbound mail health.
  const loadAlerts = useCallback(async () => setAlerts(await billingApi.alerts()), []);
  useEffect(() => {
    if (!working) return;
    if (can('manageOrgs')) loadAlerts().catch(() => undefined);
    systemApi.mail().then(setMail).catch(() => undefined);
  }, [working, can, loadAlerts]);

  // A tab the role cannot open is never the current one.
  const tabs = useMemo(() => (me ? tabsFor(me.permissions) : []), [me]);
  useEffect(() => {
    if (tabs.length && !tabs.some((t) => t.key === tab)) setTab(tabs[0].key);
  }, [tabs, tab]);

  if (booting) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-500">…</div>;
  if (!me) return <LoginScreen onSession={(s) => { setNotice(null); applySession(s); }} notice={notice} />;
  if (me.user.enrolmentRequired) return <EnrolmentScreen me={me} onSession={applySession} onSignOut={() => void signOut()} />;

  const openOrg = (id: string) => setDetailId(id);

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">Platform Control Center</h1>
            <nav className="flex flex-wrap gap-1 rounded-lg border border-slate-800 p-0.5 text-sm" aria-label="Sections">
              {tabs.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)} className={`rounded px-3 py-1 ${tab === t.key ? 'bg-slate-800' : 'text-slate-400'}`}>
                  {t.label}
                  {t.key === 'revenue' && alerts.length > 0 && <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">{alerts.length}</span>}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-400">{me.user.firstName} {me.user.lastName} · <span className="text-blue-400">{me.user.role}</span>{me.user.twoFactorEnabled && <span className="ml-1 text-green-400" title="2FA on">🔒</span>}</span>
            <button onClick={() => setSecurity(true)} className="text-xs text-slate-400 hover:text-slate-200">Security</button>
            <button onClick={() => void signOut()} className="text-xs text-slate-400 hover:text-slate-200">Sign out</button>
          </div>
        </div>

        <MailBanner mail={mail} />
        {notice && <div className="mb-4 rounded-lg border border-green-900 bg-green-950/40 px-3 py-2 text-sm text-green-300">{notice} <button onClick={() => setNotice(null)} className="ml-2 opacity-60">✕</button></div>}
        {error && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error} <button onClick={() => setError(null)} className="ml-2 opacity-60">✕</button></div>}

        {tab === 'orgs' && <OrgsPanel can={can} version={orgsVersion} onChanged={orgsChanged} onOpen={openOrg} onError={onError} />}
        {tab === 'revenue' && <RevenuePanel alerts={alerts} reload={loadAlerts} onOpen={openOrg} onError={onError} />}
        {tab === 'pricing' && <PricingPanel canCheckStripe={can('editPricing')} onError={onError} />}
        {tab === 'library' && <LibraryPanel onError={onError} />}
        {tab === 'support' && <SupportPanel onError={onError} isSupervisor={!!me.user.isSupportSupervisor} hasTeams={(me.user.supportTeamIds?.length ?? 0) > 0} canListTeams={can('manageSupportTeams')} />}
        {tab === 'teams' && <TeamsPanel onError={onError} />}
        {tab === 'team' && <StaffPanel meId={me.user.id} onError={onError} />}
        {tab === 'audit' && <AuditPanel onError={onError} onOpenOrg={openOrg} />}
      </div>

      {detailId && <OrgDrawer id={detailId} version={orgsVersion} can={can} onClose={() => setDetailId(null)} onChanged={orgsChanged} onError={onError} />}
      {security && <SecurityModal me={me} onClose={() => setSecurity(false)} onError={onError} onSession={applySession} onNotice={setNotice} />}
    </div>
  );
}
