import React, { memo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@/contexts/theme-context';
import { AText } from '@/components/amazen';

/**
 * One row of a list drawn as ONE well — `first` rounds the top, `last` the
 * bottom — so a FlatList can recycle rows and the list still reads as a card.
 * The client book's row draws itself the same way; this is that slice for the
 * equipment register and the client requests, which carry no avatar.
 */
export const WellRow = memo(function WellRow({
  first, last, leading, title, detail, trailing, onPress, a11yLabel,
}: {
  first: boolean;
  last: boolean;
  /** A dot, an icon tile — what tells rows apart at a glance. */
  leading?: ReactNode;
  title: string;
  detail?: string;
  /** A pill or a state; a chevron when nothing is given. */
  trailing?: ReactNode;
  onPress: () => void;
  a11yLabel?: string;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const r = amazen.radius.panel;
  return (
    <View style={{
      backgroundColor: c.well, paddingHorizontal: amazen.space(3.5),
      borderTopLeftRadius: first ? r : 0, borderTopRightRadius: first ? r : 0,
      borderBottomLeftRadius: last ? r : 0, borderBottomRightRadius: last ? r : 0,
      paddingTop: first ? amazen.space(1) : 0, paddingBottom: last ? amazen.space(1) : 0,
    }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel ?? [title, detail].filter(Boolean).join(', ')}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(3),
          borderTopWidth: first ? 0 : 1, borderTopColor: c.lineWell, opacity: pressed ? 0.75 : 1,
        })}
      >
        {leading}
        <View style={{ flex: 1, minWidth: 0 }}>
          <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5 }}>{title}</AText>
          {detail ? <AText variant="caption" numberOfLines={1} style={{ color: c.inkMuted }}>{detail}</AText> : null}
        </View>
        {trailing ?? <AText variant="body" tone="muted">›</AText>}
      </Pressable>
    </View>
  );
});

/** The status of a record as a dot — the same three colours everywhere. */
export function StatusDot({ status }: { status: string }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const color = status === 'ACTIVE' ? c.accent : status === 'MAINTENANCE' ? c.warn : c.inkMuted;
  return <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />;
}
