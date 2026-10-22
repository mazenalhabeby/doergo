import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { useTimeFormat } from '@/hooks/use-time-format';
import { AText } from '@/components/amazen';
import { NavigateGlyph } from '@/components/glyphs/work-glyphs';
import { legToNext, type DayStop } from '@/lib/route-day';
import { distanceParts, formatDistance } from '@/lib/distance';
import { GlyphTile } from './glyph-tile';
import type { GlyphProps } from '@/components/glyphs/glyphs';
import { hasHour } from './my-work';
import { useRouteDay } from './use-route-day';

/** At most this many stops after the next one; the rest behind "+N more" (SPEC §7). */
export const AHEAD_ROWS = 3;

export function Notice({ text, warn }: { text: string; warn?: boolean }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 8,
        borderRadius: 12,
        paddingHorizontal: 11,
        paddingVertical: 9,
        backgroundColor: warn ? c.warnTint : c.tile,
      }}
    >
      <View
        style={{ width: 7, height: 7, borderRadius: 4, marginTop: 6, backgroundColor: warn ? c.warn : c.inkMuted }}
      />
      <AText variant="caption" style={{ flex: 1, fontSize: 12.5, lineHeight: 17, color: warn ? c.inkStrong : c.ink }}>
        {text}
      </AText>
    </View>
  );
}

export function Marker({ kind, n }: { kind: 'done' | 'ahead' | 'none' | 'next'; n?: number }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const base = {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  if (kind === 'next')
    return (
      <View style={[base, { backgroundColor: c.accentSolid }]}>
        <AText variant="caption" numeric style={{ color: c.accentInk }}>
          {n}
        </AText>
      </View>
    );
  if (kind === 'done')
    return (
      <View style={[base, { backgroundColor: c.tile }]}>
        <AText variant="caption" tone="muted">
          ✓
        </AText>
      </View>
    );
  return (
    <View
      style={[
        base,
        {
          borderWidth: 1.6,
          borderColor: kind === 'none' ? c.lineGlass : `${c.ink}88`,
          borderStyle: kind === 'none' ? 'dashed' : 'solid',
        },
      ]}
    >
      <AText variant="caption" tone="ink" numeric>
        {kind === 'none' ? '·' : n}
      </AText>
    </View>
  );
}

export function StopRow({
  s,
  marker,
  n,
  onDrive,
}: {
  s: DayStop;
  marker: 'done' | 'ahead' | 'none';
  n?: number;
  onDrive: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { formatClock } = useTimeFormat();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: c.lineWell,
        opacity: marker === 'done' ? 0.6 : 1,
      }}
    >
      <Marker kind={marker} n={n} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14, lineHeight: 19 }}>
          {s.label}
        </AText>
        {s.address ? (
          <AText variant="caption" tone="muted" numberOfLines={1}>
            {s.address}
          </AText>
        ) : null}
      </View>
      {hasHour(s.at) ? (
        <AText variant="caption" tone="muted" numeric style={{ fontSize: 11.5 }}>
          {formatClock(s.at!)}
        </AText>
      ) : null}
      <DriveDisc label={t('routeCard.driveTo', { name: s.label })} onPress={onDrive} />
    </View>
  );
}

/** A figure tile for a distance: the number big, its unit ("m" / "km") small. */
export function distanceTile(
  metres: number | null | undefined,
  approx: boolean,
  l: string,
): { v: string; unit?: string; l: string } {
  const p = distanceParts(metres, { approx });
  return p ? { v: p.text, unit: p.unit, l } : { v: '—', l };
}

/** The next stop, one row: its number, name, time · km · minutes, and the drive button. */
export function NextStop({
  s,
  n,
  route,
  from,
  straight,
  onDrive,
}: {
  s: DayStop;
  n: number;
  route: ReturnType<typeof useRouteDay>['route'];
  from: ReturnType<typeof useRouteDay>['position'];
  straight: boolean;
  onDrive: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { formatClock } = useTimeFormat();
  // ⚠️ Never the leg out of a start the driver has left — see `legToNext` (the 1701 km bug).
  const leg = legToNext(route, s, from);
  const facts = [
    hasHour(s.at) ? formatClock(s.at!) : null,
    leg ? formatDistance(leg.meters, { approx: straight || leg.estimated }) : null,
    leg && leg.seconds != null && !straight ? t('routeCard.minutes', { count: Math.round(leg.seconds / 60) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={onDrive}
      accessibilityRole="button"
      accessibilityLabel={t('routeCard.driveTo', { name: s.label })}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 18,
        padding: 12,
        backgroundColor: c.tile,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Marker kind="next" n={n} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText variant="eyebrow" tone="accent" style={{ fontSize: 9.5 }}>
          {t('routeCard.nextStop')}
        </AText>
        <AText
          variant="body"
          tone="strong"
          numberOfLines={1}
          style={{ fontSize: 15, lineHeight: 20, fontFamily: amazen.font.sansMedium }}
        >
          {s.label}
        </AText>
        {facts ? (
          <AText variant="caption" tone="muted" numberOfLines={1}>
            {facts}
          </AText>
        ) : null}
      </View>
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: c.accentSolid,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <NavigateGlyph size={20} color={c.accentInk} contrast={c.accentSolid} />
      </View>
    </Pressable>
  );
}

export function MapGlyph({ color }: { color: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M9 3 3 5.5v15.5l6-2.5 6 2.5 6-2.5V3l-6 2.5zM9 5.2l6 2.5v11.1l-6-2.5z" fill={color} />
    </Svg>
  );
}

export function DriveDisc({ label, onPress }: { label: string; onPress: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <GlyphTile
        Glyph={NavigateGlyph}
        color={c.accent}
        tint={c.tile}
        behind={c.well}
        size={32}
        glyphSize={16}
        radius={16}
      />
    </Pressable>
  );
}

export function MenuRow({
  title,
  detail,
  Glyph,
  onPress,
}: {
  title: string;
  detail?: string;
  Glyph: React.ComponentType<GlyphProps>;
  onPress: () => void;
}) {
  const { amazen, colors } = useTheme();
  const c = amazen.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: amazen.space(3),
        paddingVertical: amazen.space(3),
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <GlyphTile Glyph={Glyph} color={c.ink} tint={c.tile} behind={colors.card} size={34} glyphSize={19} />
      <View style={{ flex: 1 }}>
        <AText variant="body" tone="strong" style={{ fontSize: 15 }}>
          {title}
        </AText>
        {detail ? (
          <AText variant="caption" tone="muted">
            {detail}
          </AText>
        ) : null}
      </View>
    </Pressable>
  );
}
