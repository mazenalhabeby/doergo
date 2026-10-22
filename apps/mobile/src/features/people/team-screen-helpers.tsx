import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { chatPresenceLabel, personName } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { type Colleague } from '../../lib/api';
import { AText, WellDivider, RoundButton } from '../../components/amazen';
import { MessagesGlyph } from '../../components/glyphs/glyphs';
import { PersonAvatar } from './person-avatar';
import { TourTarget } from '../tour/tour-target';

/** TeamScreen's module-level helpers, moved here unchanged so its sections can read them too. */
/** The hairline between two people — drawn on the well, so the well has no gap in it. */
export function TeamSeparator() {
  const { amazen } = useTheme();
  return (
    <View style={{ backgroundColor: amazen.color.well, paddingHorizontal: amazen.space(3.5) }}>
      <WellDivider />
    </View>
  );
}

/** One person: their slice of the well, the first and last rounding its corners. */
export const TeamRow = memo(function TeamRow({
  person: x,
  canChat,
  onMessage,
  onOpen,
  first,
  last,
  tour,
}: {
  person: Colleague;
  canChat: boolean;
  onMessage: (id: string) => void;
  /** A tap opens the person (their profile); the round button writes to them. */
  onOpen: (id: string) => void;
  first: boolean;
  last: boolean;
  tour: boolean;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const radius = amazen.radius.panel;
  const row = (
    <Pressable
      onPress={() => onOpen(x.id)}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: amazen.space(3),
        paddingVertical: amazen.space(2.75),
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <PersonAvatar person={x} presence={x.presence} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5 }}>
          {personName(x)}
        </AText>
        <AText variant="caption" tone="muted" numberOfLines={1}>
          {[x.position, x.spaceName].filter(Boolean).join(' · ') || presenceText(x.presence, t)}
        </AText>
      </View>
      {canChat ? (
        <RoundButton
          Glyph={MessagesGlyph}
          tone="jade"
          size={40}
          label={t('team.message', { defaultValue: 'Message {{name}}', name: x.firstName })}
          onPress={() => onMessage(x.id)}
        />
      ) : null}
    </Pressable>
  );
  return (
    <View
      style={{
        backgroundColor: c.well,
        paddingHorizontal: amazen.space(3.5),
        ...(first ? { borderTopLeftRadius: radius, borderTopRightRadius: radius } : null),
        ...(last ? { borderBottomLeftRadius: radius, borderBottomRightRadius: radius } : null),
      }}
    >
      {tour ? <TourTarget name="team-person">{row}</TourTarget> : row}
    </View>
  );
});

/** The shared wording (`chatPresenceLabel`) — the same four words chat uses. */
export function presenceText(p: string | null | undefined, t: import('i18next').TFunction) {
  return chatPresenceLabel(p, t);
}
