import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { formatDistance } from '../../lib/distance';
import { AText, Well, WellDivider, SectionLabel } from '../amazen';
import { JobSheet } from '../job/job-ui';
import { formatDuration } from '@hbcfield/shared/client';
import { noShiftOf, type PlaceRelation, type PlaceTile } from './time-logic';

/**
 * WHERE YOU WORK — one heading line, one row of tiles.
 *
 * ⚠️ IT WAS A LIST THAT GREW WITH THE ROSTER. "Assigned Locations" drew a full
 * row per workspace under the clock, so a member on four sites scrolled past
 * four rows to reach their week. The row here is always one tile tall and
 * slides sideways; the full list is one tap away.
 *
 * The mark on each tile says where the member is AGAINST the site — inside the
 * ring, outside it, or a site with no ring at all — so the tile reads before
 * its words do.
 */
export function TimePlaces({ tiles }: { tiles: readonly PlaceTile[] }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  if (tiles.length === 0) return null;
  return (
    <Well style={{ paddingVertical: amazen.space(3.25), gap: amazen.space(2.5) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: amazen.space(3.5) }}>
        <SectionLabel>{t('time.places.title', 'Where you work')}</SectionLabel>
        {tiles.length > 1 ? (
          <Pressable onPress={() => setAll(true)} hitSlop={10} accessibilityRole="button">
            <AText variant="caption" tone="accent" style={{ fontSize: 12.5 }}>
              {t('time.places.all', { count: tiles.length, defaultValue: 'All {{count}} ›' })}
            </AText>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={172}
        decelerationRate="fast"
        contentContainerStyle={{ gap: amazen.space(2), paddingHorizontal: amazen.space(3.5) }}
      >
        {tiles.map((tile) => <PlaceCard key={tile.location.id} tile={tile} />)}
      </ScrollView>

      <JobSheet visible={all} onClose={() => setAll(false)} title={t('time.places.title', 'Where you work')}>
        <View>
          {tiles.map((tile, i) => (
            <React.Fragment key={tile.location.id}>
              {i > 0 ? <WellDivider /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(3) }}>
                <SiteMark relation={tile.relation} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5 }}>{tile.location.name}</AText>
                  <AText variant="caption" tone="muted" numberOfLines={1}>
                    {tile.location.address || t('time.places.noSite', 'No site drawn · clocks in anywhere')}
                  </AText>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <AText variant="caption" numeric style={{ color: near(tile.relation) ? c.accent : c.inkMuted }}>
                    {relationLabel(t, tile)}
                  </AText>
                  {(() => {
                    const rule = noShiftLabel(t, tile, new Date());
                    return rule ? (
                      <AText variant="caption" style={{ color: rule.stop ? c.critical : c.inkMuted }}>
                        {rule.text}
                      </AText>
                    ) : null;
                  })()}
                </View>
              </View>
            </React.Fragment>
          ))}
        </View>
        <AText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
          {t('time.places.footer', 'Set by your office. Clock in picks the one you are at.')}
        </AText>
      </JobSheet>
    </Well>
  );
}

const near = (r: PlaceRelation) => r === 'here' || r === 'clockedIn';

function relationLabel(t: (k: string, o?: Record<string, unknown>) => string, tile: PlaceTile): string {
  switch (tile.relation) {
    case 'clockedIn': return t('time.places.clockedIn', { defaultValue: 'Clocked in here' });
    case 'here': return t('time.places.here', { defaultValue: 'You are here' });
    case 'away': return t('time.places.away', { defaultValue: '{{distance}} away', distance: formatDistance(tile.metres ?? 0) });
    case 'anywhere': return t('time.places.anywhere', { defaultValue: 'Clocks in anywhere' });
    default: return t('time.places.noFix', { defaultValue: 'Distance unknown' });
  }
}

/** A tile's own no-shift rule, quietly: "2h 42m left", "Limit reached", "Shift only" — or nothing. */
function noShiftLabel(
  t: (k: string, o?: Record<string, unknown>) => string,
  tile: PlaceTile,
  now: Date,
): { text: string; stop: boolean } | null {
  if (tile.relation === 'clockedIn') return null;
  const a = noShiftOf(tile.location, now);
  if (!a) return null;
  if (a.kind === 'limited')
    return {
      text: t('time.places.leftToday', {
        left: formatDuration(a.remainingMinutes),
        defaultValue: '{{left}} left today',
      }),
      stop: false,
    };
  return a.kind === 'refused' && a.reason === 'SHIFT_ONLY'
    ? { text: t('time.places.shiftOnly', { defaultValue: 'Shift only' }), stop: true }
    : { text: t('time.places.limitReached', { defaultValue: 'Limit reached' }), stop: true };
}

function PlaceCard({ tile }: { tile: PlaceTile }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const lead = near(tile.relation);
  const rule = noShiftLabel(t, tile, new Date());
  return (
    <View
      accessible
      accessibilityLabel={[tile.location.name, relationLabel(t, tile), rule?.text].filter(Boolean).join(', ')}
      style={{
        width: 164,
        flexDirection: 'row',
        alignItems: 'center',
        gap: amazen.space(2.5),
        paddingVertical: amazen.space(2.75),
        paddingHorizontal: amazen.space(3),
        borderRadius: 18,
        backgroundColor: lead ? c.accentTint : c.tile,
        borderWidth: 1,
        borderColor: lead ? c.accent : 'transparent',
      }}
    >
      <SiteMark relation={tile.relation} size={32} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 13.5, lineHeight: 18 }}>{tile.location.name}</AText>
        <AText variant="caption" numberOfLines={1} style={{ color: lead ? c.accent : c.inkMuted, fontSize: 11.5 }}>
          {relationLabel(t, tile)}
        </AText>
        {rule ? (
          <AText
            variant="caption"
            numberOfLines={1}
            style={{ color: rule.stop ? c.critical : c.inkMuted, fontSize: 11.5 }}
          >
            {rule.text}
          </AText>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Where you are against the site, drawn: a dot inside the ring (here), a dot
 * outside it (away), a dashed ring (no site — anywhere). One colour, depth
 * from opacity, like every other mark in the app.
 */
function SiteMark({ relation, size }: { relation: PlaceRelation; size: number }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const inside = relation === 'here' || relation === 'clockedIn';
  const ink = inside ? c.accent : c.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      {relation === 'anywhere' ? (
        <>
          <Circle cx={20} cy={20} r={14} fill="none" stroke={ink} strokeOpacity={0.4} strokeWidth={1.6} strokeDasharray="3 4" />
          <Circle cx={20} cy={20} r={3.5} fill={ink} fillOpacity={0.8} />
        </>
      ) : inside ? (
        <>
          <Circle cx={20} cy={20} r={15} fill={ink} fillOpacity={0.12} stroke={ink} strokeWidth={1.6} />
          <Circle cx={20} cy={20} r={4.6} fill={ink} />
        </>
      ) : (
        <>
          <Circle cx={17} cy={23} r={11} fill={ink} fillOpacity={0.06} stroke={ink} strokeOpacity={0.35} strokeWidth={1.6} />
          {relation === 'away' ? (
            <>
              <Path d="M31 10 24 16" stroke={ink} strokeOpacity={0.35} strokeWidth={1.6} strokeDasharray="2 3" strokeLinecap="round" />
              <Circle cx={33.5} cy={7.5} r={3.6} fill={ink} fillOpacity={0.85} />
            </>
          ) : null}
        </>
      )}
    </Svg>
  );
}
