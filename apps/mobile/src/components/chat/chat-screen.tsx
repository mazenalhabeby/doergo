import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { conversationTitle, type ChatConversation, type ChatMessage, type ChatUserRef } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useSocketContext } from '../../contexts/socket-context';
import { chatApi } from '../../lib/api';
import { Ground, HeaderBack, ScreenHeader, useTabSafe, Banner } from '../amazen';
import { bubbleShape } from './live-thread';
import { type Receipt } from './chat-rows';
import { AddPeopleView, GroupCreateView, GroupInfoView } from './chat-group-views';
import { Arrive } from '../amazen/motion';
import { ChatComposer } from './chat-composer';
import { ChatThreadHeader } from './chat-thread-header';
import { uploadChatPhotos } from './chat-photos';
import { pageTitle, receiptFor } from './chat-screen-helpers';
import { ChatClosedNotice, ChatContactList, ChatMessageList } from './chat-screen-lists';
import { useChatThread } from './use-chat-thread';
import { EmptyConversation } from './chat-empty-conversation';

/**
 * ONE CONVERSATION — and "New message" / "New group", the ways into one. The
 * list lives in Team → Messages; this screen opens from there, from a person
 * (?userId), a job (?taskId), a push (?conversationId) or "New" (?new=1, or
 * ?new=group), and Back returns where it came from. A group or a job's chat
 * also has its own page (who is in it), and "Add people".
 *
 * The thread logic (offline-first open, older pages, live updates, photos,
 * edit/remove) is `use-chat-thread`; this file draws it.
 *
 * ⚠️ NO TAB BAR IN A CONVERSATION — it needs the room, and the keyboard would
 * sit on the bar. The screen tells the bar through its options (`tabBarHidden`).
 */
