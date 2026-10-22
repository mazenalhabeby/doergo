import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SocketEvents,
  appendMessage,
  applyRead,
  historyCursor,
  replaceMessage,
  type ChatAttachment,
  type ChatConversation,
  type ChatMessage,
  type ChatMessageEvent,
  type ChatMessageChangedEvent,
  type ChatReadEvent,
  type ChatConversationUpdatedEvent,
  type ChatTypingEvent,
} from '@hbcfield/shared/client';
import { useSocketContext } from '@/contexts/socket-context';
import { chatApi } from '@/lib/api';
import { activeChat } from '@/lib/active-chat';
import { markConversationRead } from '@/lib/chat-badge';
import { useAppResume } from '@/lib/app-resume';
import { useOffline } from '@/offline/offline-context';
import { useQueuedCreate } from '@/offline/actions/queued-create';
import { debounce, isPlaceable } from './live-thread';

export type ShownMessage = ChatMessage & { pendingSync?: boolean };

/**
 * One open conversation on the phone.
 *
 * Opens from the phone's OWN copy at once (the chat_messages pull scope), then
 * the server's newest page replaces it. Older pages load as the reader scrolls
 * up. A message on the socket is put in place (never a reload); an edit,
 * a removal or somebody reading arrives the same way. While it is open the
 * server pushes nothing about it to this person (`chat_view`).
 */
