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
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const router = useRouter();
  const { formatClock } = useTimeFormat();
  const r = useRouteDay();
  const [menu, setMenu] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [foldOpen, setFoldOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  usePitch(r.state === 'none' ? { need: 0, line: t('routeCard.pitchNone') }
    : { need: 0, line: t('routeCard.pitch', { count: r.ahead.length || r.stops.length }) });

  const doneIds = useMemo(() => new Set(r.done.map((s) => s.id)), [r.done]);
  const planned = r.ordered.length > 0;
  const openPlanner = () => { setMenu(false); router.push('/(app)/route-planner' as Href); };

  const tiles: { v: string; unit?: string; l: string }[] = r.state === 'finished'
    ? [
      { v: String(r.ordered.length), unit: t('routeCard.ofN', { count: r.ordered.length }), l: t('routeCard.stopsDone') },
      distanceTile(r.route ? r.route.totalMeters : null, false, t('routeCard.driven')),
      { v: lastArrival(r.done) ? formatClock(lastArrival(r.done)!) : '—', l: t('routeCard.backAt') },
    ]
    : !planned
      ? [
        { v: String(r.stops.length), l: t('routeCard.stops', { count: r.stops.length }) },
        { v: '—', l: t('routeCard.noPlanYet') },
        { v: hasHour(r.stops[0]?.at) ? formatClock(r.stops[0]!.at!) : '—', l: t('routeCard.firstJob') },
      ]
      : [
        { v: String(r.ahead.length), l: r.done.length ? t('routeCard.left') : t('routeCard.stops', { count: r.ahead.length }) },
        distanceTile(r.figures.metresToGo, r.straight || r.figures.estimated, r.straight ? t('routeCard.straightLine') : t('routeCard.toGo')),
        { v: r.figures.backBy ? formatClock(r.figures.backBy) : '—', l: t('routeCard.backBy') },
      ];

  const rest = planned ? r.ahead.slice(1) : r.stops;
  const shownRest = showAll ? rest : rest.slice(0, planned ? AHEAD_ROWS : AHEAD_ROWS + 1);

  return (
    <View style={style}>
      <CardSurface style={{ padding: amazen.space(4), gap: amazen.space(3) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <AText variant="h3" tone="strong" style={{ flex: 1 }}>{t('widgets.myRoute')}</AText>
          {r.state !== 'none' ? (
            <Pressable onPress={openPlanner} hitSlop={6} accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, height: 32, borderRadius: 16, backgroundColor: c.tile, borderWidth: 1, borderColor: c.lineGlass, marginRight: 8, opacity: pressed ? 0.75 : 1 })}>
              <MapGlyph color={c.accent} />
              <AText variant="caption" tone="ink" style={{ fontSize: 12.5 }}>{t('routeCard.openMapShort')}</AText>
            </Pressable>
          ) : null}
          {r.state !== 'none' ? (
            <Pressable onPress={() => setMenu(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('routeCard.more')}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.tile, alignItems: 'center', justifyContent: 'center' }}>
              <AText variant="body" tone="ink">⋯</AText>
            </Pressable>
          ) : null}
        </View>

        {/*
          ⚠️ NO DRAWING WITHOUT A ROUTE. An empty sketch the size of a map read as
          something broken. Nothing to draw → a short line and, when there is
          one, the next day there is driving.
        */}
        {r.state !== 'none' ? (
          <RouteSketch route={r.route} stops={r.stops} ordered={r.ordered} doneIds={doneIds} nextId={r.next?.id ?? null} position={r.position} onOpen={openPlanner} />
        ) : null}

        {r.state === 'none' && !r.loaded ? (
          /* Not an answer yet — the jobs are still on their way. A quiet line, never "nothing to drive". */
          <View style={{ height: 52, borderRadius: 16, backgroundColor: c.tile, opacity: 0.6 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        ) : r.state === 'none' ? (
          <View style={{ gap: amazen.space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3.5) }}>
              <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: c.accentTint, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={26} height={26} viewBox="0 0 24 24">
                  <Path d="M5 19c3-6 6-2 8-7s4-6 6-7" fill="none" stroke={c.accent} strokeWidth={2} strokeLinecap="round" strokeDasharray="1 4" />
                  <Circle cx={5} cy={19} r={2.4} fill={c.accent} />
                  <Circle cx={19} cy={5} r={2.4} fill={c.accent} />
                </Svg>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AText variant="body" tone="strong" numberOfLines={1}>{r.nextDay ? t('routeCard.noneToday') : t('routeCard.noneAtAll')}</AText>
                <AText variant="caption" tone="muted" numberOfLines={2}>
                  {r.nextDay ? t('routeCard.nextDriveDay', { day: weekdayName(r.nextDay.day, 'long') }) : t('routeCard.noneAtAllWhy')}
                </AText>
              </View>
            </View>
            {r.nextDay ? (
              <Pressable onPress={openPlanner} accessibilityRole="button"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), borderRadius: 16, backgroundColor: c.tile, padding: amazen.space(3), opacity: pressed ? 0.85 : 1 })}>
                <View style={{ width: 44, alignItems: 'center' }}>
                  <AText variant="h3" tone="strong" numeric style={{ fontSize: 20, lineHeight: 24 }}>{String(r.nextDay.day.getDate())}</AText>
                  <AText variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>{weekdayName(r.nextDay.day, 'short')}</AText>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14 }}>
                    {r.nextDay.stops[0]?.at && hasHour(r.nextDay.stops[0].at)
                      ? t('routeCard.nextStops', { count: r.nextDay.stops.length, time: formatClock(new Date(r.nextDay.stops[0].at)) })
                      : t('routeCard.nextStopsNoTime', { count: r.nextDay.stops.length })}
                  </AText>
                  <AText variant="caption" tone="muted" numberOfLines={1}>{r.nextDay.stops[0]?.label}</AText>
                </View>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {tiles.map((x, i) => (
                <View key={i} style={{ flex: 1, borderRadius: 14, backgroundColor: c.tile, paddingHorizontal: 11, paddingVertical: 10 }}>
                  {/* One line whatever the figure — a long distance shrinks rather than breaking across lines. */}
                  <AText variant="decimal" tone="strong" numeric numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 22, lineHeight: 27 }}>
                    {x.v}{x.unit ? <AText variant="caption" tone="muted">{` ${x.unit}`}</AText> : null}
                  </AText>
                  <AText variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 11 }}>{x.l}</AText>
                </View>
              ))}
            </View>

            {r.carried > 0 && r.state !== 'finished' ? <Notice text={t('routeCard.carried', { count: r.carried })} /> : null}
            {r.straight && r.state !== 'finished' ? <Notice warn text={t('route.estimatedOnly')} /> : null}
            {r.state === 'noLocation' ? <Notice text={t('routeCard.noLocation')} /> : null}
            {r.failed ? <Notice warn text={t('routeCard.planFailed')} /> : null}
            {planned && r.unplanned.length ? (
              /* ⚠️ A job added after the plan never disappears from the card: it is listed, and one tap plans it in. */
              <Pressable onPress={() => void r.makePlan()} accessibilityRole="button">
                <Notice warn text={t('routeCard.newStops', { count: r.unplanned.length })} />
              </Pressable>
            ) : null}

            {r.done.length ? (
              <>
                <Pressable onPress={() => { selection(); setFoldOpen((o) => !o); }} accessibilityRole="button" accessibilityState={{ expanded: foldOpen }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.tile, alignItems: 'center', justifyContent: 'center' }}>
                    <AText variant="caption" tone="muted">✓</AText>
                  </View>
                  <AText variant="caption" tone="ink" numberOfLines={1} style={{ flex: 1, fontSize: 13 }}>
                    {t('routeCard.done', { count: r.done.length, names: r.done.map((s) => s.label).join(', ') })}
                  </AText>
                  <AText variant="caption" tone="muted">{foldOpen ? '⌃' : '⌄'}</AText>
                </Pressable>
                {foldOpen ? r.done.map((s) => <StopRow key={s.id} s={s} marker="done" onDrive={() => void r.drive(s)} />) : null}
              </>
            ) : null}

            {planned && r.next ? (
              <NextStop s={r.next} n={r.ordered.indexOf(r.next) + 1} route={r.route} from={r.position} straight={r.straight} onDrive={() => void r.drive(r.next)} />
            ) : null}
            {!planned ? <AText variant="caption" tone="ink" style={{ fontSize: 13 }}>{t('routeCard.booked', { count: r.stops.length })}</AText> : null}

            {shownRest.map((s) => (
              <StopRow key={s.id} s={s} marker={planned ? 'ahead' : 'none'} n={planned ? r.ordered.indexOf(s) + 1 : undefined} onDrive={() => void r.drive(s)} />
            ))}
            {planned ? r.unplanned.map((s) => <StopRow key={s.id} s={s} marker="none" onDrive={() => void r.drive(s)} />) : null}
            {rest.length > shownRest.length ? (
              <Pressable onPress={() => setShowAll(true)} accessibilityRole="button">
                <AText variant="caption" tone="accent" style={{ fontSize: 12.5 }}>{t('routeCard.more_n', { count: rest.length - shownRest.length })}</AText>
              </Pressable>
            ) : null}

            {r.state === 'noLocation' ? (
              <Pressable onPress={() => void r.ask()} accessibilityRole="button"
                style={({ pressed }) => ({ borderRadius: 999, borderWidth: 1.5, borderColor: c.accent, paddingVertical: amazen.space(3.25), alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
                <AText variant="body" tone="accent" style={{ fontFamily: amazen.font.sansMedium }}>{t('routeCard.turnOnLocation')}</AText>
              </Pressable>
            ) : r.state === 'notPlanned' ? (
              <View style={{ gap: 6 }}>
                <PrimaryButton label={t('routeCard.plan')} loading={r.planning} onPress={() => void r.makePlan()} />
                <AText variant="caption" tone="muted" style={{ textAlign: 'center', fontSize: 11.5 }}>{t('routeCard.planCost')}</AText>
              </View>
            ) : r.verb && r.ahead.length > 1 ? (
              /* One stop left: the next-stop block's own "Drive here" already is this button. */
              /*
                ⚠️ A FIXED LABEL, NEVER THE STOP'S NAME. "Drive to Deliver to
                Billa AG — Landstraße" wrapped onto two lines and repeated the
                Next stop row right above it. The row names the stop; the button
                starts the day and says it in a few characters.
              */
              <PrimaryButton
                label={r.verb.kind === 'continue' ? t('routeCard.continueRoute') : t('routeCard.startRoute')}
                detail={[
                  `${r.ahead.length} ${t('routeCard.stops', { count: r.ahead.length })}`,
                  r.figures.metresToGo == null ? null : formatDistance(r.figures.metresToGo, { approx: r.straight || r.figures.estimated }),
                ].filter(Boolean).join(' · ')}
                onPress={() => void r.drive(r.verb!.kind === 'driveTo' ? r.verb!.stop : undefined)}
              />
            ) : null}
          </>
        )}
      </CardSurface>

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
              <MenuRow title={t('route.chooseApp')} detail={NAV_APP_LABELS[r.app]} Glyph={NavigateGlyph} onPress={() => setChoosing(true)} />
            </>
          )}
        </SheetPanel>
      </BlurSheet>
    </View>
  );
}
