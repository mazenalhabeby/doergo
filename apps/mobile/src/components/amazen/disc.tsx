import React from 'react';
import { Pressable, View, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/theme-context';
import { AText } from './text';
import { CountBadge } from './count-badge';
import { shadowDisc, shadowDiscPrimary } from './surfaces';
import type { GlyphProps } from '../glyphs/glyphs';

/**
 * A 58px disc with a label under it.
 *
 * 58 and not 44, because gloves. The label is NEVER optional — an icon does
 * not carry meaning alone, and every mark in this app was drawn on that
 * assumption.
 *
 * ⚠️ Exactly ONE disc in a row is `filled`. Its glow is what marks it primary,
 * not its size and not its position — which is what lets the primary action
 * move (rest overdue offers *Start the rest*, not *Clock out*) without the row
 * re-flowing.
 *
 * ⚠️ `contrast` is the SURFACE the glyph is punched against, not a colour
 * choice. Inside the filled disc that is a lighter jade, NOT the card; on an
 * unfilled one it is the tile composited over whatever is behind. Getting it
 * wrong does not error — it draws a grey ghost across the mark.
 */
export function Disc({
  Glyph,
  label,
  filled = false,
  disabled = false,
  badge,
  onPress,
  /** The surface the row of discs sits on — used to punch unfilled marks. */
  behind,
  style,
}: {
  Glyph: React.ComponentType<GlyphProps>;
  label: string;
  filled?: boolean;
  disabled?: boolean;
  /** An unread count. NEVER a total — see `shift-clock/SPEC.md` §4. */
  badge?: number;
  onPress?: () => void;
  behind?: string;
  style?: ViewStyle;
}) {
  const { amazen, isDark } = useTheme();
  const c = amazen.color;
  const size = amazen.layout.disc;

  // Inside a filled disc the punch is a LIGHTER jade, so the detail reads as
  // cut out of the fill rather than as a hole onto the card.
  const filledContrast = isDark ? '#1fc39c' : '#0f9a7c';
  const restContrast = behind ?? c.well;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        { alignItems: 'center', width: size + 10, opacity: disabled ? 0.45 : pressed ? 0.82 : 1 },
        style,
      ]}
    >
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: amazen.radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          },
          filled
            ? shadowDiscPrimary(c.accentSolid)
            : [{ backgroundColor: c.tile, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: c.lineGlass }, shadowDisc(isDark)],
        ]}
      >
        {filled ? (
          <LinearGradient
            colors={amazen.gradient.primary as unknown as [string, string, ...string[]]}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <Glyph
          size={26}
          color={filled ? c.accentInk : c.inkStrong}
          contrast={filled ? filledContrast : restContrast}
        />
        {badge && badge > 0 ? <CountBadge count={badge} style={{ position: 'absolute', top: 4, right: 4 }} /> : null}
      </View>
      <AText
        variant="caption"
        tone="onGradient"
        numberOfLines={2}
        style={{ marginTop: amazen.space(2), textAlign: 'center' }}
      >
        {label}
      </AText>
    </Pressable>
  );
}

/** A row of discs, gap `space(4)`. */
export function DiscRow({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { amazen } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', gap: amazen.space(4), flexWrap: 'wrap' }, style]}>
      {children}
    </View>
  );
}
