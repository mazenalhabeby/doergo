import { memo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { chatDayLabel, type ChatConversation } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { AText } from '@/components/amazen';
import Svg, { Path } from 'react-native-svg';
import { InkIcon } from '@/components/amazen/ink-icon';
import { Arrive } from '@/components/amazen/motion';
import { PersonAvatar } from '../people/person-avatar';

/** What the components of chat-rows.tsx share (moved here unchanged). */
/** A conversation's picture: the person for a direct one, a group or a job mark otherwise. */
export function ConversationAvatar({
  conv,
  size = 44,
  ring,
}: {
  conv: Pick<ChatConversation, 'type' | 'otherMember' | 'isExternal'>;
  size?: number;
  ring?: string;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  if (conv.type === 'DIRECT') {
    return (
      <PersonAvatar
        person={conv.otherMember}
        size={size}
        presence={conv.isExternal ? undefined : (conv.otherMember?.presence ?? null)}
        ring={ring}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.accentTint,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <InkIcon name={conv.type === 'TASK' ? 'job' : 'group'} size={Math.round(size * 0.56)} />
    </View>
  );
}

/** The day a run of messages starts: a small frosted pill, centred. */
export function DayPill({ day }: { day: string }) {
  const { t, i18n } = useTranslation();
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={{ alignItems: 'center', paddingVertical: amazen.space(2.5) }}>
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 3,
          borderRadius: amazen.radius.full,
          backgroundColor: c.glass,
          borderWidth: 1,
          borderColor: c.lineGlass,
        }}
      >
        <AText
          style={{
            fontFamily: amazen.font.mono,
            fontSize: 10,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: c.ink,
          }}
        >
          {chatDayLabel(day, i18n.language, t)}
        </AText>
      </View>
    </View>
  );
}

/** A line the system wrote ("Anna added Karim"): centred, quiet, nobody's bubble. */
export const SystemRow = memo(function SystemRow({
  text,
  day,
  newDay,
  arriving,
}: {
  text: string;
  day: string;
  newDay: boolean;
  arriving?: boolean;
}) {
  const { amazen } = useTheme();
  return (
    <Arrive kind="fade" enabled={!!arriving} style={{ marginVertical: amazen.space(2) }}>
      {newDay ? <DayPill day={day} /> : null}
      <AText
        variant="caption"
        tone="muted"
        style={{ textAlign: 'center', fontSize: 12, lineHeight: 16, marginHorizontal: amazen.space(6) }}
      >
        {text}
      </AText>
    </Arrive>
  );
});

/** ✓ sent, ✓✓ read — drawn, not typed, in the colour of the text it sits in. */
export function Ticks({ read, color }: { read: boolean; color: string }) {
  const tick = 'm1.5 6.5 3 3 6-7';
  return (
    <Svg width={read ? 19 : 13} height={10} viewBox={read ? '0 0 20 12' : '0 0 13 12'}>
      <Path d={tick} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      {read ? (
        <Path
          d="m6.5 6.5 3 3 6-7"
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </Svg>
  );
}

/** Under my newest message: sent or read, and in a group how many have seen it. */
export interface Receipt {
  read: boolean;
  label: string;
}

/** A small mono tag — EXTERNAL in amber, CLOSED quiet. */
export function Tag({ label, tone }: { label: string; tone?: 'warn' }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: tone === 'warn' ? c.warnTint : c.tile }}>
      <AText
        numberOfLines={1}
        style={{
          fontFamily: amazen.font.mono,
          fontSize: 9.5,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: tone === 'warn' ? c.warn : c.ink,
        }}
      >
        {label}
      </AText>
    </View>
  );
}