export function ChatScreen() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { amazen } = useTheme();
  const tabSafe = useTabSafe();
  const { emit } = useSocketContext();
  const params = useLocalSearchParams<{ conversationId?: string; userId?: string; taskId?: string; new?: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const meId = user?.id;
  const [view, setView] = useState<'thread' | 'contacts' | 'group' | 'info' | 'add'>(
    params.new === 'group' ? 'group' : params.new ? 'contacts' : 'thread',
  );
  const [contacts, setContacts] = useState<ChatUserRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const typingSent = useRef(0);
  // Only what arrives while a thread is open animates in — not the history it opened with.
  const openedAt = useRef(Date.now());

  const onError = useCallback(
    (why: string) => {
      setError(
        why === 'load'
          ? t('chat.loadError', 'Could not load messages.')
          : why === 'send'
            ? t('chat.sendError', 'Could not send. Please try again.')
            : why,
      );
    },
    [t],
  );
  const goBack = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ pathname: '/(app)/(tabs)/team', params: { half: 'messages' } } as never);
  // Taken out of the group (or off the job's crew) while it is open: say so, and leave.
  const onRemoved = useCallback(() => {
    Alert.alert(t('chat.removedFromConversation', 'You are no longer in this conversation.'));
    goBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);
  // A tab stays mounted when you leave it: the thread is only "open" while this screen is on screen.
  const focused = useIsFocused();
  const thread = useChatThread(meId, onError, onRemoved, focused);
  const { active, open } = thread;
  useEffect(() => {
    openedAt.current = Date.now();
  }, [active?.id]);

  // From a push (?conversationId): found in the person's own list — that is the authorization.
  useEffect(() => {
    if (!params.conversationId) return;
    void chatApi
      .conversations()
      .then((list) => {
        const conv = list.find((x) => x.id === params.conversationId);
        if (conv) void open(conv);
        else onError('load');
      })
      .catch(() => onError('load'));
  }, [params.conversationId, open, onError]);

  const startChat = useCallback(
    async (userId: string) => {
      try {
        setView('thread');
        void open(await chatApi.openDirect(userId));
      } catch {
        setError(t('chat.cannotContact', 'You cannot message this member.'));
      }
    },
    [open, t],
  );
  // A job's chat (from the job page): opened — and on the first open created — online.
  const openedTask = useRef<string | null>(null);
  useEffect(() => {
    const id = params.taskId;
    if (!id || openedTask.current === id) return;
    openedTask.current = id;
    chatApi
      .openTask(id)
      .then((cv) => {
        setView('thread');
        void open(cv);
      })
      .catch(() => setError(t('chat.couldNotOpenJob', "Could not open this job's chat. Check your connection.")));
  }, [params.taskId, open, t]);

  const opened = useRef<string | null>(null);
  useEffect(() => {
    const uid = params.userId;
    if (!uid || uid === meId || opened.current === uid) return;
    opened.current = uid;
    void startChat(uid);
  }, [params.userId, meId, startChat]);

  useEffect(() => {
    if (view === 'contacts')
      chatApi
        .contacts()
        .then(setContacts)
        .catch(() => onError('load'));
  }, [view, onError]);

  const inThread = view === 'thread';
  // The group's own page and "Add people" go back to where they came from inside this screen.
  const back = () => (view === 'add' ? setView('info') : view === 'info' ? setView('thread') : goBack());
  const changed = (cv: ChatConversation) => {
    thread.setActive((old) => (old ? { ...old, ...cv } : cv));
  };
  useEffect(() => {
    navigation.setOptions({ tabBarHidden: inThread } as never);
  }, [navigation, inThread]);

  const shown = thread.messages;
  const lastMineId = useMemo(
    () => [...shown].reverse().find((m) => m.senderId === meId && !m.deletedAt && m.kind !== 'SYSTEM')?.id,
    [shown, meId],
  );
  // A system line stands alone: it never joins a run of somebody's messages.
  const rows = useMemo(() => shown.map((m, i) => ({ m, shape: bubbleShape(shown, i) })).reverse(), [shown]);
  const many = !!active && active.type !== 'DIRECT';
  const receipt = (m: ChatMessage): Receipt | null => receiptFor(active, lastMineId, m, t);
  // A starter tapped in the empty conversation lands in the box, ready to send or change.
  const [seed, setSeed] = useState<{ text: string; at: number } | null>(null);
  const actionsFor = (m: ChatMessage) => () =>
    Alert.alert(t('chat.yourMessage', 'Your message'), undefined, [
      { text: t('chat.edit', 'Edit'), onPress: () => setEditing({ id: m.id, body: m.body }) },
      { text: t('chat.remove', 'Remove'), style: 'destructive', onPress: () => void thread.remove(m.id) },
      { text: t('common.cancel', 'Cancel'), style: 'cancel' },
    ]);

  let body: React.ReactNode;
  if (view === 'group') {
    body = (
      <GroupCreateView
        onCreated={(cv) => {
          setView('thread');
          void open(cv);
        }}
      />
    );
  } else if (view === 'info' && active) {
    body = (
      <GroupInfoView
        conversation={active}
        meId={meId}
        onChanged={changed}
        onLeft={goBack}
        onAdd={() => setView('add')}
      />
    );
  } else if (view === 'add' && active) {
    body = (
      <AddPeopleView
        conversation={active}
        onDone={(cv) => {
          changed(cv);
          setView('info');
        }}
      />
    );
  } else if (view === 'contacts') {
    body = <ChatContactList contacts={contacts} error={error} tabSafe={tabSafe} onPick={(id) => void startChat(id)} />;
  } else {
    body = (
      <>
        {error ? (
          <View style={{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(2) }}>
            <Banner tone="critical" text={error} />
          </View>
        ) : null}
        {rows.length === 0 ? (
          <EmptyConversation conversation={active} onStarter={(text) => setSeed({ text, at: Date.now() })} />
        ) : (
          <ChatMessageList
            rows={rows}
            thread={thread}
            active={active}
            meId={meId}
            many={many}
            openedAt={openedAt}
            receipt={receipt}
            actionsFor={actionsFor}
          />
        )}
        {active && !active.isClosed ? (
          <ChatComposer
            placeholder={t('chat.messagePlaceholder', {
              defaultValue: 'Message {{name}}',
              name: many ? conversationTitle(active, i18n.language) : (active.otherMember?.firstName ?? ''),
            })}
            bottomPad={Math.max(insets.bottom, 8)}
            seed={seed}
            editing={editing}
            onTyping={() => {
              const now = Date.now();
              if (now - typingSent.current > 2000) {
                typingSent.current = now;
                emit('chat_typing', { conversationId: active.id });
              }
            }}
            onSend={async (text, photos) => {
              setError(null);
              const files = photos.length ? await uploadChatPhotos(active.id, photos) : [];
              return thread.send(text, files);
            }}
            onSaveEdit={(id, text) => {
              void thread.edit(id, text);
              setEditing(null);
            }}
            onCancelEdit={() => setEditing(null)}
          />
        ) : active?.isClosed ? (
          <ChatClosedNotice conversation={active} bottomPad={Math.max(insets.bottom, 8)} />
        ) : null}
      </>
    );
  }

  return (
    <Ground style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {inThread ? (
          <ChatThreadHeader
            conversation={active}
            onBack={goBack}
            onMuted={(mutedUntil) => thread.setActive((cv) => (cv ? { ...cv, mutedUntil } : cv))}
            language={i18n.language}
            onInfo={many ? () => setView('info') : undefined}
          />
        ) : (
          <ScreenHeader title={pageTitle(view, active, t, i18n.language)} leading={<HeaderBack onPress={back} />} />
        )}
        {/* A page of this screen (the thread, its info, Add people, New group) slides in when it changes. */}
        <Arrive
          key={view}
          kind={view === 'thread' && !active ? 'fade' : 'right'}
          enabled={view !== 'thread' || !!active}
          style={{ flex: 1 }}
        >
          {body}
        </Arrive>
      </KeyboardAvoidingView>
    </Ground>
  );
}
