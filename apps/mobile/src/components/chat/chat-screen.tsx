import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SocketEvents, conversationTitle, type ChatConversation, type ChatMessage, type ChatUserRef } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useSocketContext } from '../../contexts/socket-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { chatApi } from '../../lib/api';
import { activeChat } from '../../lib/active-chat';
import { useQueuedCreate } from '../../offline/actions/queued-create';
import { AText, Ground, HeaderBack, ScreenHeader, Well, WellDivider, useTabSafe } from '../amazen';
import { Banner, SectionLabel } from '../job/job-ui';
import { SendGlyph } from '../job/job-glyphs';
import { PersonAvatar, presenceKey } from '../people/person-avatar';

/**
 * CHAT — your conversations, one conversation, and starting a new one.
 *
 * ⚠️ THE LOGIC IS THE OLD SCREEN'S, UNCHANGED: the outbox send (a message
 * written with no signal is in the thread at once, with a clock, and sends
 * itself), the socket (a new message reloads the thread; "typing" shows for
 * 3.5 s), the deep links (?conversationId from a push, ?userId from Team),
 * and the closed conversation (a workspace no longer shared: history stays,
 * the composer goes). Only the drawing changed.
 *
 * ⚠️ NO TAB BAR IN A CONVERSATION — it needs the room, and the keyboard would
 * sit on the bar. The screen tells the bar through its options (`tabBarHidden`).
 */
type ChatView = 'list' | 'thread' | 'contacts';

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


