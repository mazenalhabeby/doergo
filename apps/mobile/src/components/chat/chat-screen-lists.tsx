import React from 'react';
import { ActivityIndicator, FlatList, SectionList, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  chatSystemLine,
  mayChangeMessage,
  type ChatConversation,
  type ChatMessage,
  type ChatUserRef,
} from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../amazen';
import { Banner, SectionLabel } from '../job/job-ui';
import { presenceKey } from '../people/person-avatar';
import type { bubbleShape } from './live-thread';
import { ContactRow, MessageRow, SystemRow, type Receipt } from './chat-rows';
import { Arrive, WaveDots } from '../amazen/motion';
import type { useChatThread } from './use-chat-thread';

/** The lists and the closed notice of `ChatScreen` — moved here unchanged; values the screen works out come in as props. */

/** "New message": who can be messaged, the ones available now first. */
export function ChatContactList({
  contacts,
  error,
  tabSafe,
  onPick,
}: {
  contacts: ChatUserRef[];
  error: string | null;
  tabSafe: number;
  onPick: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { amazen } = useTheme();
  const avail = contacts.filter((u) => presenceKey(u.presence) === 'AVAILABLE');
  const rest = contacts.filter((u) => presenceKey(u.presence) !== 'AVAILABLE');
  const sections = [
    { key: 'avail', title: t('chat.availableNow', 'Available'), data: avail },
    { key: 'rest', title: t('chat.everyoneElse', 'Everyone else'), data: rest },
  ].filter((g) => g.data.length > 0);
  return (
    <SectionList
      sections={sections}
      keyExtractor={(u) => u.id}
      stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: amazen.space(4), paddingBottom: tabSafe }}
      initialNumToRender={16}
      ListHeaderComponent={
        error ? (
          <View style={{ marginBottom: amazen.space(3) }}>
            <Banner tone="critical" text={error} />
          </View>
        ) : null
      }
      ListEmptyComponent={
        <AText variant="caption" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(6) }}>
          {t('chat.noContacts', 'Nobody to message yet.')}
        </AText>
      }
      renderSectionHeader={({ section }) => (
        <SectionLabel
          style={{
            paddingHorizontal: amazen.space(1),
            marginBottom: amazen.space(2),
            marginTop: section.key === sections[0]?.key ? 0 : amazen.space(3),
          }}
        >
          {section.title}
        </SectionLabel>
      )}
      renderItem={({ item, index, section }) => (
        <ContactRow person={item} first={index === 0} last={index === section.data.length - 1} onPick={onPick} />
      )}
    />
  );
}

export type ChatRow = { m: ChatMessage; shape: ReturnType<typeof bubbleShape> };

/** The conversation itself, newest at the bottom. */
export function ChatMessageList({
  rows,
  thread,
  active,
  meId,
  many,
  openedAt,
  receipt,
  actionsFor,
}: {
  rows: ChatRow[];
  thread: ReturnType<typeof useChatThread>;
  active: ChatConversation | null;
  meId: string | undefined;
  many: boolean;
  openedAt: React.MutableRefObject<number>;
  receipt: (m: ChatMessage) => Receipt | null;
  actionsFor: (m: ChatMessage) => () => void;
}) {
  const { t } = useTranslation();
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    // INVERTED: the newest message is row 0, at the bottom; scrolling up reaches the end of the list and loads older pages.
    <FlatList
      inverted
      data={rows}
      keyExtractor={(r) => r.m.id}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: amazen.space(4), paddingTop: amazen.space(3) }}
      initialNumToRender={20}
      maxToRenderPerBatch={20}
      windowSize={11}
      onEndReached={() => void thread.loadOlder()}
      onEndReachedThreshold={0.3}
      ListFooterComponent={
        thread.loadingOlder ? <ActivityIndicator style={{ marginVertical: 10 }} color={c.inkMuted} /> : null
      }
      ListHeaderComponent={
        thread.peerTyping ? (
          <Arrive
            kind="pop"
            style={{
              alignSelf: 'flex-start',
              paddingHorizontal: 14,
              paddingVertical: 13,
              borderRadius: 18,
              borderBottomLeftRadius: 6,
              backgroundColor: c.well,
              marginTop: 3,
            }}
          >
            <View accessibilityLabel={`${active?.otherMember?.firstName ?? ''} ${t('chat.typing', 'is typing…')}`}>
              <WaveDots color={c.inkMuted} />
            </View>
          </Arrive>
        ) : null
      }
      renderItem={({ item }) =>
        item.m.kind === 'SYSTEM' ? (
          <SystemRow
            day={item.m.createdAt}
            newDay={item.shape.newDay}
            arriving={Date.parse(item.m.createdAt) >= openedAt.current - 1500}
            text={(() => {
              const line = chatSystemLine(item.m.meta, meId, t('chat.you', 'You'));
              return line ? t(`chat.system.${line.key}`, line.values) : '';
            })()}
          />
        ) : (
          <MessageRow
            arriving={
              !!(item.m as { pendingSync?: boolean }).pendingSync ||
              Date.parse(item.m.createdAt) >= openedAt.current - 1500
            }
            senderName={many ? (item.m.sender?.firstName ?? null) : null}
            body={item.m.body}
            at={item.m.sentAt ?? item.m.createdAt}
            day={item.m.createdAt}
            mine={item.m.senderId === meId}
            pending={!!(item.m as { pendingSync?: boolean }).pendingSync}
            newDay={item.shape.newDay}
            grouped={item.shape.grouped}
            lastOfGroup={item.shape.lastOfGroup}
            attachments={item.m.attachments}
            removed={!!item.m.deletedAt}
            edited={!!item.m.editedAt}
            receipt={receipt(item.m)}
            onLongPress={mayChangeMessage(item.m, meId) ? actionsFor(item.m) : undefined}
          />
        )
      }
    />
  );
}

/** A conversation that can no longer be written in: say why, keep it readable. */
export function ChatClosedNotice({ conversation, bottomPad }: { conversation: ChatConversation; bottomPad: number }) {
  const { t } = useTranslation();
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View
      style={{
        marginHorizontal: amazen.space(4),
        marginBottom: bottomPad,
        borderRadius: 16,
        padding: amazen.space(3.5),
        backgroundColor: c.tile,
      }}
    >
      <AText variant="caption" tone="ink" style={{ fontSize: 13, lineHeight: 18 }}>
        {conversation.type === 'TASK'
          ? t('chat.taskChatClosed', 'This job is over, so its chat is closed. You can still read what was said.')
          : t(
              'chat.conversationClosed',
              'This workspace is no longer shared, so this conversation is closed. You can still read what was said.',
            )}
      </AText>
    </View>
  );
}
