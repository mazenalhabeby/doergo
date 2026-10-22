import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SocketEvents, type SupportTicket } from '@hbcfield/shared/client';
import { appendMessage, debounce, isPlaceable } from '../chat/live-thread';
import { useAppResume } from '../../lib/app-resume';
import { useTheme } from '../../contexts/theme-context';
import { useSocketContext } from '../../contexts/socket-context';
import { goBack as leaveScreen } from '../../components';
import { supportApi, type SupportConfig } from '../../lib/api';
import { SPACING } from '../../lib/constants';
import { useQueuedCreate } from '../../offline/actions/queued-create';

export type SupportView = 'list' | 'new' | 'thread';

/** `support.message`: a message on a ticket, with the ticket's new status when it moved. */
type SupportMessageEvent = { ticketId?: string; message?: unknown; ticket?: { status?: SupportTicket['status'] } } | null;

/** SupportScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useSupportScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { subscribe, isAuthenticated } = useSocketContext();
  const params = useLocalSearchParams<{ ticketId?: string }>();
  const insets = useSafeAreaInsets();
  // Keep the bottom action clear of the Android nav bar / home indicator.
  const bottomPad = Math.max(insets.bottom, SPACING.sm);

  const [view, setView] = useState<SupportView>('list');
  const [config, setConfig] = useState<SupportConfig | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [active, setActive] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentOnline, setAgentOnline] = useState(false);

  // New ticket
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Requests and replies written with no signal wait in the outbox and show here meanwhile.
  const ticketCreate = useQueuedCreate<{ subject: string; body: string }>('support.ticket', {
    onAccepted: () => void loadListRef.current?.(),
  });
  const replyCreate = useQueuedCreate<{ body: string }>('support.message', {
    onAccepted: () => {
      const open = activeRef.current;
      if (open) void supportApi.get(open.id).then(setActive).catch(() => undefined);
    },
  });
  const loadListRef = useRef<(() => Promise<void>) | null>(null);

  const liveChat = !!config?.liveChat;

  const loadList = useCallback(async () => {
    // Settle independently — a hiccup on one call shouldn't blank the whole screen.
    const [cfgR, listR] = await Promise.allSettled([supportApi.getConfig(), supportApi.list()]);
    if (cfgR.status === 'fulfilled') setConfig(cfgR.value);
    // `list` resolves to the array itself — the client already unwrapped
    // the envelope. Guarded anyway: a screen must not crash on a bad payload.
    if (listR.status === 'fulfilled') setTickets(listR.value ?? []);
    // Only surface an error if BOTH failed (a real connectivity problem).
    setError(cfgR.status === 'rejected' && listR.status === 'rejected'
      ? t('support.loadError', 'Could not load support. Check your connection.')
      : null);
    setLoading(false);
  }, [t]);

  const openTicket = useCallback(async (id: string) => {
    try {
      const tk = await supportApi.get(id);
      setActive(tk);
      setView('thread');
      setError(null);
      supportApi.markRead(id).catch(() => {});
    } catch {
      setError(t('support.loadError', 'Could not load support. Check your connection.'));
    }
  }, [t]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Deep-link from a push tap (?ticketId=…)
  useEffect(() => {
    if (params.ticketId) openTicket(String(params.ticketId));
  }, [params.ticketId, openTicket]);

  // Real-time refresh. Reads the open ticket via a ref so a new message doesn't
  // re-subscribe the listeners on every render.
  const activeRef = useRef(active);
  activeRef.current = active;
  loadListRef.current = loadList;

  const shownTickets = useMemo(() => {
    const known = new Set(tickets.map((tk) => tk.id));
    const onPhone = ticketCreate.pending
      .filter((p) => !known.has(p.id))
      .map((p) => ({ id: p.id, subject: p.body.subject, status: 'OPEN', pendingSync: true }) as unknown as SupportTicket);
    return [...onPhone, ...tickets];
  }, [tickets, ticketCreate.pending]);

  const shownMessages = useMemo(() => {
    if (!active) return [];
    const server = active.messages ?? [];
    const known = new Set(server.map((m) => m.id));
    const onPhone = replyCreate.pending
      .filter((p) => p.params.ticketId === active.id && !known.has(p.id))
      .map((p) => ({ id: p.id, authorType: 'CUSTOMER', body: p.body.body, pendingSync: true }) as unknown as NonNullable<SupportTicket['messages']>[number]);
    return [...server, ...onPhone];
  }, [active, replyCreate.pending]);
  /*
    ⚠️ A MESSAGE ON THE SOCKET IS ADDED, NOT RELOADED (chat/live-thread.ts).
    One reply used to cost the config, the ticket list and the whole ticket —
    and again for the ticket-updated event that follows every reply. The open
    ticket now takes the message from the payload; the list (status, unread)
    reloads once per burst, without the config; the ticket itself only when
    the payload cannot be placed.
  */
  const later = useRef<{ list: ReturnType<typeof debounce>; ticket: ReturnType<typeof debounce> } | null>(null);
  if (!later.current) {
    later.current = {
      list: debounce(() => {
        void supportApi.list().then((l) => setTickets(l ?? [])).catch(() => undefined);
      }, 1000),
      ticket: debounce(() => {
        const open = activeRef.current;
        if (open) void supportApi.get(open.id).then((tk) => { if (activeRef.current?.id === tk.id) setActive(tk); }).catch(() => undefined);
      }, 1000),
    };
  }
  useEffect(() => () => { later.current?.list.cancel(); later.current?.ticket.cancel(); }, []);
  // The socket is closed in the background: catch up on the app's one throttled resume.
  useAppResume(() => {
    later.current!.list.call();
    if (activeRef.current) later.current!.ticket.call();
  });

  const reversedMessages = useMemo(() => [...shownMessages].reverse(), [shownMessages]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const offs = [
      subscribe(SocketEvents.SUPPORT_MESSAGE, (d: SupportMessageEvent) => {
        later.current!.list.call();
        const open = activeRef.current;
        if (!open || d?.ticketId !== open.id) return;
        const msg = d?.message;
        if (isPlaceable(msg) && !(msg as { isInternalNote?: boolean }).isInternalNote) {
          setActive((cur) => (cur && cur.id === open.id
            ? {
                ...cur,
                status: d?.ticket?.status ?? cur.status,
                messages: appendMessage(cur.messages ?? [], msg as NonNullable<SupportTicket['messages']>[number]),
              }
            : cur));
        } else if (!isPlaceable(msg)) {
          later.current!.ticket.call();
        }
      }),
      subscribe(SocketEvents.SUPPORT_TICKET_UPDATED, () => later.current!.list.call()),
      subscribe(SocketEvents.SUPPORT_AGENT_PRESENCE, (d: { online?: boolean } | null) => setAgentOnline(!!d?.online)),
    ];
    return () => offs.forEach((o) => o());
  }, [isAuthenticated, subscribe]);

  const submitNew = async () => {
    if (subject.trim().length < 2 || body.trim().length < 1) return;
    setSending(true);
    try {
      const input = { subject: subject.trim(), body: body.trim(), channel: 'MOBILE' };
      const outcome = await ticketCreate.run({ lane: 'support:new', body: input }, () =>
        supportApi.create({ subject: input.subject, body: input.body }),
      );
      if (outcome.kind === 'refused') {
        setError(
          (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) ||
            outcome.message ||
            t('support.sendError', 'Could not send. Please try again.'),
        );
        return;
      }
      setSubject('');
      setBody('');
      setError(null);
      if (outcome.kind === 'queued') {
        // Not with support yet: back to the list, where it waits as "sending".
        setView('list');
        return;
      }
      await loadList();
      openTicket((outcome.response as { id: string }).id);
    } catch {
      setError(t('support.sendError', 'Could not send. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  const submitReply = async () => {
    if (!active || !reply.trim()) return;
    setSending(true);
    try {
      const text = reply.trim();
      const outcome = await replyCreate.run(
        { lane: `support:${active.id}`, params: { ticketId: active.id }, body: { body: text } },
        () => supportApi.reply(active.id, text),
      );
      if (outcome.kind === 'refused') {
        setError(
          (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) ||
            outcome.message ||
            t('support.sendError', 'Could not send. Please try again.'),
        );
        return;
      }
      setReply('');
      setError(null);
      // Delivered: the server's copy goes into the thread (the socket's echo is the same id).
      if (outcome.kind === 'done') {
        const sent = outcome.response;
        if (isPlaceable(sent)) setActive((cur) => (cur && cur.id === active.id ? { ...cur, messages: appendMessage(cur.messages ?? [], sent as NonNullable<SupportTicket['messages']>[number]) } : cur));
        else setActive(await supportApi.get(active.id));
      }
    } catch {
      setError(t('support.sendError', 'Could not send. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  /*
    Out of the screen, or back a step inside it.

    ⚠️ The chevron used to exist ONLY on the `new` and `thread` views, where it
    meant "back to the list". On the list itself it was an empty 36px spacer —
    so arriving here from the home screen left no way out at all: this is a
    pushed Stack screen (`headerShown: false`), so there is no navigator header
    and no tab bar either. The iOS swipe-back gesture was the only exit, and
    nothing on screen said so.

    `canGoBack()` because Support is also reachable from a push notification
    (see (app)/_layout.tsx), which can open it with no history behind it — the
    same guard chat.tsx already uses.
  */
  const goBack = () => {
    if (view !== 'list') { setView('list'); return; }
    leaveScreen();
  };

  const headerTitle =
    view === 'new' ? t('support.newTicket', 'New request') : view === 'thread' ? active?.subject || t('support.title', 'Support') : t('support.title', 'Support');

  return {
    t,
    colors,
    insets,
    bottomPad,
    view,
    setView,
    config,
    loading,
    agentOnline,
    subject,
    setSubject,
    body,
    setBody,
    reply,
    setReply,
    sending,
    error,
    liveChat,
    openTicket,
    shownTickets,
    reversedMessages,
    submitNew,
    submitReply,
    goBack,
    headerTitle,
  };
}
