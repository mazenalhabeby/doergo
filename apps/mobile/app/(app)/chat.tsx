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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SocketEvents, conversationTitle, type ChatConversation, type ChatMessage, type ChatUserRef } from '@hbcfield/shared/client';
import { useAuth } from '../../src/contexts/auth-context';
import { useTheme } from '../../src/contexts/theme-context';
import { useSocketContext } from '../../src/contexts/socket-context';
import { useTimeFormat } from '../../src/hooks/useTimeFormat';
import { ScreenContainer } from '../../src/components';
import { chatApi, resolveMediaUrl } from '../../src/lib/api';
import { activeChat } from '../../src/lib/active-chat';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';

type ChatView = 'list' | 'thread' | 'contacts';

function initials(u?: ChatUserRef | null) {
  if (!u) return '?';
  return `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

/**
 * "External" — this person works at another company, reachable through a space
 * shared with yours. Shown wherever the counterpart is named, because people
 * share different things when they know who they are talking to. It also
 * explains a thread that stops accepting messages: the space is no longer
 * shared, so the conversation is closed while its history stays readable.
 */
function ExternalTag({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={[externalTagStyles.pill, compact && externalTagStyles.pillCompact]}>
      <Text style={[externalTagStyles.text, compact && externalTagStyles.textCompact]}>
        {t('chat.external', 'External')}
      </Text>
    </View>
  );
}

const externalTagStyles = StyleSheet.create({
  pill: { backgroundColor: '#FEF3C7', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  pillCompact: { paddingHorizontal: 4 },
  text: { color: '#B45309', fontSize: 10, fontWeight: '600' },
  textCompact: { fontSize: 9 },
});
function presenceColor(p?: string | null) {
  return p === 'AVAILABLE' ? '#10b981' : p === 'BUSY' ? '#f43f5e' : p === 'AWAY' ? '#f59e0b' : '#94a3b8';
}
function presenceLabel(p: string | null | undefined, t: import('i18next').TFunction) {
  if (p === 'AVAILABLE') return t('chat.presence.active', 'Active now');
  if (p === 'BUSY') return t('chat.presence.busy', 'Busy');
  if (p === 'AWAY') return t('chat.presence.away', 'Away');
  return t('chat.presence.offline', 'Offline');
}
/** Map the active i18n language to an IETF locale (all supported languages). */
function localeOf(lang?: string): string {
  const l = lang || 'en';
  if (l.startsWith('de')) return 'de-DE';
  if (l.startsWith('es')) return 'es-ES';
  if (l.startsWith('it')) return 'it-IT';
  if (l.startsWith('fr')) return 'fr-FR';
  return 'en-US';
}
function timeHM(iso: string, lang: string, hour12?: boolean) {
  return new Date(iso).toLocaleTimeString(localeOf(lang), {
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    ...(hour12 === undefined ? {} : { hour12 }),
  });
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
  return d.toLocaleDateString(localeOf(lang), { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ChatScreen() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { hour12 } = useTimeFormat();
  const { colors } = useTheme();
  const { subscribe, isAuthenticated, emit } = useSocketContext();
  const params = useLocalSearchParams<{ conversationId?: string; userId?: string }>();
  const router = useRouter();
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
  const [error, setError] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  // Whether the open thread was reached from the in-screen list (→ back returns to
  // the list) vs. a deep-link from the Team tab (→ back leaves to the Team screen).
  const threadFromListRef = useRef(false);
  const activeRef = useRef<ChatConversation | null>(null);
  activeRef.current = active;

  // Publish the open conversation so the global notifier can suppress its toast.
  useEffect(() => {
    activeChat.conversationId = view === 'thread' ? active?.id ?? null : null;
    return () => { activeChat.conversationId = null; };
  }, [active?.id, view]);
  const typingSentRef = useRef(0);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (conv) { threadFromListRef.current = false; openConversation(conv); }
    })();
  }, [params.conversationId, openConversation]);

  // Real-time.
  useEffect(() => {
    if (!isAuthenticated) return;
    const offs = [
      subscribe(SocketEvents.CHAT_MESSAGE, (d: any) => {
        loadList();
        const open = activeRef.current;
        if (open && d?.conversationId === open.id) {
          setPeerTyping(false); // a message means they stopped typing
          chatApi.history(open.id).then((h) => {
            setMessages(h.data);
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
          }).catch(() => {});
          chatApi.markRead(open.id).catch(() => {});
        }
      }),
      subscribe(SocketEvents.CHAT_TYPING, (d: any) => {
        const open = activeRef.current;
        if (!open || d?.conversationId !== open.id || d?.from === meId) return;
        setPeerTyping(true);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setPeerTyping(false), 3500);
      }),
    ];
    return () => offs.forEach((o) => o());
  }, [isAuthenticated, subscribe, loadList, meId]);

  // Back navigation:
  //  • contacts → list
  //  • thread opened from the list → list
  //  • thread opened via deep-link (Team/push) or the list itself → leave to Team
  const leaveScreen = () => (router.canGoBack() ? router.back() : router.replace('/(app)/(tabs)/team'));
  const goBack = () => {
    if (view === 'contacts') return setView('list');
    if (view === 'thread' && threadFromListRef.current) return setView('list');
    leaveScreen();
  };

  const openContacts = async () => {
    setView('contacts');
    try {
      setContacts(await chatApi.contacts());
    } catch {
      setError(t('chat.loadError', 'Could not load messages.'));
    }
  };

  const startChat = useCallback(async (userId: string, fromList: boolean) => {
    try {
      const conv = await chatApi.openDirect(userId);
      await loadList();
      threadFromListRef.current = fromList;
      openConversation(conv);
    } catch {
      setError(t('chat.cannotContact', 'You cannot message this member.'));
    }
  }, [loadList, openConversation, t]);

  // Deep-link from the Team tab (?userId=…) — open (or create) the direct thread.
  const openedUserRef = useRef<string | null>(null);
  useEffect(() => {
    const uid = params.userId;
    if (!uid || uid === meId || openedUserRef.current === uid) return;
    openedUserRef.current = uid;
    startChat(uid, false); // from Team → back should leave to the Team screen
  }, [params.userId, meId, startChat]);

  // Emit a typing signal (throttled) while composing.
  const onType = (v: string) => {
    setText(v);
    const now = Date.now();
    if (active && now - typingSentRef.current > 2000) {
      typingSentRef.current = now;
      const recipientIds = (active.members ?? []).map((m) => m.id).filter((id) => id !== meId);
      emit('chat_typing', { conversationId: active.id, recipientIds, from: meId });
    }
  };

  const sendMessage = async () => {
    const body = text.trim();
    if (!active || !body) return;
    setText('');
    // Optimistic: show the message immediately.
    const temp: ChatMessage = {
      id: `tmp-${Date.now()}`, conversationId: active.id, senderId: meId!, body, attachments: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, temp]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      await chatApi.send(active.id, body);
      setError(null);
      const h = await chatApi.history(active.id);
      setMessages(h.data);
    } catch {
      setError(t('chat.sendError', 'Could not send. Please try again.'));
      setMessages((prev) => prev.filter((m) => m.id !== temp.id)); // rollback
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
      <View style={[styles.header, { borderColor: colors.border, backgroundColor: colors.surface, paddingTop: insets.top + SPACING.xs }]}>
        <TouchableOpacity onPress={goBack} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        {view === 'thread' && active ? (
          <View style={styles.headerPerson}>
            <Avatar u={active.otherMember} size={34} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.headerName, { color: colors.textPrimary, flexShrink: 1 }]} numberOfLines={1}>{conversationTitle(active, i18n.language)}</Text>
                {active.isExternal && <ExternalTag />}
              </View>
              <Text style={[styles.headerStatus, { color: colors.textSecondary }]} numberOfLines={1}>{presenceLabel(active.otherMember?.presence, t)}</Text>
            </View>
          </View>
        ) : (
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{headerTitle}</Text>
        )}
        <View style={styles.iconBtn} />
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
                <TouchableOpacity key={c.id} onPress={() => { threadFromListRef.current = true; openConversation(c); }} style={[styles.row, { borderColor: colors.border }]}>
                  <Avatar u={c.otherMember} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.name, { color: colors.textPrimary, flexShrink: 1 }]} numberOfLines={1}>{conversationTitle(c, i18n.language)}</Text>
                      {c.isExternal && <ExternalTag compact />}
                      {c.isClosed && (
                        <Text style={[styles.closedPill, { color: colors.textSecondary, borderColor: colors.border }]}>
                          {t('chat.closed', 'Closed')}
                        </Text>
                      )}
                    </View>
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
              <TouchableOpacity key={u.id} onPress={() => startChat(u.id, true)} style={[styles.row, { borderColor: colors.border }]}>
                <Avatar u={u} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.name, { color: colors.textPrimary, flexShrink: 1 }]} numberOfLines={1}>{u.firstName} {u.lastName}</Text>
                    {u.isExternal && <ExternalTag compact />}
                  </View>
                  {!!u.position && <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={1}>{u.position}</Text>}
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={[{ padding: SPACING.md }, messages.length === 0 && { flexGrow: 1, justifyContent: 'center', alignItems: 'center' }]}>
            {messages.length === 0 && (
              <View style={styles.threadEmpty}>
                <Avatar u={active?.otherMember} size={64} dot={false} />
                <Text style={[styles.threadEmptyName, { color: colors.textPrimary }]}>{active ? conversationTitle(active, i18n.language) : ''}</Text>
                <Text style={[styles.threadEmptyHint, { color: colors.textSecondary }]}>{t('chat.threadEmpty', 'No messages yet. Say hello 👋')}</Text>
              </View>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const mine = m.senderId === meId;
              const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
              const isLastOfGroup = !next || next.senderId !== m.senderId || dayKey(next.createdAt) !== dayKey(m.createdAt);
              const grouped = prev && !newDay && prev.senderId === m.senderId;
              return (
                <View key={m.id}>
                  {newDay && (
                    <View style={styles.dayRow}>
                      <Text style={[styles.dayPill, { backgroundColor: colors.card, color: colors.textSecondary }]}>{dayLabel(m.createdAt, i18n.language, t)}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: mine ? 'flex-end' : 'flex-start', marginTop: grouped ? 2 : 8 }}>
                    {!mine && (
                      <View style={{ width: 28, marginRight: 6 }}>
                        {isLastOfGroup ? <Avatar u={active?.otherMember} size={28} dot={false} /> : null}
                      </View>
                    )}
                    <View style={{ flexShrink: 1, maxWidth: '78%', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                      <View style={[styles.bubble, mine ? { backgroundColor: COLORS.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }, m.id.startsWith('tmp-') && { opacity: 0.7 }]}>
                        <Text style={{ color: mine ? '#fff' : colors.textPrimary, fontSize: FONT_SIZE.sm }}>{m.body}</Text>
                      </View>
                      {isLastOfGroup && <Text style={[styles.msgTime, { color: colors.textSecondary }]}>{timeHM(m.createdAt, i18n.language, hour12)}</Text>}
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {peerTyping && (
            <View style={styles.typingRow}>
              <Avatar u={active?.otherMember} size={22} dot={false} />
              <Text style={[styles.typingText, { color: colors.textSecondary }]}>
                {active?.otherMember?.firstName} {t('chat.typing', 'is typing…')}
              </Text>
            </View>
          )}

          {active?.isClosed ? (
            // The shared space is gone, so the server refuses anything typed
            // here. Say so instead of bouncing a message after it is written —
            // and leave the history above, because it is closed, not deleted.
            <View style={[styles.closedBar, { borderColor: colors.border, paddingBottom: SPACING.md + bottomPad }]}>
              <Text style={[styles.closedText, { color: colors.textSecondary }]}>
                {t(
                  'chat.conversationClosed',
                  'This space is no longer shared, so this conversation is closed. You can still read what was said.',
                )}
              </Text>
            </View>
          ) : (
            <View style={[styles.replyBar, { borderColor: colors.border, paddingBottom: SPACING.sm + bottomPad }]}>
              <TextInput
                value={text}
                onChangeText={onType}
                placeholder={t('chat.messagePlaceholder', 'Write a message…')}
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                multiline
              />
              <TouchableOpacity style={[styles.sendBtn, !text.trim() && { opacity: 0.4 }]} disabled={!text.trim()} onPress={sendMessage}>
                <Ionicons name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      )}
    </ScreenContainer>
  );
}

function Avatar({ u, size = 40, dot = true }: { u?: ChatUserRef | null; size?: number; dot?: boolean }) {
  const { colors } = useTheme();
  const r = size / 2;
  const img = resolveMediaUrl(u?.avatarUrl);
  return (
    <View style={{ width: size, height: size }}>
      {img ? (
        <Image source={{ uri: img }} style={{ width: size, height: size, borderRadius: r }} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: r, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.textSecondary, fontSize: size * 0.34, fontWeight: FONT_WEIGHT.semibold }}>{initials(u)}</Text>
        </View>
      )}
      {dot && (
        <View style={{
          position: 'absolute', bottom: 0, right: 0, width: size * 0.3, height: size * 0.3,
          borderRadius: size * 0.15, backgroundColor: presenceColor(u?.presence),
          borderWidth: 2, borderColor: colors.background,
        }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1 },
  iconBtn: { width: 36, height: 36, justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  headerPerson: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerName: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  headerStatus: { fontSize: FONT_SIZE.xs, marginTop: 1 },
  dayRow: { alignItems: 'center', marginVertical: SPACING.sm },
  dayPill: { fontSize: 11, fontWeight: FONT_WEIGHT.semibold, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  msgTime: { fontSize: 10, marginTop: 3, marginHorizontal: 4 },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingBottom: SPACING.xs },
  typingText: { fontSize: FONT_SIZE.xs, fontStyle: 'italic' },
  threadEmpty: { alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.xl },
  threadEmptyName: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, marginTop: SPACING.xs },
  threadEmptyHint: { fontSize: FONT_SIZE.sm, textAlign: 'center' },
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
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  replyBar: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm, padding: SPACING.sm, borderTopWidth: 1 },
  input: { flex: 1, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 8, maxHeight: 100, fontSize: FONT_SIZE.sm },
  sendBtn: { backgroundColor: COLORS.primary, width: 40, height: 40, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center' },
  errorBar: { backgroundColor: '#FEE2E2', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  errorText: { color: '#B91C1C', fontSize: FONT_SIZE.sm },
  // A closed cross-org thread: no composer, just why.
  closedBar: { borderTopWidth: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  closedText: { fontSize: FONT_SIZE.xs, textAlign: 'center', lineHeight: 17 },
  closedPill: { fontSize: 9, fontWeight: '600', borderWidth: 1, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
});
