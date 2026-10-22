import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { conversationTitle, chatWhenShort, type ChatConversation } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { useTimeFormat } from '@/hooks/use-time-format';
import { AText, WellDivider } from '@/components/amazen';
import { LinearGradient } from 'expo-linear-gradient';
import { Bump } from '@/components/amazen/motion';
import { ConversationAvatar, Tag } from './chat-rows-shared';

/** ConversationRow, moved here unchanged out of chat-rows.tsx. */
/* ---------------- rows: memoised, one per conversation / person / message ---------------- */

/** One conversation, drawing its own slice of the well (rounded at the ends) — so the list can be virtualised. */
export const ConversationRow = memo(function ConversationRow({
  conv: cv,
  first,
  last,
  mine,
  onOpen,
}: {
  conv: ChatConversation;
  first: boolean;
  last: boolean;
  mine: boolean;
  onOpen: (cv: ChatConversation) => void;
}) {
  const { t, i18n } = useTranslation();
  const { hour12 } = useTimeFormat();
  const { amazen } = useTheme();
  const c = amazen.color;
  const unread = cv.unread ?? 0;
  const lastMsg = cv.lastMessage;
  const r = amazen.radius.panel;
  return (
    <View
      style={{
        backgroundColor: c.well,
        paddingHorizontal: amazen.space(3.5),
        borderTopLeftRadius: first ? r : 0,
        borderTopRightRadius: first ? r : 0,
        borderBottomLeftRadius: last ? r : 0,
        borderBottomRightRadius: last ? r : 0,
      }}>
      {first ? null : <WellDivider />}
      <Pressable
        onPress={() => onOpen(cv)}
        accessibilityRole="button"
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: amazen.space(3),
          paddingVertical: amazen.space(2.75),
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <ConversationAvatar conv={cv} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AText
              variant="body"
              tone="strong"
              numberOfLines={1}
              style={{ flexShrink: 1, fontSize: 14.5, fontFamily: unread ? amazen.font.sansMedium : amazen.font.sans }}>
              {conversationTitle(cv, i18n.language)}
            </AText>
            {cv.isExternal ? <Tag label={t('chat.external', 'External')} tone="warn" /> : null}
            {cv.isClosed ? <Tag label={t('chat.closed', 'Closed')} /> : null}
          </View>
          <AText variant="caption" numberOfLines={1} style={{ fontSize: 12.5, color: unread ? c.inkStrong : c.inkMuted }}>
            {lastMsg ? `${mine ? `${t('chat.you', 'You')}: ` : ''}${lastMsg.body}` : t('chat.noMessagesYet', 'No messages yet')}
          </AText>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {cv.lastMessageAt ? (
            <AText variant="caption" tone="muted" numeric style={{ fontSize: 11.5 }}>
              {chatWhenShort(cv.lastMessageAt, i18n.language, hour12, t)}
            </AText>
          ) : null}
          {unread ? (
            <Bump value={unread}>
              <LinearGradient
                colors={amazen.gradient.mine as unknown as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  minWidth: 20,
                  height: 20,
                  borderRadius: 10,
                  paddingHorizontal: 5,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AText variant="caption" numeric style={{ fontSize: 11, color: amazen.gradient.mineInk }}>
                  {String(unread)}
                </AText>
              </LinearGradient>
            </Bump>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
});
