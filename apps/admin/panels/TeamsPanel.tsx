'use client';

import { useCallback, useEffect, useState } from 'react';
import { orgsApi, teamsApi } from '@/lib/api/endpoints';
import type { OrgRow, PinnedOrg, Team, TRule, TStaff } from '@/lib/api/types';
import { useAction } from '@/lib/hooks';

const csv = (a?: string[]) => (a && a.length ? a.join(', ') : '');
const parseCsv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

// ── Support Teams admin ───────────────────────────────────────────────────────
export function TeamsPanel({ onError }: { onError: (s: string) => void }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [staff, setStaff] = useState<TStaff[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [pinned, setPinned] = useState<PinnedOrg[]>([]);
  const [newTeam, setNewTeam] = useState('');
  const [addId, setAddId] = useState('');
  const { busy, run } = useAction(onError);

  const load = useCallback(async () => {
    const [t, s] = await Promise.all([teamsApi.list(), teamsApi.staff()]);
    setTeams(t); setStaff(s);
    setSelId((cur) => cur ?? t[0]?.id ?? null);
  }, []);
  useEffect(() => { void run('load', load); }, [run, load]);
  useEffect(() => { if (selId) teamsApi.pinnedOrgs(selId).then(setPinned).catch(() => setPinned([])); }, [selId]);

  const sel = teams.find((t) => t.id === selId) || null;
  const wrap = (key: string, fn: () => Promise<unknown>) => run(key, fn, load);

  const createTeam = () => newTeam.trim() && wrap('create', async () => { await teamsApi.create(newTeam.trim()); setNewTeam(''); });
  const updateTeam = (patch: Partial<Pick<Team, 'name' | 'color' | 'isActive'>>) => sel &&
    wrap('update', () => teamsApi.update(sel.id, patch));
  const deleteTeam = () => sel &&
    window.confirm(`Delete team "${sel.name}"? Tickets return to triage; pinned orgs are unpinned.`) &&
    wrap('delete', async () => { await teamsApi.remove(sel.id); setSelId(null); });
  const addMember = (platformUserId: string, teamRole: 'MANAGER' | 'AGENT') => sel &&
    wrap('member', () => teamsApi.addMember(sel.id, platformUserId, teamRole));
  const removeMember = (platformUserId: string) => sel && wrap('member', () => teamsApi.removeMember(sel.id, platformUserId));
  const saveRule = (r: Partial<TRule> & { conditions: TRule['conditions'] }) => sel && wrap('rule', () => teamsApi.upsertRule(sel.id, r));
  const deleteRule = (ruleId: string) => wrap('rule', () => teamsApi.deleteRule(ruleId));
  const reloadPinned = async () => { if (selId) setPinned(await teamsApi.pinnedOrgs(selId)); };
  const pin = (organizationId: string, teamId: string | null) => run(
    'pin',
    () => teamsApi.pinOrg(organizationId, teamId),
    async () => { await load(); await reloadPinned(); });

  const memberIds = new Set(sel?.members.map((m) => m.platformUserId));
  const addable = staff.filter((s) => !memberIds.has(s.id));
  const isBusy = !!busy;

  return (
    <div className="flex h-[72vh] gap-4">
      <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-800">
        <div
          className={"border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase " +
            "tracking-wide text-slate-500"}>Support Teams ({teams.length})</div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelId(t.id)}
              className={`flex w-full items-center gap-2 border-b border-slate-800/60 px-4 py-2.5 text-left hover:bg-slate-800/40 ${selId === t.id
                ? 'bg-slate-800/60'
                : ''}`}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color ?? '#475569' }} />
              <span
                className="min-w-0 flex-1"><span
                  className={`block truncate text-sm font-medium ${t.isActive
                    ? ''
                    : 'text-slate-500 line-through'}`}>{t.name}</span><span
                      className="text-[11px] text-slate-500">{t._count?.members ??
                        t.members.length} members · {t._count?.routingRules ??
                          t.routingRules.length} rules · {t._count?.pinnedOrgs ?? 0} pinned</span></span>
            </button>
          ))}
          {teams.length === 0 && <p className="p-4 text-sm text-slate-500">No teams yet.</p>}
        </div>
        <div className="flex gap-1 border-t border-slate-800 p-2">
          <input
            aria-label="New team name"
            value={newTeam}
            onChange={(e) => setNewTeam(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createTeam()}
            placeholder="New team name…"
            className={"min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 " +
              "text-sm outline-none focus:border-blue-500"}
          />
          <button
            disabled={isBusy || !newTeam.trim()}
            onClick={createTeam}
            className="rounded bg-blue-600 px-3 text-sm hover:bg-blue-500 disabled:opacity-40">Add</button>
        </div>
      </aside>
      <section className="min-w-0 flex-1 overflow-y-auto rounded-xl border border-slate-800 p-5">
        {!sel ? <div className="flex h-full items-center justify-center text-sm text-slate-500">Select or create a team</div> : (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={sel.color ?? '#475569'}
                onChange={(e) => updateTeam({ color: e.target.value })}
                className="h-8 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent"
                title="Team color"
              />
              <input
                aria-label="Team name"
                defaultValue={sel.name}
                key={sel.id + sel.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== sel.name && updateTeam({ name: e.target.value.trim() })}
                className={"min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 " +
                  "text-lg font-semibold hover:border-slate-700 focus:border-blue-500 " +
                  "focus:outline-none"}
              />
              <label
                className="flex items-center gap-1 text-xs text-slate-400"><input
                  type="checkbox"
                  checked={sel.isActive}
                  onChange={(e) => updateTeam({ isActive: e.target.checked })}
                /> active</label>
              <button onClick={deleteTeam} className="rounded bg-red-600/80 px-2 py-1 text-[11px] hover:bg-red-600">Delete</button>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Members ({sel.members.length})</h3>
              <div className="space-y-1.5">
                {sel.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-1.5 text-sm">
                    <span
                      className="min-w-0 flex-1 truncate">{m.user?.firstName} {m.user?.lastName} <span
                        className="text-slate-500">· {m.user?.email}</span></span>
                    <select
                      aria-label="Team role"
                      value={m.teamRole}
                      onChange={(e) => addMember(m.platformUserId, e.target.value as 'MANAGER' | 'AGENT')}
                      className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px]"><option
                        value="AGENT">Agent</option><option value="MANAGER">Manager</option></select>
                    <button
                      onClick={() => removeMember(m.platformUserId)}
                      className="text-[11px] text-red-400 hover:text-red-300">remove</button>
                  </div>
                ))}
                {sel.members.length === 0 &&
                  <p className="text-sm text-slate-500">No members — this team&apos;s queue is invisible until someone is added.</p>}
              </div>
              {addable.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <select
                    aria-label="Add member"
                    value={addId}
                    onChange={(e) => setAddId(e.target.value)}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"><option
                      value="">Add member…</option>{addable.map((s) => <option
                        key={s.id}
                        value={s.id}>{s.firstName} {s.lastName} ({s.role})</option>)}</select>
                  <button
                    disabled={!addId || isBusy}
                    onClick={() => { addMember(addId, 'AGENT'); setAddId(''); }}
                    className={"rounded bg-slate-800 px-3 py-1 text-sm hover:bg-slate-700 " + "disabled:opacity-40"}>Add</button>
                </div>
              )}
            </div>
            <div>
              <h3
                className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Routing rules ({sel.routingRules.length})</h3>
              <p
                className="mb-2 text-xs text-slate-500">New tickets from orgs matching a rule auto-route here (first match by order wins; a manual org pin always wins over rules).</p>
              <RuleEditor rules={sel.routingRules} onSave={saveRule} onDelete={deleteRule} busy={isBusy} />
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pinned organizations ({pinned.length})</h3>
              <p className="mb-2 text-xs text-slate-500">Manually assigned orgs (overrides routing rules).</p>
              <PinBox onPin={(orgId) => pin(orgId, sel.id)} busy={isBusy} />
              <div className="mt-2 space-y-1">
                {pinned.map((o) => (
                  <div key={o.id} className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-1.5 text-sm">
                    <span
                      className="min-w-0 flex-1 truncate">{o.name} <span
                        className="text-slate-500">· {o.planTier ?? '—'} · {o.country ?? '—'} · {o.industry ?? '—'}</span></span>
                    <button onClick={() => pin(o.id, null)} className="text-[11px] text-red-400 hover:text-red-300">unpin</button>
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

const EMPTY_RULE = { name: '', order: '0', planTier: '', country: '', state: '', industry: '' };

function RuleEditor(
  {
    rules,
    onSave,
    onDelete,
    busy
  }: {
    rules: TRule[];
    onSave: (r: Partial<TRule> & { conditions: TRule['conditions'] }) => void;
    onDelete: (id: string) => void;
    busy: boolean
  }) {
  const [draft, setDraft] = useState(EMPTY_RULE);
  const save = () => {
    if (!draft.name.trim()) return;
    onSave({
      name: draft.name.trim(),
      order: Number(draft.order) || 0,
      isActive: true,
      conditions: {
        planTier: parseCsv(draft.planTier),
        country: parseCsv(draft.country),
        state: parseCsv(draft.state),
        industry: parseCsv(draft.industry)
      }
    });
    setDraft(EMPTY_RULE);
  };
  const cls = 'rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs';
  return (
    <div className="space-y-1.5">
      {rules.map((r) => (
        <div key={r.id} className="flex items-start gap-2 rounded-lg border border-slate-800 px-3 py-2 text-sm">
          <span className="mt-0.5 w-6 shrink-0 text-center text-xs text-slate-500">#{r.order}</span>
          <div className="min-w-0 flex-1">
            <div
              className="flex items-center gap-2"><span
                className="font-medium">{r.name}</span>{!r.isActive &&
                  <span
                    className="text-[10px] text-slate-500">(inactive)</span>}<button
                      onClick={() => onSave({ id: r.id, name: r.name, order: r.order, isActive: !r.isActive, conditions: r.conditions })}
                      className="text-[10px] text-slate-400 hover:text-slate-200">{r.isActive ? 'disable' : 'enable'}</button></div>
            <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-slate-400">
              {r.conditions.planTier?.length ? <Cond k="tier" v={csv(r.conditions.planTier)} /> : null}
              {r.conditions.country?.length ? <Cond k="country" v={csv(r.conditions.country)} /> : null}
              {r.conditions.state?.length ? <Cond k="region" v={csv(r.conditions.state)} /> : null}
              {r.conditions.industry?.length ? <Cond k="industry" v={csv(r.conditions.industry)} /> : null}
              {!r.conditions.planTier?.length &&
                !r.conditions.country?.length &&
                !r.conditions.state?.length &&
                !r.conditions.industry?.length
                ? <span className="text-slate-500">any org (catch-all)</span>
                : null}
            </div>
          </div>
          <button onClick={() => onDelete(r.id)} className="text-[11px] text-red-400 hover:text-red-300">delete</button>
        </div>
      ))}
      <div className="rounded-lg border border-dashed border-slate-700 p-2">
        <div className="mb-1.5 flex gap-2">
          <input
            aria-label="Rule name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Rule name (e.g. DACH · Pro+)"
            className={"min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 " + "text-sm"}
          />
          <input aria-label="Rule order" value={draft.order} onChange={(e) => setDraft({ ...draft, order: e.target.value })} type="number" title="order" className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
          <input value={draft.planTier} onChange={(e) => setDraft({ ...draft, planTier: e.target.value })} placeholder="planTier: professional, business" className={cls} />
          <input value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} placeholder="country: AT, DE, CH" className={cls} />
          <input value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} placeholder="region/state" className={cls} />
          <input value={draft.industry} onChange={(e) => setDraft({ ...draft, industry: e.target.value })} placeholder="industry: HVAC" className={cls} />
        </div>
        <div className="mt-1.5 flex justify-end"><button disabled={busy || !draft.name.trim()} onClick={save} className={"rounded bg-blue-600 px-3 py-1 text-sm hover:bg-blue-500 " + "disabled:opacity-40"}>Add rule</button></div>
        <p className="mt-1 text-[10px] text-slate-500">Comma-separated = OR within a field; fields AND together; leave a field blank for &quot;any&quot;.</p>
      </div>
    </div>
  );
}

const Cond = ({ k, v }: { k: string; v: string }) => <span className="rounded bg-slate-800 px-1.5 py-0.5"><span className="text-slate-500">{k}:</span> {v}</span>;

function PinBox({ onPin, busy }: { onPin: (orgId: string) => void; busy: boolean }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<OrgRow[]>([]);
  const search = async () => { try { setHits((await orgsApi.list({ search: q })).data.slice(0, 8)); } catch { setHits([]); } };
  return (
    <div>
      <div className="flex gap-1.5">
        <input aria-label="Search org to pin" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Search org to pin…" className={"min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 " + "text-sm"} />
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
