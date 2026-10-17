import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  conversationTitle,
  personName,
  chatDayLabel,
  chatTime,
  chatWhenShort,
  type ChatAttachment,
  type ChatConversation,
  type ChatUserRef,
} from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { AText, WellDivider } from '../amazen';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { InkIcon } from '../amazen/ink-icon';
import { Arrive, Bump, useIconMotion } from '../amazen/motion';
import { PersonAvatar } from '../people/person-avatar';
import { ChatFiles } from './chat-files';
import { ConversationAvatar, DayPill, Ticks, type Receipt, Tag } from './chat-rows-shared';
export { SendButton } from './send-button';
export { ContactRow } from './contact-row';
export { ConversationRow } from './conversation-row';
export { ConversationAvatar, type Receipt, Tag, SystemRow } from './chat-rows-shared';

/**
 * One bubble. Primitives only, so an appended message redraws one row, not the thread.
 * Mine: the theme's jade (`gradient.mine`) with its own ink. Theirs: a card.
 * The time and the ticks sit INSIDE the bubble, on the last of a run.
 */
export const MessageRow = memo(function MessageRow({
  body,
  at,
  day,
  mine,
  pending,
  newDay,
  grouped,
  lastOfGroup,
  attachments,
  removed,
  edited,
  receipt,
  onLongPress,
  senderName,
  arriving,
}: {
  /** Arrived while the thread is open: mine rises from the box, theirs pops in. */
  arriving?: boolean;
  body: string;
  at: string;
  day: string;
  mine: boolean;
  pending: boolean;
  newDay: boolean;
  grouped: boolean;
  lastOfGroup: boolean;
  /** In a group or a job's chat: whose message, over the first of their run. */
  senderName?: string | null;
  attachments?: ChatAttachment[];
  removed?: boolean;
  edited?: boolean;
  receipt?: Receipt | null;
  onLongPress?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { hour12 } = useTimeFormat();
  const { amazen } = useTheme();
  const c = amazen.color;
  const g = amazen.gradient;
  const ink = removed ? c.inkMuted : mine ? g.mineInk : c.inkStrong;
  const metaInk = mine && !removed ? `${g.mineInk}b3` : c.inkMuted;
  const showMeta = lastOfGroup || pending || !!receipt;
  const r = 20;
  const radius = mine
    ? { borderRadius: r, borderTopRightRadius: grouped ? 6 : r, borderBottomRightRadius: lastOfGroup ? 6 : r }
    : { borderRadius: r, borderTopLeftRadius: grouped ? 6 : r, borderBottomLeftRadius: lastOfGroup ? 6 : r };
  const meta = showMeta ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 3 }}>
      <AText numeric style={{ fontFamily: amazen.font.mono, fontSize: 10, color: pending ? c.warn : metaInk }}>
        {pending
          ? `◷ ${t('offline.chip.waiting')}`
          : [chatTime(at, i18n.language, hour12), edited && !removed ? t('chat.edited', 'edited') : null]
              .filter(Boolean)
              .join(' · ')}
      </AText>
      {receipt && !pending ? <Ticks read={receipt.read} color={metaInk} /> : null}
    </View>
  ) : null;
  const content = removed ? (
    <AText variant="body" style={{ fontSize: 14, fontStyle: 'italic', color: ink }}>
      {t('chat.removed', 'Message removed')}
    </AText>
  ) : (
    <>
      {body ? (
        <AText variant="body" style={{ fontSize: 14.5, lineHeight: 20, color: ink }}>
          {body}
        </AText>
      ) : null}
      {attachments?.length ? <ChatFiles items={attachments} /> : null}
    </>
  );
  return (
    <Arrive kind={mine ? 'sent' : 'pop'} enabled={!!arriving} style={{ marginTop: grouped ? 2 : 6 }}>
      {newDay ? <DayPill day={day} /> : null}
      {senderName && !mine && !grouped ? (
        <AText variant="caption" style={{ fontSize: 11.5, color: c.accent, marginLeft: 10, marginBottom: 2 }}>
          {senderName}
        </AText>
      ) : null}
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={350}
        disabled={!onLongPress}
        accessibilityLabel={receipt ? `${body} · ${receipt.label}` : undefined}
        style={({ pressed }) => ({
          alignSelf: mine ? 'flex-end' : 'flex-start',
          maxWidth: '80%',
          overflow: 'hidden',
          ...radius,
          backgroundColor: removed ? 'transparent' : mine ? g.mine[1] : c.well,
          borderWidth: removed || !mine ? 1 : 0,
          borderColor: removed ? c.lineWell : c.lineGlass,
          borderStyle: removed ? 'dashed' : 'solid',
          opacity: pressed ? 0.9 : 1,
          ...(removed
            ? null
            : {
                shadowColor: '#0b332a',
                shadowOpacity: 0.12,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: 1,
              }),
        })}
      >
        {mine && !removed ? (
          <LinearGradient
            colors={g.mine as unknown as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingHorizontal: 13, paddingTop: 9, paddingBottom: showMeta ? 6 : 9 }}
          >
            {content}
            {meta}
          </LinearGradient>
        ) : (
          <View style={{ paddingHorizontal: 13, paddingTop: 9, paddingBottom: showMeta ? 6 : 9 }}>
            {content}
            {meta}
          </View>
        )}
      </Pressable>
    </Arrive>
  );
});
