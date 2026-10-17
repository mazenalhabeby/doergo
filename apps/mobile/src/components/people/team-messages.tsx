import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  SocketEvents,
  applyChangedToConversations,
  applyRead,
  applyToConversations,
  chatSearchQuery,
  conversationTitle,
  markReadLocally,
  chatWhenShort,
  type ChatConversation,
  type ChatSearchHit,
} from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useSocketContext } from '../../contexts/socket-context';
import { chatApi } from '../../lib/api';
import { useOffline } from '../../offline/offline-context';
import { useAppResume } from '../../lib/app-resume';
import { AText, GlassInput, Well, WellDivider, useTabSafe } from '../amazen';
import { Banner } from '../job/job-ui';
import { ConversationAvatar, ConversationRow } from '../chat/chat-rows';
import { Arrive } from '../amazen/motion';
import { InkIcon } from '../amazen/ink-icon';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { debounce } from '../chat/live-thread';
import { refreshChatBadge } from '../../lib/chat-badge';

/**
 * Search inside the caller's own conversations — ONLINE ONLY: the phone keeps
 * thirty days of messages but no index, and a search that silently missed
 * older words would be worse than one that says it needs the network.
 */
function useMessageSearch(query: string) {
  const [hits, setHits] = useState<ChatSearchHit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const q = query.trim();
  const searchable = q.length >= 2 && !!chatSearchQuery(q);
  useEffect(() => {
    if (!searchable) {
      setHits(null);
      setFailed(false);
      return;
    }
    let live = true;
    const id = setTimeout(() => {
      chatApi
        .search(q)
        .then((r) => {
          if (live) {
            setHits(r);
            setFailed(false);
          }
        })
        .catch(() => {
          if (live) {
            setHits([]);
            setFailed(true);
          }
        });
    }, 350);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [q, searchable]);
  return { searchable, hits, failed };
}

/**
 * Team → MESSAGES: every conversation, newest first, with what is unread.
 *
 * Read once when shown; after that a message on the socket moves its row to
 * the top with the server's own count (shared chat/live.ts). Only a thread this
 * phone has never listed, or the app coming back, reads the list again.
 */
export function TeamMessages({ header }: { header: React.ReactElement }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const meId = user?.id;
  const router = useRouter();
  const tabSafe = useTabSafe();
  const { subscribe, isAuthenticated } = useSocketContext();
  const { records } = useOffline();
  const [list, setList] = useState<ChatConversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const search = useMessageSearch(query);
  const { hour12 } = useTimeFormat();
  const listRef = useRef<ChatConversation[] | null>(null);
  // The first screenful comes in one row after another; rows scrolled into view later just appear.
  const firstDraw = useRef(Date.now());
  listRef.current = list;

  const load = useCallback(async () => {
    try {
      setList(await chatApi.conversations());
      // The rows and the tab's number come from the same server, read together: they cannot disagree.
      void refreshChatBadge(meId);
      setError(null);
    } catch {
      setError(t('chat.loadError', 'Could not load messages.'));
      setList((l) => l ?? []);
    }
  }, [t, meId]);
  const loadRef = useRef(load);
  loadRef.current = load;
  const reload = useRef(debounce(() => void loadRef.current(), 1000)).current;
  useEffect(() => {
    // The phone's copy first (the chat_conversations pull scope) — the list is there with no signal.
    if (records)
      void records
        .list<ChatConversation>('chat_conversations')
        .then((rows) => {
          setList(
            (l) =>
              l ??
              (rows.length
                ? rows
                    .map((r) => r.data)
                    .sort(
                      (a, b) => Date.parse(b.lastMessageAt ?? b.createdAt) - Date.parse(a.lastMessageAt ?? a.createdAt),
                    )
                : null),
          );
        })
        .catch(() => undefined);
    void load();
    return () => reload.cancel();
  }, [load, reload, records]);
  useAppResume(() => reload.call());
  // Back on the socket after a gap: what was said meanwhile reached no screen — read the list again.
  const wasAuthed = useRef(isAuthenticated);
  useEffect(() => {
    if (isAuthenticated && !wasAuthed.current) reload.call();
    wasAuthed.current = isAuthenticated;
  }, [isAuthenticated, reload]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const offs = [
      subscribe(SocketEvents.CHAT_MESSAGE, (d: any) => {
        const current = listRef.current;
        if (!current) return;
        const next = applyToConversations(current, d ?? {}, { meId, openId: null });
        if (next.known) setList(next.list);
        else reload.call();
      }),
      // Read anywhere — including by me on another screen or device: the row's number goes too.
      subscribe(SocketEvents.CHAT_READ, (d: any) => {
        if (d?.conversationId) setList((l) => (l ? applyRead(l, d, meId) : l));
      }),
      subscribe(SocketEvents.CHAT_MESSAGE_CHANGED, (d: any) => {
        if (d?.message?.id) setList((l) => (l ? applyChangedToConversations(l, d) : l));
      }),
      // A group changed or a job's crew moved: the list is read again; taken out, the row goes now.
      subscribe(SocketEvents.CHAT_CONVERSATION_UPDATED, (d: any) => {
        if (d?.removed && d?.conversationId) setList((l) => (l ? l.filter((x) => x.id !== d.conversationId) : l));
        reload.call();
      }),
    ];
    return () => offs.forEach((o) => o());
  }, [isAuthenticated, subscribe, meId, reload]);

  const open = useCallback(
    (cv: ChatConversation) => {
      // The thread marks it read (and sets the badge from the server's answer); the row reads 0 at once.
      setList((l) => (l ? markReadLocally(l, cv.id) : l));
      router.push({ pathname: '/chat', params: { conversationId: cv.id } } as never);
    },
    [router],
  );

  const q = query.trim().toLowerCase();
  // Conversations whose name or newest message holds the words — on the phone, instantly.
  const shown =
    q && list
      ? list.filter((cv) =>
          `${conversationTitle(cv, i18n.language)} ${cv.lastMessage?.body ?? ''}`.toLowerCase().includes(q),
        )
      : list;
  const found = search.searchable ? (
    <View style={{ marginTop: amazen.space(4), gap: amazen.space(2) }}>
      <AText variant="caption" tone="onGlass" style={{ marginLeft: amazen.space(1) }}>
        {t('chat.messagesFound', 'Messages')}
      </AText>
      {search.failed ? (
        <Banner tone="warn" text={t('chat.searchOnline', 'Searching messages needs a connection.')} />
      ) : search.hits === null ? (
        <AText variant="caption" tone="onGlass" style={{ textAlign: 'center' }}>
          {t('common.loading', 'Loading…')}
        </AText>
      ) : search.hits.length === 0 ? (
        <AText variant="caption" tone="onGlass" style={{ textAlign: 'center' }}>
          {t('chat.noMessagesFound', 'No messages with these words.')}
        </AText>
      ) : (
        <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
          {search.hits.map((h, i) => (
            <Arrive key={h.message.id} delay={Math.min(i, 10) * 45}>
              {i ? <WellDivider /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/chat', params: { conversationId: h.conversation.id } } as never)
                }
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  gap: amazen.space(3),
                  paddingVertical: amazen.space(2.75),
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <ConversationAvatar conv={h.conversation as ChatConversation} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <AText variant="body" tone="strong" numberOfLines={1} style={{ flexShrink: 1, fontSize: 14 }}>
                      {conversationTitle(h.conversation as ChatConversation, i18n.language)}
                    </AText>
                    <AText variant="caption" tone="muted" numeric style={{ fontSize: 11 }}>
                      {chatWhenShort(h.message.createdAt, i18n.language, hour12, t)}
                    </AText>
                  </View>
                  <AText variant="caption" tone="muted" numberOfLines={2} style={{ fontSize: 12.5 }}>
                    {h.message.sender && h.conversation.type !== 'DIRECT' ? `${h.message.sender.firstName}: ` : ''}
                    {h.message.body}
                  </AText>
                </View>
              </Pressable>
            </Arrive>
          ))}
        </Well>
      )}
    </View>
  ) : null;

  return (
    <FlatList
      data={shown ?? []}
      keyExtractor={(cv) => cv.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: amazen.space(4), paddingBottom: tabSafe }}
      initialNumToRender={14}
      windowSize={9}
      ListHeaderComponent={
        <>
          {header}
          <View style={{ marginBottom: amazen.space(3) }}>
            <GlassInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('chat.searchMessages', 'Search messages')}
              accessibilityLabel={t('chat.searchMessages', 'Search messages')}
              returnKeyType="search"
            />
          </View>
          {error ? <Banner tone="critical" text={error} /> : null}
        </>
      }
      ListFooterComponent={found}
      ListEmptyComponent={
        list === null ? (
          <AText variant="caption" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(6) }}>
            {t('common.loading', 'Loading…')}
          </AText>
        ) : (
          <Well style={{ padding: amazen.space(6), alignItems: 'center', gap: amazen.space(2) }}>
            <InkIcon name="chat" size={40} />
            <AText variant="body" tone="strong">
              {t('chat.emptyTitle', 'No conversations yet')}
            </AText>
            <AText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
              {t('chat.emptyBody', 'Start one with anybody on your team.')}
            </AText>
          </Well>
        )
      }
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.accent} colors={[c.accent]} />}
      renderItem={({ item, index }) => (
        <Arrive enabled={index < 12 && Date.now() - firstDraw.current < 1500} delay={Math.min(index, 12) * 35}>
          <ConversationRow
            conv={item}
            first={index === 0}
            last={index === (shown?.length ?? 0) - 1}
            mine={item.lastMessage?.senderId === meId}
            onOpen={open}
          />
        </Arrive>
      )}
    />
  );
}
