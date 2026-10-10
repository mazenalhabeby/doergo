import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../amazen';

/**
 * One row of the Time tab's lists — a recent shift, a day off coming up: a
 * date tile (a big number over a small mono word), what it was, and whatever
 * the row ends with. Both lists drew this row in full.
 */
export function DateTileRow({
  onPress,
  tileTop,
  tileBottom,
  trailing,
  children,
}: {
  onPress: () => void;
  /** The big figure on the tile — the day of the month. */
  tileTop: ReactNode;
  /** The small word under it — a weekday or a month. */
  tileBottom: ReactNode;
  /** The right end of the row. */
  trailing: ReactNode;
  /** The middle column's lines. */
  children: ReactNode;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(2.5), opacity: pressed ? 0.8 : 1 })}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.tile, alignItems: 'center', justifyContent: 'center' }}>
        <AText variant="body" tone="strong" style={{ fontSize: 17, lineHeight: 20 }}>{tileTop}</AText>
        <AText numberOfLines={1} style={{ fontFamily: amazen.font.mono, fontSize: 9, lineHeight: 12, letterSpacing: 1, color: c.inkMuted, textTransform: 'uppercase' }}>
          {tileBottom}
        </AText>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      {trailing}
    </Pressable>
  );
}
