'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supportApi, teamsApi } from '@/lib/api/endpoints';
import { SOCKET_ORIGIN, getToken, isAbort, errorMessage } from '@/lib/api/client';
import type { InboxView, Msg, Ticket } from '@/lib/api/types';
import { dateTime } from '@/lib/format';
import { useAction } from '@/lib/hooks';

const TSTATUS: Record<string, string> = { OPEN: 'bg-red-500/15 text-red-400', PENDING: 'bg-amber-500/15 text-amber-400', RESOLVED: 'bg-green-500/15 text-green-400', CLOSED: 'bg-slate-500/15 text-slate-400' };
/** A burst of socket events (a reply = message + ticket update) becomes one refetch. */
const SOCKET_DEBOUNCE_MS = 1000;
/** The safety net while the socket is down — and only then. */
const POLL_MS = 30_000;
const VIEW_LABEL: Record<InboxView, string> = { team: 'My teams', mine: 'Assigned to me', unassigned: 'Triage', all: 'All' };

export function SupportPanel({ onError, isSupervisor, hasTeams, canListTeams }: { onError: (s: string) => void; isSupervisor: boolean; hasTeams: boolean; canListTeams: boolean }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [teamNames, setTeamNames] = useState<Record<string, { name: string; color?: string | null }>>({});
  const [sel, setSel] = useState<string | null>(null);
  const [thread, setThread] = useState<{ ticket: Ticket; messages: Msg[] } | null>(null);
  const [reply, setReply] = useState('');
  const [note, setNote] = useState(false);
  const [live, setLive] = useState(false);
  // Scope view: supervisors default to "all"; scoped agents to their queue.
  const [view, setView] = useState<InboxView>(isSupervisor ? 'all' : hasTeams ? 'team' : 'unassigned');
  const { busy, run } = useAction(onError);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selRef = useRef(sel); selRef.current = sel;
  const viewRef = useRef(view); viewRef.current = view;
  const inboxAbort = useRef<AbortController | null>(null);

  const loadInbox = useCallback(async () => {
    inboxAbort.current?.abort();
    const ctrl = new AbortController();
    inboxAbort.current = ctrl;
    try { setTickets((await supportApi.inbox(viewRef.current, { signal: ctrl.signal })) ?? []); }
    catch (e) { if (!isAbort(e)) onError(errorMessage(e, 'Load failed')); }
  }, [onError]);
  const loadThread = useCallback(async (id: string) => {
    try {
      const t = await supportApi.thread(id);
      setThread({ ticket: t, messages: t?.messages ?? [] });
    } catch (e) { onError(errorMessage(e, 'Load failed')); }
  }, [onError]);
  const refresh = useCallback(() => { void loadInbox(); if (selRef.current) void loadThread(selRef.current); }, [loadInbox, loadThread]);

  // The inbox: ONE load per view (this effect also covers the first render).
  useEffect(() => { void loadInbox(); }, [view, loadInbox]);
  useEffect(() => () => inboxAbort.current?.abort(), []);

  // Team names for the chips — only for those who may list teams.
  useEffect(() => {
    if (!canListTeams) return;
    teamsApi.list().then((r) => setTeamNames(Object.fromEntries(r.map((t) => [t.id, { name: t.name, color: t.color }])))).catch(() => undefined);
  }, [canListTeams]);

  // Real-time via Socket.IO (an agent socket, authenticated with the CURRENT
  // token on every (re)connect — tokens are short and refreshed).
  useEffect(() => {
    let socket: { disconnect: () => void } | null = null;
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const soon = () => { clearTimeout(debounce); debounce = setTimeout(refresh, SOCKET_DEBOUNCE_MS); };
    (async () => {
      const { io } = await import('socket.io-client');
      if (cancelled) return;
      const s = io(SOCKET_ORIGIN || undefined, {
        auth: (cb: (d: Record<string, unknown>) => void) => cb({ token: getToken() }),
        transports: ['websocket', 'polling'],
        reconnection: true,
      });
      socket = s;
      s.on('connect', () => {
        s.emit('authenticate_agent', (ack?: { success?: boolean }) => {
          setLive(ack?.success !== false);
          // Anything that happened while we were not live.
          if (ack?.success !== false) soon();
        });
      });
      s.on('disconnect', () => setLive(false));
      s.on('support.message', soon);
      s.on('support.ticketUpdated', soon);
    })();
    return () => { cancelled = true; clearTimeout(debounce); socket?.disconnect(); };
  }, [refresh]);

  // Poll ONLY while the socket is not live.
  useEffect(() => {
    if (live) return;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [live, refresh]);

  useEffect(() => {
    if (!sel) return;
    void loadThread(sel);
    supportApi.markRead(sel).catch(() => undefined);
  }, [sel, loadThread]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [thread?.messages.length]);

  const after = () => { if (sel) void loadThread(sel); void loadInbox(); };
  const assignTeam = (teamId: string | null) => sel && run('assign', () => supportApi.assign(sel, { teamId }), after);
  const claim = () => sel && run('claim', () => supportApi.assign(sel, {}), after);
  const setStatus = (status: string) => sel && run('status', () => supportApi.setStatus(sel, status), after);
  const send = () => {
    if (!sel || !reply.trim()) return;
    void run('send', async () => { await supportApi.reply(sel, reply.trim(), note); setReply(''); }, after);
  };

  const teamChip = (id?: string | null) => {
    if (!id) return <span className="rounded-full bg-slate-700/50 px-1.5 py-0.5 text-[10px] text-slate-400">triage</span>;
    const t = teamNames[id];
    return <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: (t?.color ?? '#334155') + '33', color: t?.color ?? '#94a3b8' }}>{t?.name ?? 'team'}</span>;
  };
  const views: InboxView[] = isSupervisor ? ['all', 'unassigned', 'mine'] : [...(hasTeams ? (['team'] as InboxView[]) : []), 'unassigned', 'mine'];

  return (
    <div className="flex h-[70vh] gap-4">
      <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Inbox ({tickets.length})
          <span className={`ml-auto flex items-center gap-1 normal-case ${live ? 'text-green-400' : 'text-slate-600'}`}><span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-green-400' : 'bg-slate-600'}`} />{live ? 'live' : 'polling'}</span>
        </div>
        <div className="flex gap-1 border-b border-slate-800 px-2 py-1.5 text-[11px]">
          {views.map((v) => <button key={v} onClick={() => setView(v)} className={`rounded px-2 py-0.5 ${view === v ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}>{VIEW_LABEL[v]}</button>)}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tickets.length === 0 ? <p className="p-4 text-sm text-slate-500">No tickets in this view.</p> : tickets.map((t) => (
            <button key={t.id} onClick={() => setSel(t.id)} className={`flex w-full flex-col gap-0.5 border-b border-slate-800/60 px-4 py-2.5 text-left hover:bg-slate-800/40 ${sel === t.id ? 'bg-slate-800/60' : ''}`}>
              <div className="flex items-center gap-2"><span className={`rounded-full px-1.5 py-0.5 text-[10px] ${TSTATUS[t.status] ?? 'bg-slate-700'}`}>{t.status?.toLowerCase()}</span>{teamChip(t.assignedTeamId)}{t.assignedAgentId && <span className="truncate text-[10px] text-blue-400">@{t.assignedAgentName ?? t.assignedAgentId}</span>}</div>
              <span className="truncate text-sm font-medium">{t.subject}</span>
              <span className="truncate text-xs text-slate-500">{t.createdBy?.firstName} {t.createdBy?.lastName} · {dateTime(t.lastCustomerMessageAt)}</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-800">
        {!thread ? <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Select a ticket</div> : (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><span className="truncate font-semibold">{thread.ticket.subject}</span>{teamChip(thread.ticket.assignedTeamId)}</div>
                <div className="text-xs text-slate-500">{thread.ticket.createdBy?.email} · {thread.ticket.status?.toLowerCase()}{thread.ticket.assignedAgentId && <span className="text-blue-400"> · @{thread.ticket.assignedAgentName ?? thread.ticket.assignedAgentId}</span>}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <select aria-label="Route to team" disabled={!!busy} value={thread.ticket.assignedTeamId ?? ''} onChange={(e) => assignTeam(e.target.value || null)} className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[11px]">
                  <option value="">Triage</option>{Object.entries(teamNames).map(([id, t]) => <option key={id} value={id}>{t.name}</option>)}
                </select>
                <button disabled={!!busy} onClick={claim} className="rounded bg-blue-600/80 px-2 py-1 text-[11px] hover:bg-blue-600" title="Assign to me">Claim</button>
                <button disabled={!!busy} onClick={() => setStatus('RESOLVED')} className="rounded bg-green-600/80 px-2 py-1 text-[11px] hover:bg-green-600">Resolve</button>
                <button disabled={!!busy} onClick={() => setStatus('CLOSED')} className="rounded bg-slate-600/80 px-2 py-1 text-[11px] hover:bg-slate-600">Close</button>
              </div>
            </div>
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-950/40 p-4">
              {thread.messages.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.authorType === 'AGENT' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.isInternalNote ? 'border border-amber-700 bg-amber-950/40 text-amber-200' : m.authorType === 'AGENT' ? 'bg-blue-600 text-white' : 'bg-slate-800'}`}>
                    {m.isInternalNote && <div className="mb-0.5 text-[10px] font-semibold">internal note</div>}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  </div>
                  <span className="mt-0.5 text-[10px] text-slate-500">{m.authorType === 'AGENT' ? (m.authorName || m.authorId || 'agent') : 'customer'} · {dateTime(m.createdAt)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-800 p-3">
              <div className="mb-1.5 flex items-center gap-2 text-xs text-slate-400"><label className="flex items-center gap-1"><input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} /> internal note (not shown to customer)</label></div>
              <div className="flex gap-2">
                <textarea aria-label="Reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={1} placeholder="Reply…" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
                <button disabled={busy === 'send' || !reply.trim()} onClick={send} className="rounded-lg bg-blue-600 px-4 text-sm hover:bg-blue-500 disabled:opacity-40">Send</button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
