import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { conversationTitle, type ChatConversation } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../../components/amazen';
import { ConversationAvatar } from './chat-rows';
import { Arrive } from '../../components/amazen/motion';

/** The empty conversation — moved here unchanged from chat-screen.tsx. */

/**
 * Nothing said yet: the person in a soft jade halo, and a few starters one tap
 * away (they land in the box — nothing is sent until you press Send).
 */
export function EmptyConversation({
  conversation,
  onStarter,
}: {
  conversation: ChatConversation | null;
  onStarter: (text: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { amazen } = useTheme();
  const c = amazen.color;
  if (!conversation) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.inkMuted} />
      </View>
    );
  }
  const direct = conversation.type === 'DIRECT';
  const first = direct ? (conversation.otherMember?.firstName ?? '') : conversationTitle(conversation, i18n.language);
  const starters = [
    direct
      ? t('chat.starter.hi', { defaultValue: 'Hi {{name}} 👋', name: first })
      : t('chat.starter.hiAll', 'Hi everyone 👋'),
    t('chat.starter.onMyWay', 'On my way'),
    t('chat.starter.callMe', 'Can you call me?'),
  ];
  return (
    <Arrive
      kind="fade"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: amazen.space(2.5),
        paddingHorizontal: amazen.space(6),
      }}
    >
      <View
        style={{
          width: 104,
          height: 104,
          borderRadius: 52,
          backgroundColor: c.accentTint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ConversationAvatar conv={conversation} size={76} ring={c.canvas} />
      </View>
      <AText variant="h3" tone="strong" style={{ textAlign: 'center' }}>
        {direct
          ? t('chat.sayHelloTo', { defaultValue: 'Say hello to {{name}}', name: first })
          : t('chat.sayHello', 'Say hello')}
      </AText>
      {direct && conversation.otherMember?.position ? (
        <AText variant="caption" tone="onGlass" style={{ textAlign: 'center' }}>
          {conversation.otherMember.position}
        </AText>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: amazen.space(1.5),
          marginTop: amazen.space(1),
        }}
      >
        {starters.map((s, i) => (
          <Arrive key={s} kind="up" delay={120 + i * 60}>
            <Pressable
              onPress={() => onStarter(s)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                paddingHorizontal: 13,
                paddingVertical: 8,
                borderRadius: amazen.radius.full,
                backgroundColor: c.glass,
                borderWidth: 1,
                borderColor: c.lineGlass,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <AText variant="caption" tone="strong" style={{ fontSize: 13 }}>
                {s}
              </AText>
            </Pressable>
          </Arrive>
        ))}
      </View>
    </Arrive>
  );
}
