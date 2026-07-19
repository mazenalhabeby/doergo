'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Headset, X, ChevronLeft, Send, Loader2, Circle } from 'lucide-react';
import { SocketEvents, isSupportOpen, type SupportTicket } from '@hbcfield/shared/client';
import { supportApi } from '@/lib/api';
import { useSocketContext } from '@/contexts/socket-context';
import { useAuth } from '@/contexts/auth-context';

/**
 * Floating, tier-aware support widget. Everyone can open tickets; Business+ sees
 * a live-chat availability indicator (config.liveChat + an online agent). Updates
 * in real time off the shared Socket.IO connection — no polling.
 */
export function SupportWidget() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { subscribe } = useSocketContext();

  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [agentOnline, setAgentOnline] = useState(false);

  // Only signed-in dashboard users get the widget.
  const enabled = !!user?.organizationId;

  const { data: config } = useQuery({
    queryKey: ['support', 'config'],
    queryFn: supportApi.getConfig,
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const { data: tickets, isLoading: ticketsLoading } = useQuery({
    queryKey: ['support', 'tickets'],
    queryFn: () => supportApi.list(),
    enabled, // fetch even while closed so the launcher can show an unread badge
  });

  // Total unread agent replies across the customer's tickets (drives the badge).
  const unreadTotal = (tickets?.data ?? []).reduce((n, tk) => n + (tk.unreadForCustomer ?? 0), 0);

  const { data: active } = useQuery({
    queryKey: ['support', 'ticket', activeId],
    queryFn: () => supportApi.get(activeId as string),
    enabled: !!activeId,
  });

  // Real-time: refresh list + open thread when a support event lands.
  useEffect(() => {
    if (!enabled) return;
    const offs = [
      subscribe(SocketEvents.SUPPORT_MESSAGE, (d: any) => {
        qc.invalidateQueries({ queryKey: ['support', 'tickets'] });
        if (d?.ticketId) qc.invalidateQueries({ queryKey: ['support', 'ticket', d.ticketId] });
      }),
      subscribe(SocketEvents.SUPPORT_TICKET_UPDATED, () => {
        qc.invalidateQueries({ queryKey: ['support', 'tickets'] });
        if (activeId) qc.invalidateQueries({ queryKey: ['support', 'ticket', activeId] });
      }),
      subscribe(SocketEvents.SUPPORT_AGENT_PRESENCE, (d: any) => setAgentOnline(!!d?.online)),
    ];
    return () => offs.forEach((off) => off());
  }, [enabled, subscribe, qc, activeId]);

  // Mark the open thread read whenever its message count changes — but drive it
  // off a ref, not an effect dep, so opening a ticket / new message marks read
  // once without re-subscribing or looping.
  const lastReadLenRef = useRef<Record<string, number>>({});
  const msgLen = active?.messages?.length ?? 0;
  useEffect(() => {
    if (!activeId) return;
    if (lastReadLenRef.current[activeId] === msgLen) return;
    lastReadLenRef.current[activeId] = msgLen;
    supportApi
      .markRead(activeId)
      .then(() => qc.invalidateQueries({ queryKey: ['support', 'tickets'] }))
      .catch(() => {});
  }, [activeId, msgLen, qc]);

  const liveChat = !!config?.liveChat && agentOnline;

  if (!enabled) return null;

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t('support.title', 'Support')}
        className="group fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-[0_10px_30px_-6px_rgba(37,99,235,0.55)] ring-1 ring-white/20 transition-all duration-300 ease-out hover:scale-105 hover:shadow-[0_14px_40px_-6px_rgba(37,99,235,0.7)] active:scale-95"
      >
        {/* soft attention pulse when there are unread replies */}
        {!open && unreadTotal > 0 && (
          <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-blue-500/40" />
        )}
        {/* subtle top-light sheen for depth */}
        <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/25 to-transparent opacity-70" />
        <span className="relative transition-transform duration-300 group-hover:scale-110">
          {open ? <X className="h-5 w-5" /> : <Headset className="h-[23px] w-[23px]" strokeWidth={1.75} />}
        </span>
        {!open && unreadTotal > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadTotal > 9 ? '9+' : unreadTotal}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-40 flex h-[560px] max-h-[80vh] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
            {(activeId || composing) && (
              <button onClick={() => { setActiveId(null); setComposing(false); }} className="text-slate-400 hover:text-slate-700">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-800">{t('support.title', 'Support')}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                {config?.liveChat ? (
                  <>
                    <Circle className={`h-2 w-2 ${agentOnline ? 'fill-green-500 text-green-500' : 'fill-slate-300 text-slate-300'}`} />
                    {agentOnline ? t('support.agentOnline', 'Live chat — agent online') : t('support.leaveMessage', 'Leave a message')}
                  </>
                ) : (
                  <SlaLine minutes={config?.slaBusinessMinutes} t={t} />
                )}
              </div>
            </div>
          </div>

          {/* Body */}
          {composing ? (
            <NewTicket onDone={(id) => { setComposing(false); setActiveId(id); }} liveChat={liveChat} />
          ) : activeId ? (
            <Thread ticket={active} />
          ) : (
            <TicketList tickets={tickets?.data} loading={ticketsLoading} onOpen={setActiveId} onNew={() => setComposing(true)} t={t} />
          )}
        </div>
      )}
    </>
  );
}

