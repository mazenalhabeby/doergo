'use client';

import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, ChevronLeft, Send, Loader2, MessageSquare, PenSquare, Search } from 'lucide-react';
import { SocketEvents, conversationTitle, type ChatConversation, type ChatUserRef } from '@hbcfield/shared/client';
import { chatApi } from '@/lib/api';
import { useSocketContext } from '@/contexts/socket-context';
import { useAuth } from '@/contexts/auth-context';

// ── imperative API for the rest of the app (contact "message" buttons) ────────
interface ChatContextValue {
  openMessages: () => void;
  openChatWith: (userId: string) => void;
  unread: number;
}
const ChatContext = createContext<ChatContextValue>({ openMessages: () => {}, openChatWith: () => {}, unread: 0 });
export function useChat() {
  return useContext(ChatContext);
}

function initials(u?: ChatUserRef | null) {
  if (!u) return '?';
  return `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

/** Navbar entry point — a Messages icon with an unread badge. */
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
  const { subscribe } = useSocketContext();
  const enabled = !!user?.organizationId;

  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showContacts, setShowContacts] = useState(false);

  const { data: conversations } = useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: chatApi.conversations,
    enabled,
    staleTime: 15_000,
  });

  const unread = useMemo(() => (conversations ?? []).reduce((n, c) => n + (c.unread ?? 0), 0), [conversations]);

  // Real-time: a new message refreshes the list + the open thread.
  useEffect(() => {
    if (!enabled) return;
    const off = subscribe(SocketEvents.CHAT_MESSAGE, (d: any) => {
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      if (d?.conversationId) qc.invalidateQueries({ queryKey: ['chat', 'thread', d.conversationId] });
    });
    return () => off();
  }, [enabled, subscribe, qc]);

  const openDM = useMutation({
    mutationFn: (userId: string) => chatApi.openDirect(userId),
    onSuccess: (conv) => {
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      setActiveId(conv.id);
      setShowContacts(false);
    },
  });

  const openMessages = useCallback(() => {
    setOpen(true);
    setActiveId(null);
    setShowContacts(false);
  }, []);
  const openChatWith = useCallback(
    (userId: string) => {
      setOpen(true);
      setShowContacts(false);
      openDM.mutate(userId);
    },
    [openDM],
  );

  return (
    <ChatContext.Provider value={{ openMessages, openChatWith, unread }}>
      {children}
      {enabled && open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
          <aside className="fixed right-0 top-0 z-40 flex h-full w-[400px] max-w-[calc(100vw-1rem)] flex-col border-l border-slate-200 bg-white shadow-2xl">
            {/* header */}
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              {(activeId || showContacts) && (
                <button onClick={() => { setActiveId(null); setShowContacts(false); }} className="text-slate-400 hover:text-slate-700">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <div className="flex-1 text-sm font-semibold text-slate-800">
                {activeId
                  ? conversationTitle(conversations?.find((c) => c.id === activeId) as ChatConversation, i18n.language)
                  : showContacts
                    ? t('chat.newMessage', 'New message')
                    : t('chat.title', 'Messages')}
              </div>
              {!activeId && !showContacts && (
                <button onClick={() => setShowContacts(true)} className="text-slate-400 hover:text-blue-600" title={t('chat.newMessage', 'New message')}>
                  <PenSquare className="h-4.5 w-4.5" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {showContacts ? (
              <ContactsPicker onPick={(uid) => openChatWith(uid)} picking={openDM.isPending} />
            ) : activeId ? (
              <Thread conversationId={activeId} meId={user!.id} />
            ) : (
              <ConversationList
                conversations={conversations}
                meId={user!.id}
                onOpen={setActiveId}
                onNew={() => setShowContacts(true)}
              />
            )}
          </aside>
        </>
      )}
    </ChatContext.Provider>
  );
}

function ConversationList({
  conversations,
  meId,
  onOpen,
  onNew,
}: {
  conversations?: ChatConversation[];
  meId: string;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {conversations && conversations.length > 0 ? (
          conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpen(c.id)}
              className="flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                {c.otherMember?.avatarUrl ? <img src={c.otherMember.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(c.otherMember)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">{conversationTitle(c, i18n.language)}</span>
                <span className="block truncate text-xs text-slate-400">{c.lastMessage?.body ?? t('chat.noMessages', 'No messages yet')}</span>
              </span>
              {!!c.unread && <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">{c.unread}</span>}
            </button>
          ))
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <MessageSquare className="h-8 w-8 text-slate-200" />
            <p className="text-sm text-slate-400">{t('chat.empty', 'No conversations yet.')}</p>
          </div>
        )}
      </div>
      <div className="border-t border-slate-100 p-3">
        <button onClick={onNew} className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700">
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
      <div className="border-b border-slate-100 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('chat.searchContacts', 'Search people…')}
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
        ) : filtered.length ? (
          filtered.map((u) => (
            <button
              key={u.id}
              disabled={picking}
              onClick={() => onPick(u.id)}
              className="flex w-full items-center gap-3 border-b border-slate-50 px-4 py-2.5 text-left hover:bg-slate-50 disabled:opacity-50"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                {u.avatarUrl ? <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(u)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800">{u.firstName} {u.lastName}</span>
                {u.position && <span className="block truncate text-xs text-slate-400">{u.position}</span>}
              </span>
            </button>
          ))
        ) : (
          <p className="py-10 text-center text-sm text-slate-400">{t('chat.noContacts', 'No one to message.')}</p>
        )}
      </div>
    </div>
  );
}

function Thread({ conversationId, meId }: { conversationId: string; meId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data } = useQuery({
    queryKey: ['chat', 'thread', conversationId],
    queryFn: () => chatApi.history(conversationId),
  });
  const messages = data?.data ?? [];

  useEffect(() => {
    chatApi.markRead(conversationId).then(() => qc.invalidateQueries({ queryKey: ['chat', 'conversations'] })).catch(() => {});
  }, [conversationId, messages.length, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const mut = useMutation({
    mutationFn: () => chatApi.send(conversationId, text.trim()),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['chat', 'thread', conversationId] });
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    },
  });
  const canSend = text.trim().length > 0 && !mut.isPending;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.map((m) => {
          const mine = m.senderId === meId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
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
          placeholder={t('chat.messagePlaceholder', 'Write a message…')}
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
