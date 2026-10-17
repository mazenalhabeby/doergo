import React, { useMemo, useState } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { NAV_APP_LABELS, type NavApp } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { AText, CardSurface, PrimaryButton } from '../amazen';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { NavigateGlyph } from '../glyphs/work-glyphs';
import { OptimizedGlyph, PlanRouteGlyph } from '../glyphs/route-glyphs';
import { usePitch } from '../../home/pitch';
import { selection } from '../../lib/haptics';
import { lastArrival, legToNext, type DayStop } from '../../lib/route-day';
import { distanceParts, formatDistance } from '../../lib/distance';
import { GlyphTile } from './glyph-tile';
import { hasHour } from './my-work';
import { weekdayName } from '../../lib/app-dates';
import { RouteSketch } from './route-sketch';
import { useRouteDay } from './use-route-day';
import { AHEAD_ROWS, Notice, StopRow, distanceTile, NextStop, MapGlyph, MenuRow } from './next-stop';
import { useRouteCard } from './use-route-card';
import { RouteCardMyRoute } from './route-card-my-route';

/*
  Distances go through the ONE formatter (`lib/distance` → shared): "850 m"
  under a kilometre, "1.2 km", "12 km", "9,631 km", in the member's language.
  The card used to keep its own `km()` that always said km — "0.3 km" for a
  stop round the corner — and its own "~" rule beside it.
*/

/**
 * ⭐ TODAY'S ROUTE — `docs/design/my-route`. The driving day on the home.
 *
 * Every word is the data's: the stops, the counts, the km, the times, the
 * app's name. The planner is opened for one reason only — choosing which
 * stops ("Edit stops" in ⋯).
 */
export function RouteCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const vm = useRouteCard({ style });
  const {
    amazen,
    c,
    t,
    formatClock,
    r,
    menu,
    setMenu,
    choosing,
    setChoosing,
    foldOpen,
    setFoldOpen,
    setShowAll,
    doneIds,
    planned,
    openPlanner,
    tiles,
    rest,
    shownRest,
  } = vm;

  return (
    <View style={style}>
      <RouteCardMyRoute vm={vm} />

      <BlurSheet visible={menu} onClose={() => { setMenu(false); setChoosing(false); }}>
        <SheetPanel onClose={() => { setMenu(false); setChoosing(false); }}>
          {choosing ? (
            <>
              <AText variant="h3" tone="strong" style={{ marginBottom: amazen.space(2) }}>{t('route.chooseApp')}</AText>
              {(r.apps.length ? r.apps.map((a) => a.key) : [r.app]).map((k: NavApp) => (
                <MenuRow key={k} title={NAV_APP_LABELS[k]} detail={k === r.app ? t('routeCard.chosen') : undefined}
                  onPress={() => { r.chooseApp(k); setChoosing(false); setMenu(false); }} Glyph={NavigateGlyph} />
              ))}
            </>
          ) : (
            <>
              {planned ? (
                <MenuRow title={t('routeCard.replan')} detail={t('routeCard.planCost')} Glyph={OptimizedGlyph}
                  onPress={() => { setMenu(false); void r.makePlan(); }} />
              ) : null}
              <MenuRow title={t('routeCard.editStops')} detail={t('routeCard.editStopsWhy')} Glyph={PlanRouteGlyph} onPress={openPlanner} />
              <MenuRow
                title={t('route.chooseApp')}
                detail={NAV_APP_LABELS[r.app]}
                Glyph={NavigateGlyph}
                onPress={() => setChoosing(true)}
              />
            </>
          )}
        </SheetPanel>
      </BlurSheet>
    </View>
  );
}