export function useChatThread(
  meId: string | undefined,
  onError: (text: string) => void,
  onRemoved?: () => void,
  focused = true,
) {
  const { subscribe, isAuthenticated, emit } = useSocketContext();
  const { records } = useOffline();
  const [active, setActive] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const activeRef = useRef<ChatConversation | null>(null);
  activeRef.current = active;
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removedRef = useRef(onRemoved);
  removedRef.current = onRemoved;

  /*
    ⚠️ "OPEN" MEANS ON SCREEN, not mounted. The conversation is a TAB screen,
    and a tab stays mounted after you leave it — so a thread left behind kept
    counting as open: every new message in it was marked read at once (the
    badge never rose), no in-app toast, and the server suppressed its push.
  */
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const viewing = focused && !!active;

  // On screen: no toast, no push for it.
  useEffect(() => {
    if (!viewing || !active) return;
    activeChat.conversationId = active.id;
    emit('chat_view', { conversationId: active.id });
    return () => {
      activeChat.conversationId = null;
      emit('chat_view', { conversationId: null });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing, active?.id, emit]);

  const later = useRef<{ thread: ReturnType<typeof debounce>; read: ReturnType<typeof debounce> } | null>(null);
  if (!later.current) {
    later.current = {
      thread: debounce(() => {
        const open = activeRef.current;
        if (open)
          void chatApi
            .history(open.id)
            .then((h) => {
              if (activeRef.current?.id === open.id) {
                setMessages(h.data);
                setHasMore(h.hasMore);
              }
            })
            .catch(() => undefined);
      }, 1000),
      read: debounce(() => {
        const open = activeRef.current;
        if (open) void markConversationRead(open.id);
      }, 1000),
    };
  }
  useEffect(
    () => () => {
      later.current?.thread.cancel();
      later.current?.read.flush();
    },
    [],
  );

  const open = useCallback(
    async (conv: ChatConversation) => {
      setActive(conv);
      // The phone's copy first — a conversation opens with no signal and no wait.
      const kept = records ? await records.listByParent<ChatMessage>('chat_messages', conv.id).catch(() => []) : [];
      setMessages(
        kept
          .map((r) => r.data)
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
          .slice(-50),
      );
      try {
        const h = await chatApi.history(conv.id);
        setMessages(h.data);
        setHasMore(h.hasMore);
        // Always: the answer is the true unread total, so opening any thread corrects the badge.
        void markConversationRead(conv.id);
      } catch {
        if (!kept.length) onError('load');
      }
    },
    [records, meId, onError],
  );

  const loadOlder = useCallback(async () => {
    const conv = activeRef.current;
    if (!conv || !hasMore || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await chatApi.history(conv.id, historyCursor(messages[0]));
      setMessages((m) => [...page.data.filter((x) => !m.some((o) => o.id === x.id)), ...m]);
      setHasMore(page.hasMore);
    } catch {
      /* offline: the older pages wait */
    } finally {
      setLoadingOlder(false);
    }
  }, [hasMore, loadingOlder, messages]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const mine = (id?: string) => !!activeRef.current && id === activeRef.current.id;
    const offs = [
      subscribe(SocketEvents.CHAT_MESSAGE, (d: ChatMessageEvent) => {
        if (!mine(d?.conversationId ?? d?.message?.conversationId)) return;
        setPeerTyping(false);
        if (isPlaceable(d?.message)) setMessages((m) => appendMessage(m, d.message as ChatMessage));
        else later.current!.thread.call();
        // Read only while it is on screen; a thread left behind in its tab reads nothing.
        if (d?.message?.senderId !== meId && focusedRef.current) later.current!.read.call();
      }),
      subscribe(SocketEvents.CHAT_MESSAGE_CHANGED, (d: ChatMessageChangedEvent) => {
        if (mine(d?.conversationId) && d?.message?.id) setMessages((m) => replaceMessage(m, d.message));
      }),
      subscribe(SocketEvents.CHAT_READ, (d: ChatReadEvent) => {
        if (mine(d?.conversationId)) setActive((c) => (c ? applyRead([c], d, meId)[0]! : c));
      }),
      // A group changed or a job's crew moved: the open conversation takes its new members and name;
      // taken out of it, the screen leaves.
      subscribe(SocketEvents.CHAT_CONVERSATION_UPDATED, (d: ChatConversationUpdatedEvent) => {
        if (!mine(d?.conversationId)) return;
        if (d?.removed) {
          setActive(null);
          removedRef.current?.();
          return;
        }
        void chatApi
          .conversations()
          .then((list) => {
            const fresh = list.find((x) => x.id === d.conversationId);
            if (fresh && activeRef.current?.id === fresh.id) setActive(fresh);
          })
          .catch(() => undefined);
      }),
      subscribe(SocketEvents.CHAT_TYPING, (d: ChatTypingEvent) => {
        if (!mine(d?.conversationId) || d?.from === meId) return;
        setPeerTyping(true);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setPeerTyping(false), 3500);
      }),
    ];
    return () => offs.forEach((o) => o());
  }, [isAuthenticated, subscribe, meId]);

  useAppResume(() => {
    if (activeRef.current) later.current!.thread.call();
  });
  // Back on screen with a thread open: what arrived meanwhile is read now.
  const wasFocused = useRef(focused);
  useEffect(() => {
    if (focused && !wasFocused.current && activeRef.current) {
      later.current!.thread.call();
      later.current!.read.call();
    }
    wasFocused.current = focused;
  }, [focused]);
  // Re-authenticated after a gap (server restart, lost signal): messages sent meanwhile never reached
  // this socket — read the open thread again, once. The first authentication is the open itself.
  const wasAuthed = useRef(isAuthenticated);
  useEffect(() => {
    if (isAuthenticated && !wasAuthed.current && activeRef.current) {
      later.current!.thread.call();
      later.current!.read.call();
    }
    wasAuthed.current = isAuthenticated;
  }, [isAuthenticated]);

  // Words go through the outbox (sent later with no signal); photos need the network.
  const chatCreate = useQueuedCreate<{ body: string; sentAt: string }>('chat.send', {
    onAccepted: () => later.current!.thread.call(),
  });
  const shown: ShownMessage[] = useMemo(() => {
    if (!active) return messages;
    const known = new Set(messages.map((m) => m.id));
    const onPhone = chatCreate.pending
      .filter((p) => p.params.conversationId === active.id && !known.has(p.id))
      .map((p) => ({
        id: p.id,
        conversationId: active.id,
        senderId: meId!,
        body: p.body.body,
        attachments: [],
        createdAt: p.body.sentAt,
        pendingSync: true,
      }));
    return [...messages, ...onPhone];
  }, [messages, chatCreate.pending, active, meId]);

  const send = useCallback(
    async (body: string, attachments: ChatAttachment[]): Promise<boolean> => {
      const conv = activeRef.current;
      if (!conv) return false;
      try {
        if (attachments.length) {
          const sent = await chatApi.send(conv.id, body, attachments);
          setMessages((m) => appendMessage(m, sent));
          return true;
        }
        const outcome = await chatCreate.run(
          {
            lane: `chat:${conv.id}`,
            params: { conversationId: conv.id },
            body: { body, sentAt: new Date().toISOString() },
          },
          () => chatApi.send(conv.id, body),
        );
        if (outcome.kind === 'refused') {
          onError(outcome.message ?? 'send');
          return false;
        }
        if (outcome.kind === 'done' && isPlaceable(outcome.response))
          setMessages((m) => appendMessage(m, outcome.response as ChatMessage));
        return true;
      } catch {
        onError('send');
        return false;
      }
    },
    [chatCreate, onError],
  );

  const edit = useCallback(
    async (id: string, body: string) => {
      try {
        const saved = await chatApi.edit(id, body);
        setMessages((m) => replaceMessage(m, saved));
      } catch (e) {
        onError((e as Error).message);
      }
    },
    [onError],
  );
  const remove = useCallback(
    async (id: string) => {
      try {
        const saved = await chatApi.remove(id);
        setMessages((m) => replaceMessage(m, saved));
      } catch (e) {
        onError((e as Error).message);
      }
    },
    [onError],
  );

  return { active, setActive, open, messages: shown, hasMore, loadOlder, loadingOlder, peerTyping, send, edit, remove };
}
