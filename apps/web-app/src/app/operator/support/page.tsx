'use client';

/**
 * Operator support inbox — platform staff (agents). Reuses the same platform key
 * as the operator console (sessionStorage `platformKey`, sent as
 * `x-platform-admin-key`). Priority-routed queue; real-time is left to a manual
 * refresh here (agents keep it open) — the customer side is fully live.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SocketEvents, type SupportTicket, type SupportMessage } from '@hbcfield/shared/client';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4001';

async function agentFetch<T>(key: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'x-platform-admin-key': key, ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export default function OperatorSupportPage() {
  const [key, setKey] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<(SupportTicket & { messages: SupportMessage[] }) | null>(null);
  const [reply, setReply] = useState('');
  const [note, setNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem('platformKey');
    if (saved) setKey(saved);
  }, []);

  const loadInbox = useCallback(async () => {
    if (!key) return;
    try {
      const res = await agentFetch<{ data: SupportTicket[] }>(key, '/support/agent/inbox');
      setTickets(res.data);
      setError(null);
    } catch (e) {
      setError((e as Error).message === '403' ? 'Invalid key' : 'Failed to load');
    }
  }, [key]);

  const loadTicket = useCallback(
    async (id: string) => {
      const res = await agentFetch<{ data: any }>(key, `/support/agent/tickets/${id}`);
      setActive(res.data);
      await agentFetch(key, `/support/agent/tickets/${id}/read`, { method: 'POST', body: '{}' });
    },
    [key],
  );

  useEffect(() => {
    if (key) loadInbox();
  }, [key, loadInbox]);
  useEffect(() => {
    if (activeId) loadTicket(activeId);
  }, [activeId, loadTicket]);

  // Live: connect an agent socket with the platform key; refresh on any event.
  useEffect(() => {
    if (!key) return;
    let socket: any;
    (async () => {
      const { io } = await import('socket.io-client');
      socket = io(SOCKET_URL, { auth: { platformKey: key }, transports: ['websocket', 'polling'] });
      socketRef.current = socket;
      socket.on('connect', () => socket.emit('authenticate_agent'));
      const refresh = (d: any) => {
        loadInbox();
        if (activeId && (!d?.ticket || d.ticket.id === activeId || d?.ticketId === activeId)) loadTicket(activeId);
      };
      socket.on(SocketEvents.SUPPORT_MESSAGE, refresh);
      socket.on(SocketEvents.SUPPORT_TICKET_UPDATED, refresh);
    })();
    return () => socket?.disconnect();
  }, [key, activeId, loadInbox, loadTicket]);

  const saveKey = (k: string) => {
    sessionStorage.setItem('platformKey', k);
    setKey(k);
  };

  const doReply = async () => {
    if (!activeId || !reply.trim()) return;
    await agentFetch(key, `/support/agent/tickets/${activeId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body: reply.trim(), isInternalNote: note }),
    });
    setReply('');
    loadTicket(activeId);
    loadInbox();
  };

  const setStatus = async (status: string) => {
    if (!activeId) return;
    await agentFetch(key, `/support/agent/tickets/${activeId}/status`, { method: 'POST', body: JSON.stringify({ status }) });
    loadTicket(activeId);
    loadInbox();
  };

  if (!key) {
    return (
      <div className="mx-auto mt-24 max-w-sm rounded-xl border border-slate-200 p-6">
        <h1 className="mb-3 text-lg font-semibold">Support console</h1>
        <input
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="Platform admin key"
          className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button onClick={() => saveKey(keyInput)} className="w-full rounded-lg bg-slate-900 py-2 text-sm text-white">
          Unlock
        </button>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Inbox */}
      <div className="w-80 shrink-0 overflow-y-auto border-r border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 p-3">
          <span className="text-sm font-semibold">Inbox ({tickets.length})</span>
          <button onClick={loadInbox} className="text-xs text-blue-600">Refresh</button>
        </div>
        {tickets.map((tk) => (
          <button
            key={tk.id}
            onClick={() => setActiveId(tk.id)}
            className={`block w-full border-b border-slate-50 p-3 text-left hover:bg-slate-50 ${activeId === tk.id ? 'bg-slate-50' : ''}`}
          >
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${tk.slaBreached ? 'bg-red-500' : 'bg-blue-500'}`} />
              <span className="truncate text-sm font-medium text-slate-800">{tk.subject}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
              <span className="uppercase">{tk.planTierAtCreation || '—'}</span>·<span>{tk.status}</span>
              {tk.slaBreached && <span className="text-red-500">SLA breached</span>}
            </div>
          </button>
        ))}
      </div>

      {/* Thread */}
      <div className="flex flex-1 flex-col">
        {active ? (
          <>
            <div className="flex items-center justify-between border-b border-slate-100 p-3">
              <div>
                <div className="text-sm font-semibold">{active.subject}</div>
                <div className="text-[11px] text-slate-400">
                  {active.createdBy?.firstName} {active.createdBy?.lastName} · {active.planTierAtCreation}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStatus('RESOLVED')} className="rounded-md bg-green-600 px-2.5 py-1 text-xs text-white">Resolve</button>
                <button onClick={() => setStatus('CLOSED')} className="rounded-md bg-slate-500 px-2.5 py-1 text-xs text-white">Close</button>
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {active.messages?.map((m) => (
                <div key={m.id} className={`flex ${m.authorType === 'AGENT' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[70%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                      m.isInternalNote ? 'border border-amber-300 bg-amber-50 text-amber-800' : m.authorType === 'AGENT' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {m.isInternalNote && <div className="mb-0.5 text-[10px] font-semibold uppercase">Internal note</div>}
                    {m.body}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 p-3">
              <label className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
                <input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} /> Internal note (not sent to customer)
              </label>
              <div className="flex gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder={note ? 'Internal note…' : 'Reply to customer…'}
                />
                <button onClick={doReply} className="rounded-lg bg-blue-600 px-4 text-sm text-white">Send</button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Select a ticket</div>
        )}
      </div>
    </div>
  );
}
