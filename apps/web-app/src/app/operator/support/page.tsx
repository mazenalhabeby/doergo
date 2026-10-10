'use client';

/**
 * Operator support inbox — platform staff (agents). Priority-routed queue;
 * real-time is left to a manual refresh here (agents keep it open) — the
 * customer side is fully live.
 *
 * ⚠️ The PLATFORM admin key is held in this page's memory only and asked for on
 * every visit. It used to sit in sessionStorage on the product's main origin,
 * where any script running for any customer page on hbcfield.com could read the
 * one credential that opens every organization.
 *
 * TODO: this page belongs on admin.hbcfield.com (the operator console), not on
 * the customer-facing origin at all. Until it moves, it keeps the key in memory
 * and talks through the same request pipeline as the rest of the app (timeout,
 * retries) — WITHOUT the signed-in member's token, which it has no use for.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client'
import { SocketEvents, path, type SupportTicket, type SupportMessage } from '@hbcfield/shared/client';

import { http } from '@/lib/http-client';
import { SOCKET_URL } from '@/lib/endpoints';

async function agentFetch<T>(key: string, path: string, init?: { method?: string; body?: string }): Promise<T> {
  try {
    return await http.request<T>((init?.method ?? 'GET') as 'GET' | 'POST' | 'PATCH', path, {
      ...(init?.body !== undefined ? { body: init.body } : {}),
      // The platform key, not the member's session.
      auth: false,
      headers: { 'x-platform-admin-key': key },
      unwrap: 'raw',
    });
  } catch (e) {
    throw new Error(`${(e as { status?: number }).status ?? 0}`);
  }
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
  const socketRef = useRef<Socket | null>(null);
  // Keep the current ticket id in a ref so the socket effect can read it without
  // re-subscribing (and tearing down the socket) every time it changes.
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  // A key left in sessionStorage by an earlier version of this page is removed, never read.
  useEffect(() => {
    try {
      sessionStorage.removeItem('platformKey');
    } catch {
      /* storage blocked — nothing to clean */
    }
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
      try {
        const res = await agentFetch<{ data: SupportTicket & { messages: SupportMessage[] } }>(key, path`/support/agent/tickets/${id}`);
        setActive(res.data);
        setError(null);
        await agentFetch(key, path`/support/agent/tickets/${id}/read`, { method: 'POST', body: '{}' });
      } catch (e) {
        setError((e as Error).message === '403' ? 'Invalid key' : 'Failed to load ticket');
      }
    },
    [key],
  );

  useEffect(() => {
    if (key) loadInbox();
  }, [key, loadInbox]);
  useEffect(() => {
    if (activeId) loadTicket(activeId);
  }, [activeId, loadTicket]);

  // Live: connect ONE agent socket per key; refresh on any event. Reads the open
  // ticket via a ref so it never re-subscribes (and drops the socket) mid-session.
  useEffect(() => {
    if (!key) return;
    let socket: Socket | undefined;
    let cancelled = false;
    (async () => {
      const { io } = await import('socket.io-client');
      if (cancelled) return;
      // Bound to a const so the connect handler cannot see the outer `socket`
      // as possibly-undefined — it is assigned exactly once, right here.
      const opts = { auth: { platformKey: key }, transports: ['websocket', 'polling'] };
      const s = SOCKET_URL ? io(SOCKET_URL, opts) : io(opts);
      socket = s;
      socketRef.current = s;
      s.on('connect', () => s.emit('authenticate_agent'));
      const refresh = (d: { ticket?: { id?: string }; ticketId?: string } | undefined) => {
        loadInbox();
        const openId = activeIdRef.current;
        if (openId && (!d?.ticket || d.ticket.id === openId || d?.ticketId === openId)) loadTicket(openId);
      };
      socket.on(SocketEvents.SUPPORT_MESSAGE, refresh);
      socket.on(SocketEvents.SUPPORT_TICKET_UPDATED, refresh);
    })();
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [key, loadInbox, loadTicket]);

  // Memory only: a reload asks again.
  const saveKey = (k: string) => {
    setKey(k.trim());
    setKeyInput('');
  };

  const doReply = async () => {
    if (!activeId || !reply.trim()) return;
    try {
      await agentFetch(key, path`/support/agent/tickets/${activeId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: reply.trim(), isInternalNote: note }),
      });
      setReply(''); // clear only on success
      setError(null);
      loadTicket(activeId);
      loadInbox();
    } catch {
      setError('Failed to send reply');
    }
  };

  const setStatus = async (status: string) => {
    if (!activeId) return;
    try {
      await agentFetch(key, path`/support/agent/tickets/${activeId}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      setError(null);
      loadTicket(activeId);
      loadInbox();
    } catch {
      setError('Failed to update status');
    }
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
              {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
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
