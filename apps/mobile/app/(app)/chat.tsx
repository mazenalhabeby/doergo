import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SocketEvents, conversationTitle, type ChatConversation, type ChatMessage, type ChatUserRef } from '@hbcfield/shared/client';
import { useAuth } from '../../src/contexts/auth-context';
import { useTheme } from '../../src/contexts/theme-context';
import { useSocketContext } from '../../src/contexts/socket-context';
import { ScreenContainer } from '../../src/components';
import { chatApi } from '../../src/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';

type ChatView = 'list' | 'thread' | 'contacts';

function initials(u?: ChatUserRef | null) {
  if (!u) return '?';
  return `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

export default function ChatScreen() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { subscribe } = useSocketContext();
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, SPACING.sm);
  const meId = user?.id;

  const [view, setView] = useState<ChatView>('list');
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [contacts, setContacts] = useState<ChatUserRef[]>([]);
  const [active, setActive] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const activeRef = useRef<ChatConversation | null>(null);
  activeRef.current = active;

  const loadList = useCallback(async () => {
    try {
      const list = await chatApi.conversations();
      setConversations(list);
      setError(null);
    } catch {
      setError(t('chat.loadError', 'Could not load messages.'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const openConversation = useCallback(async (conv: ChatConversation) => {
    setActive(conv);
    setView('thread');
    try {
      const h = await chatApi.history(conv.id);
      setMessages(h.data);
      chatApi.markRead(conv.id).then(loadList).catch(() => {});
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    } catch {
      setError(t('chat.loadError', 'Could not load messages.'));
    }
  }, [loadList, t]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Deep-link from a push tap (?conversationId=…)
  useEffect(() => {
    if (!params.conversationId) return;
    (async () => {
      const list = await chatApi.conversations().catch(() => [] as ChatConversation[]);
      setConversations(list);
      const conv = list.find((c) => c.id === params.conversationId);
      if (conv) openConversation(conv);
    })();
  }, [params.conversationId, openConversation]);

  // Real-time.
  useEffect(() => {
    const off = subscribe(SocketEvents.CHAT_MESSAGE, (d: any) => {
      loadList();
      const open = activeRef.current;
      if (open && d?.conversationId === open.id) {
        chatApi.history(open.id).then((h) => {
          setMessages(h.data);
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
        }).catch(() => {});
        chatApi.markRead(open.id).catch(() => {});
      }
    });
    return () => off();
  }, [subscribe, loadList]);

  const openContacts = async () => {
    setView('contacts');
    try {
      setContacts(await chatApi.contacts());
    } catch {
      setError(t('chat.loadError', 'Could not load messages.'));
    }
  };

  const startChat = async (userId: string) => {
    try {
      const conv = await chatApi.openDirect(userId);
      await loadList();
      openConversation(conv);
    } catch {
      setError(t('chat.cannotContact', 'You cannot message this member.'));
    }
  };

  const sendMessage = async () => {
    if (!active || !text.trim()) return;
    setSending(true);
    try {
      await chatApi.send(active.id, text.trim());
      setText('');
      setError(null);
      const h = await chatApi.history(active.id);
      setMessages(h.data);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch {
      setError(t('chat.sendError', 'Could not send. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  const headerTitle =
    view === 'contacts'
      ? t('chat.newMessage', 'New message')
      : view === 'thread' && active
        ? conversationTitle(active, i18n.language)
        : t('chat.title', 'Messages');

  return (
    <ScreenContainer>
      <View style={[styles.header, { borderColor: colors.border }]}>
        {view !== 'list' ? (
          <TouchableOpacity onPress={() => setView('list')} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{headerTitle}</Text>
        {view === 'list' ? (
          <TouchableOpacity onPress={openContacts} style={styles.iconBtn}>
            <Ionicons name="create-outline" size={22} color={COLORS.primary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      {error ? (
        <View style={styles.errorBar}><Text style={styles.errorText}>{error}</Text></View>
      ) : null}

      {loading && view === 'list' ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : view === 'list' ? (
        <>
          <ScrollView style={{ flex: 1 }}>
            {conversations.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('chat.empty', 'No conversations yet.')}</Text>
            ) : (
              conversations.map((c) => (
                <TouchableOpacity key={c.id} onPress={() => openConversation(c)} style={[styles.row, { borderColor: colors.border }]}>
                  <Avatar u={c.otherMember} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{conversationTitle(c, i18n.language)}</Text>
                    <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={1}>{c.lastMessage?.body ?? t('chat.noMessages', 'No messages yet')}</Text>
                  </View>
                  {!!c.unread && <View style={styles.badge}><Text style={styles.badgeText}>{c.unread}</Text></View>}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
          <TouchableOpacity style={[styles.primaryBtn, { marginBottom: SPACING.md + bottomPad }]} onPress={openContacts}>
            <Text style={styles.primaryBtnText}>{t('chat.newMessage', 'New message')}</Text>
          </TouchableOpacity>
        </>
      ) : view === 'contacts' ? (
        <ScrollView style={{ flex: 1 }}>
          {contacts.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('chat.noContacts', 'No one to message.')}</Text>
          ) : (
            contacts.map((u) => (
              <TouchableOpacity key={u.id} onPress={() => startChat(u.id)} style={[styles.row, { borderColor: colors.border }]}>
                <Avatar u={u} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{u.firstName} {u.lastName}</Text>
                  {!!u.position && <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={1}>{u.position}</Text>}
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView ref={scrollRef} style={{ flex: 1, padding: SPACING.md }}>
            {messages.map((m) => {
              const mine = m.senderId === meId;
              return (
                <View key={m.id} style={[styles.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
                  <View style={[styles.bubble, mine ? { backgroundColor: COLORS.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                    <Text style={{ color: mine ? '#fff' : colors.textPrimary, fontSize: FONT_SIZE.sm }}>{m.body}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <View style={[styles.replyBar, { borderColor: colors.border, paddingBottom: SPACING.sm + bottomPad }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t('chat.messagePlaceholder', 'Write a message…')}
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              multiline
            />
            <TouchableOpacity style={styles.sendBtn} disabled={sending || !text.trim()} onPress={sendMessage}>
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </ScreenContainer>
  );
}

function Avatar({ u }: { u?: ChatUserRef | null }) {
  const { colors } = useTheme();
  if (u?.avatarUrl) return <Image source={{ uri: u.avatarUrl }} style={styles.avatar} />;
  return (
    <View style={[styles.avatar, { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: colors.textSecondary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold }}>{initials(u)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1 },
  iconBtn: { width: 36, height: 36, justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: FONT_SIZE.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, borderBottomWidth: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  name: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium },
  preview: { fontSize: FONT_SIZE.xs, marginTop: 2 },
  badge: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: FONT_WEIGHT.bold },
  primaryBtn: { backgroundColor: COLORS.primary, margin: SPACING.md, borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE.md },
  bubbleRow: { flexDirection: 'row', marginBottom: SPACING.sm },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  replyBar: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm, padding: SPACING.sm, borderTopWidth: 1 },
  input: { flex: 1, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 8, maxHeight: 100, fontSize: FONT_SIZE.sm },
  sendBtn: { backgroundColor: COLORS.primary, width: 40, height: 40, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center' },
  errorBar: { backgroundColor: '#FEE2E2', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  errorText: { color: '#B91C1C', fontSize: FONT_SIZE.sm },
});
