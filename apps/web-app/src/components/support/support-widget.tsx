'use client';

import { useEffect, useRef, useState } from 'react';
import type { SupportMessage } from "@hbcfield/shared/client"
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Headset, ChevronLeft, Circle } from 'lucide-react';
import { SocketEvents } from '@hbcfield/shared/client';
import { supportApi } from '@/lib/api';
import { useSocketContext } from '@/contexts/socket-context';
import { useAuth } from '@/contexts/auth-context';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { CountDot, TopBarButton } from '@/components/app-shell/top-bar-icon';
import { keys } from "@/lib/query-keys"
import { useAfterFirstLoad } from "@/hooks/use-after-first-load"
import { SlaLine, TicketList, NewTicket, Thread } from "./ticket-list";

/**
 * Tier-aware support entry point in the top navbar. Everyone can open tickets;
 * Business+ sees a live-chat availability indicator (config.liveChat + an online
 * agent). Updates in real time off the shared Socket.IO connection — no polling.
 */
export function SupportButton() {
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
  // The launcher and its unread badge wait for the page to load; opening the
  // widget asks at once.
  const afterFirstLoad = useAfterFirstLoad(1);
  const readNow = enabled && (afterFirstLoad || open);

  const { data: config } = useQuery({
    queryKey: keys.support.config(),
    queryFn: supportApi.getConfig,
    enabled: readNow,
    staleTime: 5 * 60 * 1000,
  });

  const { data: tickets, isLoading: ticketsLoading } = useQuery({
    queryKey: keys.support.tickets(),
    queryFn: () => supportApi.list(),
    enabled: readNow, // fetch even while closed so the launcher can show an unread badge
  });

  // Total unread agent replies across the customer's tickets (drives the badge).
  const unreadTotal = (tickets?.data ?? []).reduce((n, tk) => n + (tk.unreadForCustomer ?? 0), 0);

  const { data: active } = useQuery({
    queryKey: keys.support.ticket(activeId),
    queryFn: () => supportApi.get(activeId as string),
    enabled: !!activeId,
  });

  // Real-time: refresh list + open thread when a support event lands.
  useEffect(() => {
    if (!enabled) return;
    const offs = [
      subscribe<{ ticketId?: string; message?: SupportMessage }>(SocketEvents.SUPPORT_MESSAGE, (d) => {
        qc.invalidateQueries({ queryKey: keys.support.tickets() });
        if (d?.ticketId) qc.invalidateQueries({ queryKey: keys.support.ticket(d.ticketId) });
      }),
      subscribe(SocketEvents.SUPPORT_TICKET_UPDATED, () => {
        qc.invalidateQueries({ queryKey: keys.support.tickets() });
        if (activeId) qc.invalidateQueries({ queryKey: keys.support.ticket(activeId) });
      }),
      subscribe<{ online?: boolean }>(SocketEvents.SUPPORT_AGENT_PRESENCE, (d) => setAgentOnline(!!d?.online)),
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
      .then(() => qc.invalidateQueries({ queryKey: keys.support.tickets() }))
      .catch(() => {});
  }, [activeId, msgLen, qc]);

  const liveChat = !!config?.liveChat && agentOnline;

  if (!enabled) return null;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setActiveId(null); setComposing(false); } }}>
      <PopoverTrigger asChild>
        <TopBarButton on={open} data-tour="nav-support" title={t('support.title', 'Support')} aria-label={t('support.title', 'Support')}>
          <Headset />
          <CountDot n={unreadTotal} tone="crit" />
        </TopBarButton>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={"flex h-[560px] max-h-[80vh] w-[380px] max-w-[calc(100vw-2rem)] flex-col " +
          "overflow-hidden rounded-xl border-border p-0 shadow-xl"}>
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
          {(activeId || composing) && (
            <button onClick={() => { setActiveId(null); setComposing(false); }} className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex-1">
            <div className="text-sm font-semibold text-foreground">{t('support.title', 'Support')}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {config?.liveChat ? (
                <>
                  <Circle className={`h-2 w-2 ${agentOnline ? 'fill-green-500 text-green-500' : 'fill-slate-300 text-muted-foreground'}`} />
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
      </PopoverContent>
    </Popover>
  );
}