export function ChatScreen() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { hour12 } = useTimeFormat();
  const { amazen } = useTheme();
  const c = amazen.color;
  const tabSafe = useTabSafe();
  const { subscribe, isAuthenticated, emit } = useSocketContext();
  const params = useLocalSearchParams<{ conversationId?: string; userId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);
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

  /*
    A message goes into the outbox with the id it will have on the server, and
    is shown from there at once — with a clock until it is delivered — so a
    message written with no signal is in the thread, in order, and sends
    itself. Delivered in the background: the thread reloads.
  */
  const chatCreate = useQueuedCreate<{ body: string; sentAt: string }>('chat.send', {
    onAccepted: () => {
      if (active) void chatApi.history(active.id).then((h) => setMessages(h.data)).catch(() => undefined);
    },
  });
  const shownMessages = useMemo(() => {
    if (!active) return messages;
    const known = new Set(messages.map((m) => m.id));
    const onPhone = chatCreate.pending
      .filter((p) => p.params.conversationId === active.id && !known.has(p.id))
      .map((p) => ({
        id: p.id, conversationId: active.id, senderId: meId!, body: p.body.body, attachments: [],
        createdAt: p.body.sentAt, pendingSync: true,
      }) as ChatMessage & { pendingSync: boolean });
    return [...messages, ...onPhone];
  }, [messages, chatCreate.pending, active, meId]);

  const sendMessage = async () => {
    const body = text.trim();
    if (!active || !body) return;
    setText('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const outcome = await chatCreate.run(
        { lane: `chat:${active.id}`, params: { conversationId: active.id }, body: { body, sentAt: new Date().toISOString() } },
        () => chatApi.send(active.id, body),
      );
      if (outcome.kind === 'refused') {
        setText(body);
        setError((outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('chat.sendError', 'Could not send. Please try again.'));
        return;
      }
      setError(null);
      if (outcome.kind === 'done') {
        const h = await chatApi.history(active.id);
        setMessages(h.data);
      }
    } catch {
      setText(body);
      setError(t('chat.sendError', 'Could not send. Please try again.'));
    }
  };


  /* ---------------- the drawing ---------------- */

  const navigation = useNavigation();
  const inThread = view === 'thread';
  useEffect(() => {
    navigation.setOptions({ tabBarHidden: inThread } as never);
  }, [navigation, inThread]);

  const time = (iso: string) => timeHM(iso, i18n.language, hour12);
  const composerOpen = inThread && !!active && !active.isClosed;

  let body: React.ReactNode;
  if (view === 'list') {
    body = (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: amazen.space(4), paddingBottom: tabSafe, gap: amazen.space(3) }}>
        {error ? <Banner tone="critical" text={error} /> : null}
        {loading ? (
          <AText variant="caption" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(6) }}>{t('common.loading', 'Loading…')}</AText>
        ) : conversations.length === 0 ? (
          <Well style={{ padding: amazen.space(6), alignItems: 'center', gap: amazen.space(2) }}>
            <AText variant="body" tone="strong">{t('chat.emptyTitle', 'No conversations yet')}</AText>
            <AText variant="caption" tone="muted" style={{ textAlign: 'center' }}>{t('chat.emptyBody', 'Start one with anybody on your team.')}</AText>
          </Well>
        ) : (
          <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
            {conversations.map((cv, i) => {
              const unread = cv.unread ?? 0;
              const last = cv.lastMessage;
              const mine = last?.senderId === meId;
              return (
                <React.Fragment key={cv.id}>
                  {i > 0 ? <WellDivider /> : null}
                  <Pressable
                    onPress={() => { threadFromListRef.current = true; void openConversation(cv); }}
                    accessibilityRole="button"
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(2.75), opacity: pressed ? 0.85 : 1 })}
                  >
                    <PersonAvatar person={cv.otherMember} presence={cv.otherMember?.presence ?? null} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <AText variant="body" tone="strong" numberOfLines={1} style={{ flexShrink: 1, fontSize: 14.5, fontFamily: unread ? amazen.font.sansMedium : amazen.font.sans }}>
                          {conversationTitle(cv, i18n.language)}
                        </AText>
                        {cv.isExternal ? <Tag label={t('chat.external', 'External')} tone="warn" /> : null}
                        {cv.isClosed ? <Tag label={t('chat.closed', 'Closed')} /> : null}
                      </View>
                      <AText variant="caption" numberOfLines={1} style={{ fontSize: 12.5, color: unread ? c.inkStrong : c.inkMuted }}>
                        {last ? `${mine ? `${t('chat.you', 'You')}: ` : ''}${last.body}` : t('chat.noMessagesYet', 'No messages yet')}
                      </AText>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      {cv.lastMessageAt ? <AText variant="caption" tone="muted" numeric style={{ fontSize: 11.5 }}>{whenShort(cv.lastMessageAt, i18n.language, hour12, t)}</AText> : null}
                      {unread ? (
                        <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: c.accentSolid, alignItems: 'center', justifyContent: 'center' }}>
                          <AText variant="caption" tone="accentInk" numeric style={{ fontSize: 11 }}>{String(unread)}</AText>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                </React.Fragment>
              );
            })}
          </Well>
        )}
      </ScrollView>
    );
  } else if (view === 'contacts') {
    const avail = contacts.filter((u) => presenceKey(u.presence) === 'AVAILABLE');
    const rest = contacts.filter((u) => presenceKey(u.presence) !== 'AVAILABLE');
    const group = (label: string, list: ChatUserRef[]) => (list.length ? (
      <View style={{ gap: amazen.space(2) }}>
        <SectionLabel style={{ paddingHorizontal: amazen.space(1) }}>{label}</SectionLabel>
        <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
          {list.map((u, i) => (
            <React.Fragment key={u.id}>
              {i > 0 ? <WellDivider /> : null}
              <Pressable onPress={() => void startChat(u.id, true)} accessibilityRole="button"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(2.75), opacity: pressed ? 0.85 : 1 })}>
                <PersonAvatar person={u} presence={u.presence ?? null} />
                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AText variant="body" tone="strong" numberOfLines={1} style={{ flexShrink: 1, fontSize: 14.5 }}>{`${u.firstName} ${u.lastName}`}</AText>
                  {u.isExternal ? <Tag label={t('chat.external', 'External')} tone="warn" /> : null}
                </View>
              </Pressable>
            </React.Fragment>
          ))}
        </Well>
      </View>
    ) : null);
    body = (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: amazen.space(4), paddingBottom: tabSafe, gap: amazen.space(3) }}>
        {error ? <Banner tone="critical" text={error} /> : null}
        {contacts.length === 0 ? (
          <AText variant="caption" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(6) }}>{t('chat.noContacts', 'Nobody to message yet.')}</AText>
        ) : (
          <>
            {group(t('chat.availableNow', 'Available'), avail)}
            {group(t('chat.everyoneElse', 'Everyone else'), rest)}
          </>
        )}
      </ScrollView>
    );
  } else {
    body = (
      <>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(3), gap: 3 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {error ? <Banner tone="critical" text={error} /> : null}
          {shownMessages.length === 0 ? (
            <View style={{ alignItems: 'center', gap: amazen.space(2), paddingVertical: amazen.space(10) }}>
              <PersonAvatar person={active?.otherMember} size={64} />
              <AText variant="caption" tone="onGlass">{t('chat.sayHello', 'Say hello')}</AText>
            </View>
          ) : null}
          {shownMessages.map((m, i) => {
            const prev = shownMessages[i - 1];
            const next = shownMessages[i + 1];
            const pending = !!(m as { pendingSync?: boolean }).pendingSync;
            const mine = m.senderId === meId;
            const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
            const lastOfGroup = !next || next.senderId !== m.senderId || dayKey(next.createdAt) !== dayKey(m.createdAt);
            const grouped = !!prev && !newDay && prev.senderId === m.senderId;
            return (
              <View key={m.id}>
                {newDay ? (
                  <View style={{ alignItems: 'center', paddingVertical: amazen.space(3) }}>
                    <SectionLabel>{dayLabel(m.createdAt, i18n.language, t)}</SectionLabel>
                  </View>
                ) : null}
                <View
                  style={{
                    alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', paddingHorizontal: 13, paddingVertical: 10,
                    backgroundColor: mine ? c.accentTint : c.well,
                    borderRadius: 20,
                    // A group reads as one: the corner toward the next bubble tightens.
                    ...(mine
                      ? { borderTopRightRadius: grouped ? 6 : 20, borderBottomRightRadius: lastOfGroup ? 6 : 20 }
                      : { borderTopLeftRadius: grouped ? 6 : 20, borderBottomLeftRadius: lastOfGroup ? 6 : 20 }),
                  }}
                >
                  <AText variant="body" tone="strong" style={{ fontSize: 14.5, lineHeight: 20 }}>{m.body}</AText>
                </View>
                {lastOfGroup || pending ? (
                  <AText variant="caption" tone={pending ? 'warn' : 'muted'} numeric style={{ alignSelf: mine ? 'flex-end' : 'flex-start', fontSize: 10.5, marginTop: 3, marginBottom: 8, marginHorizontal: 6 }}>
                    {pending ? `◷ ${t('offline.chip.waiting')}` : time(m.sentAt ?? m.createdAt)}
                  </AText>
                ) : null}
              </View>
            );
          })}
          {peerTyping ? (
            <View style={{ alignSelf: 'flex-start', flexDirection: 'row', gap: 4, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, backgroundColor: c.well }} accessibilityLabel={`${active?.otherMember?.firstName ?? ''} ${t('chat.typing', 'is typing…')}`}>
              {[0, 1, 2].map((d) => <View key={d} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.inkMuted }} />)}
            </View>
          ) : null}
        </ScrollView>
        {composerOpen ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: amazen.space(2), paddingHorizontal: amazen.space(3.5), paddingTop: amazen.space(2), paddingBottom: bottomPad }}>
            <TextInput
              value={text}
              onChangeText={onType}
              placeholder={t('chat.messagePlaceholder', { defaultValue: 'Message {{name}}', name: active?.otherMember?.firstName ?? '' })}
              placeholderTextColor={c.inkMuted}
              multiline
              maxLength={4000}
              style={{ flex: 1, maxHeight: 120, backgroundColor: c.sunken, borderWidth: 1, borderColor: c.lineWell, borderRadius: 22, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, color: c.inkStrong, fontFamily: amazen.font.sans, fontSize: 14.5 }}
            />
            <SendButton disabled={!text.trim()} onPress={() => void sendMessage()} label={t('chat.send', 'Send')} />
          </View>
        ) : active?.isClosed ? (
          <View style={{ marginHorizontal: amazen.space(4), marginBottom: bottomPad, borderRadius: 16, padding: amazen.space(3.5), backgroundColor: c.tile }}>
            <AText variant="caption" tone="ink" style={{ fontSize: 13, lineHeight: 18 }}>
              {t('chat.conversationClosed', 'This workspace is no longer shared, so this conversation is closed. You can still read what was said.')}
            </AText>
          </View>
        ) : null}
      </>
    );
  }

  return (
    <Ground style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {inThread && active ? (
          // ⚠️ The person, not a title: photo, name, and whether they are around — on the shared header's grid.
          <View style={{ paddingTop: insets.top + amazen.space(2), paddingHorizontal: 14, paddingBottom: amazen.space(3), flexDirection: 'row', alignItems: 'center', gap: amazen.space(3) }}>
            <HeaderBack onPress={goBack} />
            <PersonAvatar person={active.otherMember} size={40} presence={active.isExternal ? undefined : active.otherMember?.presence ?? null} ring={c.canvas} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AText variant="h3" tone="strong" numberOfLines={1} style={{ flexShrink: 1, fontSize: 17, lineHeight: 22 }}>{conversationTitle(active, i18n.language)}</AText>
                {active.isExternal ? <Tag label={t('chat.external', 'External')} tone="warn" /> : null}
              </View>
              <AText variant="caption" numberOfLines={1} style={{ color: active.isExternal ? c.inkOnGlass : presenceKey(active.otherMember?.presence) === 'AVAILABLE' ? c.accent : c.inkOnGlass }}>
                {active.isExternal ? t('chat.externalMember', 'At another organization') : presenceText(active.otherMember?.presence, t)}
              </AText>
            </View>
          </View>
        ) : (
          <ScreenHeader
            title={view === 'contacts' ? t('chat.newMessage', 'New message') : t('chat.title', 'Messages')}
            leading={<HeaderBack onPress={goBack} />}
            actions={view === 'list' ? [{ label: `＋ ${t('chat.new', 'New')}`, a11yLabel: t('chat.newMessage', 'New message'), onPress: () => void openContacts() }] : undefined}
          />
        )}
        {body}
      </KeyboardAvoidingView>
    </Ground>
  );
}

