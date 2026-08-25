'use client';

import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, ChevronLeft, Send, Loader2, MessageSquare, PenSquare, Search, Phone, Video } from 'lucide-react';
import { toast } from 'sonner';
import { SocketEvents, conversationTitle, type ChatConversation, type ChatMessage, type ChatUserRef } from '@hbcfield/shared/client';
import { canOpenConversationWith } from '@/lib/chat-access';
import { chatApi } from '@/lib/api';
import { useSocketContext } from '@/contexts/socket-context';
import { useAuth } from '@/contexts/auth-context';
import { useTimeFormat } from '@/hooks';

// ── imperative API for the rest of the app (contact "message" buttons) ────────
interface ChatContextValue {
  openMessages: () => void;
  openChatWith: (userId: string) => void;
  /**
   * Can a conversation with this person be opened at all?
   *
   * Ask before rendering a Message button. Chat is between two people, so
   * there is no conversation with yourself and none with nobody — and a button
   * for either is a button that does nothing when pressed. That kept happening
   * because each screen re-derived the rule, or forgot to: the task card
   * offered a member a Message button pointing at themselves, and the employee
   * panel did the same on your own card. One definition, so a screen can ask
   * instead of guess.
   */
  canMessage: (userId?: string | null) => boolean;
  unread: number;
}
const ChatContext = createContext<ChatContextValue>({
  openMessages: () => {},
  openChatWith: () => {},
  canMessage: () => false,
  unread: 0,
});
export function useChat() {
  return useContext(ChatContext);
}

