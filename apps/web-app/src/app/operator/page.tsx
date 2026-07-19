'use client';

/**
 * PLATFORM-OPERATOR console (HBC internal — NOT a customer page). Hidden route,
 * no customer login. Gated purely by the PLATFORM_ADMIN_KEY: you paste it once
 * (kept in sessionStorage), and every request sends it as `x-platform-admin-key`.
 * Lets the operator set an org's tier — mainly ENTERPRISE for custom quotes.
 */
import { useCallback, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
const TIERS = ['starter', 'professional', 'business', 'enterprise'] as const;
type Tier = (typeof TIERS)[number];

interface Org {
  id: string;
  name: string;
  planTier: string | null;
  subStatus: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
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

export default function OperatorPage() {
  const [key, setKey] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, Tier>>({});
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const saved = sessionStorage.getItem('platformKey');
    if (saved) setKey(saved);
  }, []);

  const load = useCallback(async (k: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch<{ data: Org[] }>('/billing/admin/orgs', k);
      setOrgs(r.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      if (String(e).includes('Forbidden')) {
        setKey('');
        sessionStorage.removeItem('platformKey');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (key) void load(key);
  }, [key, load]);

  const unlock = () => {
    const k = keyInput.trim();
    if (!k) return;
    sessionStorage.setItem('platformKey', k);
    setKey(k);
  };

  const apply = async (org: Org) => {
    const tier = pending[org.id] ?? (org.planTier?.toLowerCase() as Tier) ?? 'enterprise';
    setBusyId(org.id);
    setError(null);
    try {
      await apiFetch('/billing/admin/org-tier', key, {
        method: 'POST',
        body: JSON.stringify({ organizationId: org.id, tier }),
      });
      await load(key);
      setPending((p) => {
        const n = { ...p };
        delete n[org.id];
        return n;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setBusyId(null);
    }
  };

  // ── Key gate ──────────────────────────────────────────────────────────────
  if (!key) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">Operator console</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter the platform admin key.</p>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && unlock()}
            placeholder="PLATFORM_ADMIN_KEY"
            className="mt-5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-foreground/40"
          />
          <button
            onClick={unlock}
            className="mt-4 w-full rounded-lg bg-foreground py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Unlock
          </button>
          {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
        </div>
      </main>
    );
  }

  const visible = orgs.filter(
    (o) => o.name.toLowerCase().includes(filter.toLowerCase()) || o.id.includes(filter),
  );

  return (
    <main className="min-h-screen bg-background p-6 sm:p-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Operator — plans</h1>
            <p className="text-sm text-muted-foreground">{orgs.length} organizations</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/40"
            />
            <button
              onClick={() => load(key)}
              disabled={loading}
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-accent disabled:opacity-50"
            >
              {loading ? '…' : 'Refresh'}
            </button>
            <button
              onClick={() => {
                sessionStorage.removeItem('platformKey');
                setKey('');
              }}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Lock
            </button>
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Current</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Set tier</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => {
                const current = (o.planTier?.toLowerCase() as Tier) || undefined;
                const sel = pending[o.id] ?? current ?? 'enterprise';
                const changed = sel !== current;
                return (
                  <tr key={o.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{o.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{o.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-foreground">
                        {o.planTier || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{o.subStatus || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={sel}
                          onChange={(e) => setPending((p) => ({ ...p, [o.id]: e.target.value as Tier }))}
                          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                        >
                          {TIERS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => apply(o)}
                          disabled={!changed || busyId === o.id}
                          className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-40"
                        >
                          {busyId === o.id ? '…' : 'Apply'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No organizations.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Setting a tier unlocks its features immediately (users see it within ~60s). The Stripe custom price for
          Enterprise is managed separately in the Stripe dashboard.
        </p>
      </div>
    </main>
  );
}
