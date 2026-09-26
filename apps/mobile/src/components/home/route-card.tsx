import React, { useMemo, useState } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
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
import { GlyphTile } from './glyph-tile';
import { hasHour } from './my-work';
import { RouteSketch } from './route-sketch';
import { useRouteDay } from './use-route-day';

/** At most this many stops after the next one; the rest behind "+N more" (SPEC §7). */
const AHEAD_ROWS = 3;

const km = (m: number) => (m >= 10_000 ? Math.round(m / 1000) : Math.round(m / 100) / 10);

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
      { v: r.route ? String(km(r.route.totalMeters)) : '—', unit: 'km', l: t('routeCard.driven') },
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
        { v: r.figures.metresToGo == null ? '—' : `${r.straight || r.figures.estimated ? '~' : ''}${km(r.figures.metresToGo)}`, unit: 'km', l: r.straight ? t('routeCard.straightLine') : t('routeCard.toGo') },
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

        <RouteSketch route={r.route} stops={r.stops} ordered={r.ordered} doneIds={doneIds} nextId={r.next?.id ?? null} position={r.position} onOpen={r.state === 'none' ? undefined : openPlanner} />

        {r.state === 'none' ? (
          <View style={{ gap: 4, paddingBottom: amazen.space(1) }}>
            <AText variant="body" tone="strong">{t('routeCard.noneTitle')}</AText>
            <AText variant="caption" tone="muted">{t('routeCard.noneWhy')}</AText>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {tiles.map((x, i) => (
                <View key={i} style={{ flex: 1, borderRadius: 14, backgroundColor: c.tile, paddingHorizontal: 11, paddingVertical: 10 }}>
                  <AText variant="decimal" tone="strong" numeric style={{ fontSize: 22, lineHeight: 27 }}>
                    {x.v}{x.unit ? <AText variant="caption" tone="muted">{` ${x.unit}`}</AText> : null}
                  </AText>
                  <AText variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 11 }}>{x.l}</AText>
                </View>
              ))}
            </View>

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
              <PrimaryButton
                label={r.verb.kind === 'driveTo' ? t('routeCard.driveTo', { name: r.verb.stop.label }) : r.verb.kind === 'continue' ? t('route.continueNav') : t('route.startNav')}
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

function Notice({ text, warn }: { text: string; warn?: boolean }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={{ flexDirection: 'row', gap: 8, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: warn ? c.warnTint : c.tile }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, marginTop: 6, backgroundColor: warn ? c.warn : c.inkMuted }} />
      <AText variant="caption" style={{ flex: 1, fontSize: 12.5, lineHeight: 17, color: warn ? c.inkStrong : c.ink }}>{text}</AText>
    </View>
  );
}

function Marker({ kind, n }: { kind: 'done' | 'ahead' | 'none' | 'next'; n?: number }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const base = { width: 28, height: 28, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const };
  if (kind === 'next') return <View style={[base, { backgroundColor: c.accentSolid }]}><AText variant="caption" numeric style={{ color: c.accentInk }}>{n}</AText></View>;
  if (kind === 'done') return <View style={[base, { backgroundColor: c.tile }]}><AText variant="caption" tone="muted">✓</AText></View>;
  return (
    <View style={[base, { borderWidth: 1.6, borderColor: kind === 'none' ? c.lineGlass : `${c.ink}88`, borderStyle: kind === 'none' ? 'dashed' : 'solid' }]}>
      <AText variant="caption" tone="ink" numeric>{kind === 'none' ? '·' : n}</AText>
    </View>
  );
}

function StopRow({ s, marker, n, onDrive }: { s: DayStop; marker: 'done' | 'ahead' | 'none'; n?: number; onDrive: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { formatClock } = useTimeFormat();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.lineWell, opacity: marker === 'done' ? 0.6 : 1 }}>
      <Marker kind={marker} n={n} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14, lineHeight: 19 }}>{s.label}</AText>
        {s.address ? <AText variant="caption" tone="muted" numberOfLines={1}>{s.address}</AText> : null}
      </View>
      {hasHour(s.at) ? <AText variant="caption" tone="muted" numeric style={{ fontSize: 11.5 }}>{formatClock(s.at!)}</AText> : null}
      <DriveDisc label={t('routeCard.driveTo', { name: s.label })} onPress={onDrive} />
    </View>
  );
}

/** The next stop, one row: its number, name, time · km · minutes, and the drive button. */
function NextStop({ s, n, route, from, straight, onDrive }: {
  s: DayStop; n: number; route: ReturnType<typeof useRouteDay>['route']; from: ReturnType<typeof useRouteDay>['position']; straight: boolean; onDrive: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { formatClock } = useTimeFormat();
  // ⚠️ Never the leg out of a start the driver has left — see `legToNext` (the 1701 km bug).
  const leg = legToNext(route, s, from);
  const facts = [
    hasHour(s.at) ? formatClock(s.at!) : null,
    leg ? `${straight || leg.estimated ? '~' : ''}${km(leg.meters)} km` : null,
    leg && leg.seconds != null && !straight ? t('routeCard.minutes', { count: Math.round(leg.seconds / 60) }) : null,
  ].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onDrive} accessibilityRole="button" accessibilityLabel={t('routeCard.driveTo', { name: s.label })}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 12, backgroundColor: c.tile, opacity: pressed ? 0.85 : 1 })}>
      <Marker kind="next" n={n} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText variant="eyebrow" tone="accent" style={{ fontSize: 9.5 }}>{t('routeCard.nextStop')}</AText>
        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontFamily: amazen.font.sansMedium }}>{s.label}</AText>
        {facts ? <AText variant="caption" tone="muted" numberOfLines={1}>{facts}</AText> : null}
      </View>
      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.accentSolid, alignItems: 'center', justifyContent: 'center' }}>
        <NavigateGlyph size={20} color={c.accentInk} contrast={c.accentSolid} />
      </View>
    </Pressable>
  );
}

function MapGlyph({ color }: { color: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M9 3 3 5.5v15.5l6-2.5 6 2.5 6-2.5V3l-6 2.5zM9 5.2l6 2.5v11.1l-6-2.5z" fill={color} />
    </Svg>
  );
}

function DriveDisc({ label, onPress }: { label: string; onPress: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <GlyphTile Glyph={NavigateGlyph} color={c.accent} tint={c.tile} behind={c.well} size={32} glyphSize={16} radius={16} />
    </Pressable>
  );
}

function MenuRow({ title, detail, Glyph, onPress }: { title: string; detail?: string; Glyph: React.ComponentType<any>; onPress: () => void }) {
  const { amazen, colors } = useTheme();
  const c = amazen.color;
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(3), opacity: pressed ? 0.7 : 1 })}>
      <GlyphTile Glyph={Glyph} color={c.ink} tint={c.tile} behind={colors.card} size={34} glyphSize={19} />
      <View style={{ flex: 1 }}>
        <AText variant="body" tone="strong" style={{ fontSize: 15 }}>{title}</AText>
        {detail ? <AText variant="caption" tone="muted">{detail}</AText> : null}
      </View>
    </Pressable>
  );
}