// ── presentation helpers ──────────────────────────────────────────────────────
function initials(u?: ChatUserRef | null) {
  if (!u) return '?';
  return `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase() || '?';
}
function presenceColor(p?: string | null) {
  return p === 'AVAILABLE' ? 'bg-emerald-500' : p === 'BUSY' ? 'bg-rose-500' : p === 'AWAY' ? 'bg-amber-500' : 'bg-muted-foreground/40';
}
function presenceLabel(p: string | null | undefined, t: import('i18next').TFunction) {
  if (p === 'AVAILABLE') return t('chat.presence.active', 'Active now');
  if (p === 'BUSY') return t('chat.presence.busy', 'Busy');
  if (p === 'AWAY') return t('chat.presence.away', 'Away');
  return t('chat.presence.offline', 'Offline');
}
function timeHM(iso: string, lang: string, hour12?: boolean) {
  return new Date(iso).toLocaleTimeString(lang?.startsWith('de') ? 'de-DE' : 'en-US', {
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    ...(hour12 === undefined ? {} : { hour12 }),
  });
}
function relTime(iso: string | null, lang: string) {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return lang?.startsWith('de') ? 'jetzt' : 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(lang?.startsWith('de') ? 'de-DE' : 'en-US', { month: 'short', day: 'numeric' });
}
function dayKey(iso: string) {
  return new Date(iso).toDateString();
}
function dayLabel(iso: string, lang: string, t: import('i18next').TFunction) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t('chat.today', 'Today');
  if (d.toDateString() === yest.toDateString()) return t('chat.yesterday', 'Yesterday');
  return d.toLocaleDateString(lang?.startsWith('de') ? 'de-DE' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function Avatar({ u, size = 40, dot = true }: { u?: ChatUserRef | null; size?: number; dot?: boolean }) {
  // Presence does not cross an organization boundary, so an external person
  // arrives with none. Drawing the grey dot would state they are offline, which
  // is a different claim from "we don't publish this" — show no dot at all.
  const showDot = dot && !u?.isExternal;
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-muted to-muted text-[11px] font-semibold text-muted-foreground"
        style={{ fontSize: size * 0.32 }}
      >
        {u?.avatarUrl ? <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(u)}
      </span>
      {showDot && (
        <span
          className={`absolute bottom-0 right-0 rounded-full ring-2 ring-background ${presenceColor(u?.presence)}`}
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </span>
  );
}

export function MessagesButton() {
  const { openMessages, unread } = useChat();
  const { t } = useTranslation();
  return (
    <button
      onClick={openMessages}
      aria-label={t('chat.title', 'Messages')}
      className="relative flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <MessageSquare className="size-4" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { subscribe, isConnected } = useSocketContext();
  const enabled = !!user?.organizationId;

  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showContacts, setShowContacts] = useState(false);
  // The conversation returned by openDirect — authoritative (correct otherMember)
  // and available immediately, before the list query refetches.
  const [openedConv, setOpenedConv] = useState<ChatConversation | null>(null);

  const { data: conversations } = useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: chatApi.conversations,
    enabled,
    staleTime: 15_000,
  });
  const activeConv =
    (openedConv?.id === activeId ? openedConv : null) ?? conversations?.find((c) => c.id === activeId) ?? null;
  const unread = useMemo(() => (conversations ?? []).reduce((n, c) => n + (c.unread ?? 0), 0), [conversations]);

  // Refs so the socket handler can read live open/active state without re-subscribing.
  const openRef = useRef(open);
  openRef.current = open;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  useEffect(() => {
    if (!enabled || !isConnected) return; // wait for the socket, else subscribe() no-ops
    const off = subscribe<{ conversationId?: string; message?: ChatMessage }>(SocketEvents.CHAT_MESSAGE, (d) => {
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      if (d?.conversationId) qc.invalidateQueries({ queryKey: ['chat', 'thread', d.conversationId] });
      // Toast for an INCOMING message you're not already looking at.
      const msg = d?.message;
      if (!msg || msg.senderId === user?.id) return;
      const viewing = openRef.current && activeIdRef.current === d.conversationId;
      if (viewing) return;
      const name = msg.sender ? `${msg.sender.firstName} ${msg.sender.lastName}`.trim() : t('chat.title', 'Messages');
      toast(name, {
        description: (msg.body ?? '').slice(0, 80),
        action: {
          label: t('chat.open', 'Open'),
          onClick: () => { setOpen(true); setShowContacts(false); setActiveId(d.conversationId ?? null); },
        },
      });
    });
    return () => off();
  }, [enabled, isConnected, subscribe, qc, user?.id, t]);

  const openDM = useMutation({
    mutationFn: (userId: string) => chatApi.openDirect(userId),
    onSuccess: (conv) => {
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      setOpenedConv(conv);
      setActiveId(conv.id);
      setShowContacts(false);
    },
    onError: (err: unknown) => {
      // There was no error branch at all: a failed request left the drawer
      // open on nothing, and once opening showed a spinner, spinning forever.
      //
      // Lead with the server's reason. It distinguishes cases the reader can
      // act on — "not allowed to contact this member" is an access setting,
      // "member not found" means they are not in this organization — and a
      // single generic sentence turned all of them into "it's broken".
      const reason = err instanceof Error && err.message ? err.message : null;
      toast.error(reason || t('chat.couldNotOpen', 'Could not open that conversation'));
      setActiveId(null);
    },
  });

  const openMessages = useCallback(() => {
    setOpen(true);
    setActiveId(null);
    setShowContacts(false);
  }, []);
  const canMessage = useCallback(
    (userId?: string | null) => canOpenConversationWith(userId, user?.id),
    [user?.id],
  );

  const openChatWith = useCallback(
    (userId: string) => {
      if (!canMessage(userId)) {
        // Refusing is right; refusing invisibly is what made three rounds of
        // dead buttons look like nothing was wrong. Callers that ask
        // canMessage() first will never see this.
        toast.error(t('chat.cannotMessageSelf', 'You cannot start a conversation with yourself'));
        return;
      }
      setOpen(true);
      setShowContacts(false);
      openDM.mutate(userId);
    },
    [canMessage, openDM, t],
  );

  return (
    <ChatContext.Provider value={{ openMessages, openChatWith, canMessage, unread }}>
      {children}
      {enabled && open && (
        <>
          <div className="fixed inset-0 z-[55] bg-slate-900/25 backdrop-blur-[2px] animate-in fade-in duration-200" onClick={() => setOpen(false)} />
          <aside className="fixed right-0 top-0 z-[60] flex h-full w-[400px] max-w-[calc(100vw-1rem)] flex-col bg-background shadow-2xl animate-in slide-in-from-right duration-300">
            {/* header */}
            <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
              {(activeId || showContacts) && (
                <button onClick={() => { setActiveId(null); setShowContacts(false); }} className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                  <ChevronLeft className="h-4.5 w-4.5" />
                </button>
              )}
              {activeConv && activeId ? (
                <>
                  <Avatar u={activeConv.otherMember} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-foreground">{conversationTitle(activeConv, i18n.language)}</span>
                      {activeConv.isExternal && (
                        <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                          {t('chat.external', 'External')}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {activeConv.isExternal
                        ? t('chat.externalMember', 'At another organization')
                        : presenceLabel(activeConv.otherMember?.presence, t)}
                    </div>
                  </div>
                  {/* Voice / video call — wired in Phase 2 (LiveKit). */}
                  <button
                    onClick={() => toast(t('chat.callsSoon', 'Calls are coming soon'))}
                    title={t('chat.voiceCall', 'Voice call')}
                    className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Phone className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => toast(t('chat.callsSoon', 'Calls are coming soon'))}
                    title={t('chat.videoCall', 'Video call')}
                    className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Video className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <div className="flex-1 px-1 text-[15px] font-semibold text-foreground">
                  {showContacts
                    ? t('chat.newMessage', 'New message')
                    : openDM.isPending
                      ? t('chat.opening', 'Opening…')
                      : t('chat.title', 'Messages')}
                </div>
              )}
              {!activeId && !showContacts && !openDM.isPending && (
                <button onClick={() => setShowContacts(true)} className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-blue-600" title={t('chat.newMessage', 'New message')}>
                  <PenSquare className="h-4.5 w-4.5" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {showContacts ? (
              <ContactsPicker onPick={(uid) => openChatWith(uid)} picking={openDM.isPending} />
            ) : activeId && activeConv ? (
              <Thread conversation={activeConv} meId={user!.id} />
            ) : openDM.isPending ? (
              /*
                Opening a specific conversation takes a round trip, and until it
                answered, this fell through to the full conversation list. Ask
                to message one person and you got everyone you have ever spoken
                to, then the thread you asked for a moment later. Wait here
                instead — the drawer is going somewhere specific and should look
                like it.
              */
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ConversationList conversations={conversations} onOpen={setActiveId} onNew={() => setShowContacts(true)} />
            )}
          </aside>
        </>
      )}
    </ChatContext.Provider>
  );
}

function ConversationList({
  conversations,
  onOpen,
  onNew,
}: {
  conversations?: ChatConversation[];
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const { t, i18n } = useTranslation();
  const loading = conversations === undefined;
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-1 p-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2.5">
                <div className="size-10 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                  <div className="h-2.5 w-2/3 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length > 0 ? (
          <div className="p-1.5">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => onOpen(c.id)}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-accent"
              >
                <Avatar u={c.otherMember} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={`truncate text-sm ${c.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground'}`}>
                        {conversationTitle(c, i18n.language)}
                      </span>
                      {c.isExternal && (
                        <span className="shrink-0 rounded bg-amber-100 px-1 py-px text-[9px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                          {t('chat.external', 'External')}
                        </span>
                      )}
                      {c.isClosed && (
                        <span className="shrink-0 rounded bg-muted px-1 py-px text-[9px] font-medium text-muted-foreground">
                          {t('chat.closed', 'Closed')}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{relTime(c.lastMessageAt, i18n.language)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className={`truncate text-[13px] ${c.unread ? 'font-medium text-muted-foreground' : 'text-muted-foreground'}`}>
                      {c.lastMessage?.body ?? t('chat.noMessages', 'No messages yet')}
                    </span>
                    {!!c.unread && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">
                        {c.unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
              <MessageSquare className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">{t('chat.empty', 'No conversations yet.')}</p>
          </div>
        )}
      </div>
      <div className="border-t border-border p-3">
        <button onClick={onNew} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700">
          {t('chat.newMessage', 'New message')}
        </button>
      </div>
    </div>
  );
}

function ContactsPicker({ onPick, picking }: { onPick: (userId: string) => void; picking: boolean }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const { data: contacts, isLoading } = useQuery({ queryKey: ['chat', 'contacts'], queryFn: chatApi.contacts });
  const filtered = (contacts ?? []).filter((u) => `${u.firstName} ${u.lastName}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('chat.searchContacts', 'Search people…')}
            className="w-full rounded-full border border-border bg-muted py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-blue-400 focus:bg-background"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
        ) : filtered.length ? (
          filtered.map((u) => (
            <button
              key={u.id}
              disabled={picking}
              onClick={() => onPick(u.id)}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-accent disabled:opacity-50"
            >
              <Avatar u={u} size={38} />
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-foreground">{u.firstName} {u.lastName}</span>
                  {/*
                    The most important place for this marker, and the one it was
                    missing from: this is where you PICK who to talk to. Without
                    it someone at another company is indistinguishable from a
                    colleague at the moment the choice is made.
                  */}
                  {u.isExternal && (
                    <span className="shrink-0 rounded bg-amber-100 px-1 py-px text-[9px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                      {t('chat.external', 'External')}
                    </span>
                  )}
                </span>
                {u.position && <span className="block truncate text-xs text-muted-foreground">{u.position}</span>}
              </span>
            </button>
          ))
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('chat.noContacts', 'No one to message.')}</p>
        )}
      </div>
    </div>
  );
}

function Thread({ conversation, meId }: { conversation: ChatConversation; meId: string }) {
  const { t, i18n } = useTranslation();
  const { hour12 } = useTimeFormat();
  const qc = useQueryClient();
  const { subscribe, emit, isConnected } = useSocketContext();
  const [text, setText] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const typingSentRef = useRef(0);
  const conversationId = conversation.id;
  const recipientIds = (conversation.members ?? []).map((m) => m.id).filter((id) => id !== meId);

  const { data } = useQuery({
    queryKey: ['chat', 'thread', conversationId],
    queryFn: () => chatApi.history(conversationId),
  });
  const messages = data?.data ?? [];

  // Mark read on open + on new messages.
  useEffect(() => {
    chatApi.markRead(conversationId).then(() => qc.invalidateQueries({ queryKey: ['chat', 'conversations'] })).catch(() => {});
  }, [conversationId, messages.length, qc]);

  // A message from the peer means they've stopped typing — clear it immediately
  // (don't wait out the typing timeout, which leaves the dots lingering).
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last && last.senderId !== meId) setPeerTyping(false);
  }, [messages.length, meId]);

  // Auto-scroll to bottom on new messages / typing.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, peerTyping]);

  // Typing indicator from the peer.
  const typingTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isConnected) return;
    const off = subscribe<{ conversationId?: string; from?: string }>(SocketEvents.CHAT_TYPING, (d) => {
      if (d?.conversationId !== conversationId || d?.from === meId) return;
      setPeerTyping(true);
      // The timer lives in a ref, not stapled onto the unsubscribe function.
      // `(off as any)._tt = …` worked, but it hid a piece of state on a value
      // whose only job is to be called once.
      window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => setPeerTyping(false), 3500);
    });
    return () => {
      off();
      window.clearTimeout(typingTimer.current);
    };
  }, [isConnected, subscribe, conversationId, meId]);

  const onType = (v: string) => {
    setText(v);
    const ta = taRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`; }
    const now = Date.now();
    if (now - typingSentRef.current > 2000) {
      typingSentRef.current = now;
      emit('chat_typing', { conversationId, recipientIds, from: meId });
    }
  };

  // Body is passed as the mutate ARGUMENT (not read from `text`) so clearing the
  // input in onMutate can't blank the outgoing message.
  const mut = useMutation({
    mutationFn: (body: string) => chatApi.send(conversationId, body),
    onMutate: async (body: string) => {
      setText('');
      if (taRef.current) taRef.current.style.height = 'auto';
      await qc.cancelQueries({ queryKey: ['chat', 'thread', conversationId] });
      const prev = qc.getQueryData<{ data: ChatMessage[]; hasMore: boolean }>(['chat', 'thread', conversationId]);
      const optimistic: ChatMessage = {
        id: `tmp-${Date.now()}`, conversationId, senderId: meId, body, attachments: [],
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData(['chat', 'thread', conversationId], { data: [...(prev?.data ?? []), optimistic], hasMore: prev?.hasMore ?? false });
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['chat', 'thread', conversationId], ctx.prev); },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['chat', 'thread', conversationId] });
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    },
  });
  const send = () => { const b = text.trim(); if (b && !mut.isPending) mut.mutate(b); };
  const canSend = text.trim().length > 0 && !mut.isPending;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-muted/20">
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const mine = m.senderId === meId;
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          const grouped = prev && !newDay && prev.senderId === m.senderId
            && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60000;
          const next = messages[i + 1];
          const isLastOfGroup = !next || next.senderId !== m.senderId || dayKey(next.createdAt) !== dayKey(m.createdAt);
          const pending = m.id.startsWith('tmp-');
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 flex items-center justify-center">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                    {dayLabel(m.createdAt, i18n.language, t)}
                  </span>
                </div>
              )}
              <div className={`flex items-end gap-2 ${grouped ? 'mt-0.5' : 'mt-2.5'} ${mine ? 'justify-end' : 'justify-start'}`}>
                {!mine && (
                  <span className="w-7 shrink-0">
                    {isLastOfGroup ? <Avatar u={conversation.otherMember} size={28} dot={false} /> : null}
                  </span>
                )}
                <div className={`flex min-w-0 max-w-[74%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`whitespace-pre-wrap [overflow-wrap:anywhere] px-3 py-2 text-[13.5px] leading-snug shadow-sm ${
                      mine
                        ? `bg-blue-600 text-white ${isLastOfGroup ? 'rounded-2xl rounded-br-md' : 'rounded-2xl'} ${pending ? 'opacity-70' : ''}`
                        : `bg-muted text-foreground ${isLastOfGroup ? 'rounded-2xl rounded-bl-md' : 'rounded-2xl'}`
                    }`}
                  >
                    {m.body}
                  </div>
                  {isLastOfGroup && (
                    <span className="mt-1 px-1 text-[10px] text-muted-foreground">{timeHM(m.createdAt, i18n.language, hour12)}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer: typing indicator pinned just above the composer (always visible). */}
      {peerTyping && (
        <div className="flex items-center gap-2 bg-background px-3 pt-1.5">
          <div className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1.5">
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
          </div>
          <span className="text-[11px] text-muted-foreground">
            {conversation.otherMember?.firstName} {t('chat.typing', 'is typing…')}
          </span>
        </div>
      )}

      {mut.isError && <p className="px-3 pb-1 text-xs text-red-500">{(mut.error as Error).message}</p>}

      {conversation.isClosed ? (
        /*
          The shared space that held this conversation open is gone, so the
          server will refuse anything typed here. Say that up front instead of
          letting someone write a message and then bounce it — and leave the
          history in place above, because it is closed, not deleted.
        */
        <div className="border-t border-border bg-muted/40 px-3.5 py-3">
          <p className="text-center text-xs text-muted-foreground">
            {t(
              'chat.conversationClosed',
              'This workspace is no longer shared, so this conversation is closed. You can still read what was said.',
            )}
          </p>
        </div>
      ) : (
        <div className="flex items-end gap-2 border-t border-border bg-background p-2.5">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={t('chat.messagePlaceholder', 'Write a message…')}
            rows={1}
            className="max-h-24 flex-1 resize-none rounded-2xl border border-border bg-muted px-3.5 py-2 text-[13.5px] outline-none transition-colors focus:border-blue-400 focus:bg-background"
          />
          <button
            disabled={!canSend}
            onClick={send}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
