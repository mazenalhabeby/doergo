import { Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { AText, CardSurface, PrimaryButton } from '@/components/amazen';
import { selection } from '@/lib/haptics';
import { formatDistance } from '@/lib/distance';
import { hasHour } from './my-work';
import { weekdayName } from '@/lib/app-dates';
import { RouteSketch } from './route-sketch';
import { Notice, StopRow, NextStop, MapGlyph } from './next-stop';
import type { RouteCardState } from './use-route-card';

/** Part of RouteCard's markup, moved here unchanged; it reads the page's state from `vm`. */
export function RouteCardMyRoute({ vm }: { vm: RouteCardState }) {
  const {
    amazen,
    t,
    r,
    openPlanner,
    c,
    setMenu,
    doneIds,
    formatClock,
    tiles,
    planned,
    setFoldOpen,
    foldOpen,
    shownRest,
    rest,
    setShowAll,
  } = vm;
  return (
    <CardSurface style={{ padding: amazen.space(4), gap: amazen.space(3) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <AText variant="h3" tone="strong" style={{ flex: 1 }}>{t('widgets.myRoute')}</AText>
        {r.state !== 'none' ? (
          <Pressable onPress={openPlanner} hitSlop={6} accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 11,
              height: 32,
              borderRadius: 16,
              backgroundColor: c.tile,
              borderWidth: 1,
              borderColor: c.lineGlass,
              marginRight: 8,
              opacity: pressed ? 0.75 : 1,
            })}>
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
        <RouteSketch
          route={r.route}
          stops={r.stops}
          ordered={r.ordered}
          doneIds={doneIds}
          nextId={r.next?.id ?? null}
          position={r.position}
          onOpen={openPlanner}
        />
      ) : null}

      {r.state === 'none' && !r.loaded ? (
        /* Not an answer yet — the jobs are still on their way. A quiet line, never "nothing to drive". */
        <View
          style={{ height: 52, borderRadius: 16, backgroundColor: c.tile, opacity: 0.6 }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : r.state === 'none' ? (
        <View style={{ gap: amazen.space(3) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3.5) }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                backgroundColor: c.accentTint,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Svg width={26} height={26} viewBox="0 0 24 24">
                <Path
                  d="M5 19c3-6 6-2 8-7s4-6 6-7"
                  fill="none"
                  stroke={c.accent}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray="1 4"
                />
                <Circle cx={5} cy={19} r={2.4} fill={c.accent} />
                <Circle cx={19} cy={5} r={2.4} fill={c.accent} />
              </Svg>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AText variant="body" tone="strong" numberOfLines={1}>
                {r.nextDay ? t('routeCard.noneToday') : t('routeCard.noneAtAll')}
              </AText>
              <AText variant="caption" tone="muted" numberOfLines={2}>
                {r.nextDay ? t('routeCard.nextDriveDay', { day: weekdayName(r.nextDay.day, 'long') }) : t('routeCard.noneAtAllWhy')}
              </AText>
            </View>
          </View>
          {r.nextDay ? (
            <Pressable onPress={openPlanner} accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: amazen.space(3),
                borderRadius: 16,
                backgroundColor: c.tile,
                padding: amazen.space(3),
                opacity: pressed ? 0.85 : 1,
              })}>
              <View style={{ width: 44, alignItems: 'center' }}>
                <AText variant="h3" tone="strong" numeric style={{ fontSize: 20, lineHeight: 24 }}>
                  {String(r.nextDay.day.getDate())}
                </AText>
                <AText
                  variant="caption"
                  tone="muted"
                  numberOfLines={1}
                  style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}
                >
                  {weekdayName(r.nextDay.day, 'short')}
                </AText>
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
                <AText
                  variant="decimal"
                  tone="strong"
                  numeric
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  style={{ fontSize: 22, lineHeight: 27 }}>
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
              <Pressable
                onPress={() => { selection(); setFoldOpen((o) => !o); }}
                accessibilityRole="button"
                accessibilityState={{ expanded: foldOpen }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: c.tile,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
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
            <NextStop
              s={r.next}
              n={r.ordered.indexOf(r.next) + 1}
              route={r.route}
              from={r.position}
              straight={r.straight}
              onDrive={() => void r.drive(r.next)}
            />
          ) : null}
          {!planned ? (
            <AText variant="caption" tone="ink" style={{ fontSize: 13 }}>
              {t('routeCard.booked', { count: r.stops.length })}
            </AText>
          ) : null}

          {shownRest.map((s) => (
            <StopRow
              key={s.id}
              s={s}
              marker={planned ? 'ahead' : 'none'}
              n={planned ? r.ordered.indexOf(s) + 1 : undefined}
              onDrive={() => void r.drive(s)}
            />
          ))}
          {planned ? r.unplanned.map((s) => <StopRow key={s.id} s={s} marker="none" onDrive={() => void r.drive(s)} />) : null}
          {rest.length > shownRest.length ? (
            <Pressable onPress={() => setShowAll(true)} accessibilityRole="button">
              <AText variant="caption" tone="accent" style={{ fontSize: 12.5 }}>
                {t('routeCard.more_n', { count: rest.length - shownRest.length })}
              </AText>
            </Pressable>
          ) : null}

          {r.state === 'noLocation' ? (
            <Pressable onPress={() => void r.ask()} accessibilityRole="button"
              style={({ pressed }) => ({
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: c.accent,
                paddingVertical: amazen.space(3.25),
                alignItems: 'center',
                opacity: pressed ? 0.8 : 1,
              })}>
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
  );
}
