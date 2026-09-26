import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { AText, WellDivider } from '../amazen';

/**
 * A way through, at the foot of a well card: a divider, an optional mark, the
 * words, and a chevron. The whole row is the tap target.
 */
export function WellDoor({
  lead, title, detail, onPress, children,
}: {
  lead?: React.ReactNode;
  title?: string;
  detail?: string;
  onPress: () => void;
  /** Custom words, when a title and a detail are not the shape. */
  children?: React.ReactNode;
}) {
  const { amazen } = useTheme();
  return (
    <>
      <WellDivider />
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(1), opacity: pressed ? 0.75 : 1 })}
      >
        {lead}
        <View style={{ flex: 1, minWidth: 0 }}>
          {children ?? (
            <>
              <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14 }}>{title}</AText>
              {/* Two lines, never cut: on a narrow phone the fact at the end is the part that matters. */}
              {detail ? <AText variant="caption" tone="muted" numberOfLines={2}>{detail}</AText> : null}
            </>
          )}
        </View>
        <AText variant="body" tone="muted">›</AText>
      </Pressable>
    </>
  );
}