function presenceText(p: string | null | undefined, t: import('i18next').TFunction) {
  if (p === 'AVAILABLE') return t('chat.presence.active', 'Active now');
  if (p === 'BUSY') return t('chat.presence.busy', 'Busy');
  if (p === 'AWAY') return t('chat.presence.away', 'Away');
  return t('chat.presence.offline', 'Offline');
}

/** "09:41" today, "Yesterday", a weekday this week, a date before that. */
function whenShort(iso: string, lang: string, hour12: boolean | undefined, t: import('i18next').TFunction) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return timeHM(iso, lang, hour12);
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return t('chat.yesterday', 'Yesterday');
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString(localeOf(lang), { weekday: 'short' });
  return d.toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short' });
}

/** A small mono tag — EXTERNAL in amber, CLOSED quiet. */
function Tag({ label, tone }: { label: string; tone?: 'warn' }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: tone === 'warn' ? c.warnTint : c.tile }}>
      <AText numberOfLines={1} style={{ fontFamily: amazen.font.mono, fontSize: 9.5, letterSpacing: 1, textTransform: 'uppercase', color: tone === 'warn' ? c.warn : c.ink }}>{label}</AText>
    </View>
  );
}

function SendButton({ onPress, disabled, label }: { onPress: () => void; disabled: boolean; label: string }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable onPress={disabled ? undefined : onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: disabled ? c.tile : c.accentSolid, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
      <SendGlyph size={19} color={disabled ? c.inkMuted : c.accentInk} contrast={c.accentSolid} />
    </Pressable>
  );
}
