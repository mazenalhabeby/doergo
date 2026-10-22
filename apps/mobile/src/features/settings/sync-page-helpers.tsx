import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { AText, Well, SectionLabel } from '../../components/amazen';

/** SyncPage's module-level helpers, moved here unchanged so its sections can read them too. */
export const STORAGE_WARN_BYTES = 500 * 1024 * 1024;

export const STORAGE_URGENT_BYTES = 1024 * 1024 * 1024;

/** A group of operations: its counted title over a well. */
export function OpSection({ title, tone, children }: { title: string; tone?: 'critical' | 'warn'; children: React.ReactNode }) {
  const { amazen } = useTheme();
  return (
    <>
      <SectionLabel tone={tone} style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(2) }}>{title}</SectionLabel>
      <Well style={{ paddingHorizontal: amazen.space(3.5) }}>{children}</Well>
    </>
  );
}

/** One operation in a group: what it is, something at the right of that line, and what follows under it. */
export function OpRow({ first, title, aside, centered, children }: {
  first: boolean;
  title: string;
  aside: React.ReactNode;
  /** Centre the aside on the title line (a pill), rather than top-align it (a time). */
  centered?: boolean;
  children: React.ReactNode;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={{ paddingVertical: amazen.space(3), gap: 4, borderTopWidth: first ? 0 : 1, borderTopColor: c.lineWell }}>
      <View
        style={{
          flexDirection: 'row',
          ...(centered ? { alignItems: 'center' as const } : null),
          justifyContent: 'space-between',
          gap: 8,
        }}>
        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5, flexShrink: 1 }}>{title}</AText>
        {aside}
      </View>
      {children}
    </View>
  );
}

export function SmallButton({
  label,
  onPress,
  critical,
  accent,
}: {
  label: string;
  onPress: () => void;
  critical?: boolean;
  accent?: boolean;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        borderRadius: amazen.radius.full,
        backgroundColor: accent ? c.accentSolid : c.tile,
        paddingHorizontal: 14,
        paddingVertical: 8,
        opacity: pressed ? 0.8 : 1,
      })}>
      <AText
        variant="caption"
        style={{
          fontSize: 13,
          color: accent ? c.accentInk : critical ? c.critical : c.inkStrong,
          fontFamily: accent ? amazen.font.sansMedium : undefined,
        }}
      >
        {label}
      </AText>
    </Pressable>
  );
}
