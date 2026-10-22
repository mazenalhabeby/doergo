import React from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { conversationTitle, chatPresenceLabel, type ChatConversation } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { chatApi } from '../../lib/api';
import { AText, HeaderBack } from '../../components/amazen';
import { presenceKey } from '../people/person-avatar';
import { ConversationAvatar, Tag } from './chat-rows';
import Animated from 'react-native-reanimated';
import { InkIcon } from '../../components/amazen/ink-icon';
import { useIconMotion } from '../../components/amazen/motion';

const HOUR = 3_600_000;

/**
 * The person, not a title: photo, name, whether they are around (tap → their
 * profile), and the conversation's notifications switch.
 */
export function ChatThreadHeader({
  conversation,
  onBack,
  onMuted,
  language,
  onInfo,
}: {
  conversation: ChatConversation | null;
  onBack: () => void;
  onMuted: (mutedUntil: string | null) => void;
  language: string;
  /** A group or a job's chat: tap the title for who is in it. */
  onInfo?: () => void;
}) {
  const { t } = useTranslation();
  const { amazen } = useTheme();
  const c = amazen.color;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const muted = !!conversation?.mutedUntil && Date.parse(conversation.mutedUntil) > Date.now();
  const swing = useIconMotion('swing');
  const other = conversation?.type === 'DIRECT' ? conversation.otherMember : null;

  const setMute = (ms: number | null) => {
    if (!conversation) return;
    chatApi
      .mute(conversation.id, ms ? new Date(Date.now() + ms).toISOString() : null)
      .then((r) => onMuted(r.mutedUntil))
      .catch((e) => Alert.alert(t('common.error', 'Error'), (e as Error).message));
  };
  const muteMenu = () =>
    Alert.alert(
      t('chat.notifications', 'Notifications'),
      undefined,
      muted
        ? [
            { text: t('chat.unmute', 'Turn notifications back on'), onPress: () => setMute(null) },
            { text: t('common.cancel', 'Cancel'), style: 'cancel' },
          ]
        : [
            { text: t('chat.muteHour', 'For 1 hour'), onPress: () => setMute(HOUR) },
            { text: t('chat.muteDay', 'For 8 hours'), onPress: () => setMute(8 * HOUR) },
            { text: t('chat.muteWeek', 'For a week'), onPress: () => setMute(7 * 24 * HOUR) },
            { text: t('chat.muteAlways', 'Until I turn it back on'), onPress: () => setMute(365 * 24 * HOUR) },
            { text: t('common.cancel', 'Cancel'), style: 'cancel' },
          ],
    );

  return (
    /*
      ONE frosted bar: back, the person (in a jade ring), who they are, the bell —
      so the conversation reads as scrolling underneath a single object.
    */
    <View
      style={{
        paddingTop: insets.top + amazen.space(1.5),
        paddingHorizontal: amazen.space(3),
        paddingBottom: amazen.space(2),
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: amazen.space(2.5),
          paddingVertical: 7,
          paddingHorizontal: 8,
          borderRadius: 24,
          backgroundColor: c.glass,
          borderWidth: 1,
          borderColor: c.lineGlass,
          shadowColor: '#0b332a',
          shadowOpacity: 0.12,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 2,
        }}
      >
        <HeaderBack onPress={onBack} />
        {conversation ? (
          <>
            <Pressable
              style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: amazen.space(3) }}
              disabled={onInfo ? false : !other || conversation.isExternal}
              accessibilityRole="button"
              onPress={() =>
                onInfo
                  ? onInfo()
                  : other && router.push({ pathname: '/(app)/person/[id]', params: { id: other.id } } as never)
              }
            >
              <View style={{ padding: 2, borderRadius: 24, borderWidth: 2, borderColor: c.accentTint }}>
                <ConversationAvatar conv={conversation} size={38} ring={c.well} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AText
                    variant="h3"
                    tone="strong"
                    numberOfLines={1}
                    style={{ flexShrink: 1, fontSize: 16, lineHeight: 21 }}
                  >
                    {conversationTitle(conversation, language)}
                  </AText>
                  {conversation.isExternal ? <Tag label={t('chat.external', 'External')} tone="warn" /> : null}
                </View>
                <AText
                  variant="caption"
                  numberOfLines={1}
                  style={{
                    color:
                      other &&
                      !conversation.isExternal &&
                      presenceKey(conversation.otherMember?.presence) === 'AVAILABLE'
                        ? c.accent
                        : c.inkOnGlass,
                  }}
                >
                  {conversation.type === 'TASK'
                    ? t('chat.taskChat', 'Job chat · the crew and the office')
                    : conversation.type === 'GROUP'
                      ? t('chat.peopleCount', {
                          count: conversation.members?.length ?? 0,
                          defaultValue: '{{count}} people',
                        })
                      : conversation.isExternal
                        ? t('chat.externalMember', 'At another organization')
                        : chatPresenceLabel(conversation.otherMember?.presence, t)}
                </AText>
              </View>
            </Pressable>
            <Pressable
              onPressIn={swing.play}
              onPress={muteMenu}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={
                muted ? t('chat.muted', 'Notifications off') : t('chat.mute', 'Turn notifications off')
              }
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.tile,
              }}
            >
              <Animated.View style={[{ transformOrigin: '50% 10%' }, swing.style]}>
                <InkIcon name={muted ? 'bellOff' : 'bell'} size={23} />
              </Animated.View>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}