function SlaLine({ minutes, t }: { minutes?: number; t: import("i18next").TFunction }) {
  if (!minutes) return <span>{t('support.email', 'Email support')}</span>;
  const hours = Math.round(minutes / 60);
  return <span>{t('support.typicalReply', 'Typical reply within')} {hours}h</span>;
}

function TicketList({
  tickets,
  loading,
  onOpen,
  onNew,
  t,
}: {
  tickets?: SupportTicket[];
  loading?: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  t: import("i18next").TFunction;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
          </div>
        ) : tickets && tickets.length > 0 ? (
          tickets.map((tk) => (
            <button
              key={tk.id}
              onClick={() => onOpen(tk.id)}
              className="flex w-full items-start gap-2 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50"
            >
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${isSupportOpen(tk.status) ? 'bg-blue-500' : 'bg-slate-300'}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">{tk.subject}</span>
                <span className="block truncate text-xs text-slate-400">{t(`support.status.${tk.status}`, tk.status)}</span>
              </span>
              {!!tk.unreadForCustomer && (
                <span className="mt-0.5 rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white">{tk.unreadForCustomer}</span>
              )}
            </button>
          ))
        ) : (
          <div className="p-6 text-center text-sm text-slate-400">{t('support.empty', 'No tickets yet.')}</div>
        )}
      </div>
      <div className="border-t border-slate-100 p-3">
        <a
          href="/help"
          target="_blank"
          rel="noreferrer"
          className="mb-2 block rounded-lg border border-slate-200 py-2 text-center text-[13px] font-medium text-slate-600 transition hover:bg-slate-50"
        >
          {t('support.browseHelp', 'Browse the help center')}
        </a>
        <button onClick={onNew} className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700">
          {t('support.newTicket', 'New request')}
        </button>
      </div>
    </div>
  );
}

function NewTicket({ onDone, liveChat }: { onDone: (id: string) => void; liveChat: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const mut = useMutation({
    mutationFn: () => supportApi.create({ subject: subject.trim(), body: body.trim(), channel: 'WEB' }),
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: ['support', 'tickets'] });
      onDone(ticket.id);
    },
  });
  const canSend = subject.trim().length >= 2 && body.trim().length >= 1 && !mut.isPending;
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder={t('support.subjectPlaceholder', 'Subject')}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={liveChat ? t('support.chatPlaceholder', 'Describe your issue — an agent is online') : t('support.bodyPlaceholder', 'How can we help?')}
        rows={7}
        className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
      />
      {mut.isError && <p className="text-xs text-red-500">{(mut.error as Error).message}</p>}
      <button
        disabled={!canSend}
        onClick={() => mut.mutate()}
        className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {t('support.send', 'Send')}
      </button>
    </div>
  );
}

function Thread({ ticket }: { ticket?: SupportTicket }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = ticket?.messages ?? [];

  const mut = useMutation({
    mutationFn: () => supportApi.reply(ticket!.id, text.trim()),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['support', 'ticket', ticket!.id] });
      qc.invalidateQueries({ queryKey: ['support', 'tickets'] });
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const canSend = text.trim().length > 0 && !mut.isPending && !!ticket;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.map((m) => {
          const mine = m.authorType === 'CUSTOMER';
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-blue-600 text-white' : m.authorType === 'SYSTEM' ? 'bg-slate-100 text-slate-500' : 'bg-slate-100 text-slate-800'}`}>
                {m.body}
              </div>
            </div>
          );
        })}
      </div>
      {mut.isError && <p className="px-3 pb-1 text-xs text-red-500">{(mut.error as Error).message}</p>}
      <div className="flex items-end gap-2 border-t border-slate-100 p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (canSend) mut.mutate(); } }}
          placeholder={t('support.replyPlaceholder', 'Write a reply…')}
          rows={1}
          className="max-h-24 flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
        />
        <button disabled={!canSend} onClick={() => mut.mutate()} className="rounded-lg bg-blue-600 p-2.5 text-white transition hover:bg-blue-700 disabled:opacity-50">
          {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
