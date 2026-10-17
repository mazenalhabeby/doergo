import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { AText, LiveDot } from '../amazen';
import { personInitials } from '@hbcfield/shared/client';

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
  const color = tone === 'accent' ? c.accent : tone === 'warn' ? c.warn : tone === 'critical' ? c.critical : c.inkMuted;
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
  const color = tone === 'accent' ? c.accent : tone === 'warn' ? c.warn : tone === 'critical' ? c.critical : c.lineField;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1.5) }}>
      <LiveDot color={color} live={live} />
      <SectionLabel tone={tone} style={{ flexShrink: 1 }}>{label}</SectionLabel>
    </View>
  );
}

/** Initials in a jade circle — `.av`. */
export function Initials({ first, last, size = 30 }: { first?: string | null; last?: string | null; size?: number }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const text = personInitials({ firstName: first, lastName: last }, '·');
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.accentTint,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <AText variant="caption" tone="accent" style={{ fontSize: 11, fontFamily: amazen.font.sansMedium }}>{text}</AText>
    </View>
  );
}
