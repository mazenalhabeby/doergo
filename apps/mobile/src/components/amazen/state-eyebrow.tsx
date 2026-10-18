import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { AText } from './text';
import { Monogram } from './monogram';
import { LiveDot } from './live-dot';
import { toneColor } from '../../theme/tone-color';

/** The mockup's mono eyebrow — `.ey`. */
export function SectionLabel({
  children,
  tone = 'muted',
  style,
}: {
  children: ReactNode;
  tone?: 'muted' | 'accent' | 'warn' | 'critical';
  style?: StyleProp<ViewStyle>;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const color = toneColor(c, tone, c.inkMuted);
  return (
    <View style={style}>
      <AText
        numberOfLines={1}
        style={{
          color,
          fontFamily: amazen.font.mono,
          fontSize: 10.5,
          lineHeight: 14,
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}
      >
        {children}
      </AText>
    </View>
  );
}

/**
 * A dot and a mono line — "● ON THE CLOCK · HBC OFFICE". What the thing is doing
 * and where, above a sheet's title. The dot breathes only while `live`.
 */
export function StateEyebrow({
  label,
  tone = 'muted',
  live = false,
}: {
  label: string;
  tone?: 'muted' | 'accent' | 'warn' | 'critical';
  live?: boolean;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const color = toneColor(c, tone, c.lineField);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1.5) }}>
      <LiveDot color={color} live={live} />
      <SectionLabel tone={tone} style={{ flexShrink: 1 }}>{label}</SectionLabel>
    </View>
  );
}

/** Initials in a jade circle — `.av`. The Monogram, named for the job page's callers. */
export function Initials({ first, last, size = 30 }: { first?: string | null; last?: string | null; size?: number }) {
  return <Monogram name={{ firstName: first, lastName: last }} size={size} />;
}
