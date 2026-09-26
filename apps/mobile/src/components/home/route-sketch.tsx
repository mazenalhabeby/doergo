import React, { memo, useMemo, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, Rect, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { LatLng, OptimizedRoute } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { over } from '../../theme/amazen';
import { fitProjection, routeLine, smoothPath, splitLine, svgPath, thin, type DayStop } from '../../lib/route-day';

const HEIGHT = 150;
const PAD = 24;
const PIN = 11;

/**
 * ⭐ THE ROUTE, DRAWN LIKE A TRANSIT MAP — not a map.
 *
 * The real places and the real road line from the plan, fitted with their true
 * shape onto a faint grid: done stops ✓, the next one filled, the rest
 * numbered, the driven part bright, you as a dot. No tiles and no map view on
 * the home (a map there was the part that kept failing); "Open map" opens the
 * real one.
 *
 * The one rule: a SOLID line is a road (a routing engine drew it). With only
 * an order (straight-line planning) the stops are joined by a faint DASHED
 * curve — "this is the order, not the drive" — as the planner does. Not
 * planned: dashed pins, no numbers, no line.
 *
 * Pure SVG, memoised, the road thinned to ≤240 points.
 */
export const RouteSketch = memo(function RouteSketch({
  route, stops, ordered, doneIds, nextId, position, onOpen,
}: {
  route: OptimizedRoute | null;
  stops: readonly DayStop[];
  ordered: readonly DayStop[];
  doneIds: ReadonlySet<string>;
  nextId: string | null;
  position: LatLng | null;
  onOpen?: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const ground = over(c.tile, c.well);

  const drawing = useMemo(() => {
    if (!width) return null;
    const planned = ordered.length > 0;
    const pins = planned ? ordered : stops;
    const road = thin(routeLine(route).map(([lng, lat]) => ({ lat, lng })));
    const proj = fitProjection([...pins, ...road], width, HEIGHT, PAD);
    if (!proj) return null;
    const lastDone = [...ordered].reverse().find((s) => doneIds.has(s.id)) ?? null;

    let driven = '', ahead = '', dashed = false;
    if (road.length > 1) {
      const split = splitLine(road, lastDone);
      driven = split.driven.length > 1 ? svgPath(split.driven, proj) : '';
      ahead = split.ahead.length > 1 ? svgPath(split.ahead, proj) : '';
    } else if (planned && pins.length > 1) {
      // Only an order: a smooth dashed curve through the stops, bright up to the last one done.
      dashed = true;
      const doneUpTo = lastDone ? pins.indexOf(lastDone) : -1;
      const pts = pins.map((p) => ({ x: proj.x(p), y: proj.y(p) }));
      driven = doneUpTo > 0 ? smoothPath(pts.slice(0, doneUpTo + 1)) : '';
      ahead = smoothPath(pts.slice(Math.max(0, doneUpTo)));
    }

    // Stops close together shrink so their numbers stay readable.
    let gap = Infinity;
    const xy = pins.map((p) => [proj.x(p), proj.y(p)] as const);
    for (let i = 0; i < xy.length; i++) for (let j = i + 1; j < xy.length; j++) gap = Math.min(gap, Math.hypot(xy[i]![0] - xy[j]![0], xy[i]![1] - xy[j]![1]));
    const pin = Math.max(7, Math.min(PIN, gap / 2.3));

    const me = position ? { x: proj.x(position), y: proj.y(position) } : null;
    return {
      planned, pins, proj, pin, driven, ahead, dashed,
      // You are drawn only when you are within the drawing, never pinned to its edge.
      me: me && me.x >= 0 && me.x <= width && me.y >= 0 && me.y <= HEIGHT ? me : null,
    };
  }, [width, route, stops, ordered, doneIds, position]);

  return (
    <Pressable
      onPress={onOpen}
      disabled={!onOpen}
      accessibilityRole="button"
      accessibilityLabel={t('routeCard.openMap')}
      onLayout={onLayout}
      style={({ pressed }) => ({ height: HEIGHT, borderRadius: 18, overflow: 'hidden', backgroundColor: ground, opacity: pressed ? 0.85 : 1 })}
    >
      {drawing ? (
        <Svg width={width} height={HEIGHT}>
          <Defs>
            <Pattern id="grid" width={20} height={20} patternUnits="userSpaceOnUse">
              <Path d="M20 0H0V20" fill="none" stroke={c.inkStrong} strokeOpacity={0.04} strokeWidth={1} />
            </Pattern>
          </Defs>
          <Rect width={width} height={HEIGHT} fill="url(#grid)" />
          {drawing.ahead ? (
            <Path d={drawing.ahead} stroke={c.accent} strokeOpacity={0.35} strokeWidth={4} fill="none"
              strokeLinecap="round" strokeLinejoin="round" strokeDasharray={drawing.dashed ? '2 7' : undefined} />
          ) : null}
          {drawing.driven ? (
            <Path d={drawing.driven} stroke={c.accent} strokeWidth={4} fill="none"
              strokeLinecap="round" strokeLinejoin="round" strokeDasharray={drawing.dashed ? '2 7' : undefined} />
          ) : null}
          {drawing.me ? (
            <>
              <Circle cx={drawing.me.x} cy={drawing.me.y} r={12} fill={c.accent} fillOpacity={0.2} />
              <Circle cx={drawing.me.x} cy={drawing.me.y} r={6} fill={c.accent} />
            </>
          ) : null}
          {drawing.pins.map((s, i) => {
            const x = drawing.proj.x(s), y = drawing.proj.y(s);
            const done = doneIds.has(s.id), next = s.id === nextId;
            const r = next ? drawing.pin + 1 : drawing.pin;
            return (
              <React.Fragment key={s.id}>
                <Circle cx={x} cy={y} r={r}
                  fill={next ? c.accentSolid : done ? over(c.tile, ground) : c.well}
                  stroke={next ? c.accentSolid : done ? 'none' : drawing.planned ? c.inkStrong : c.inkMuted}
                  strokeWidth={1.8} strokeDasharray={drawing.planned ? undefined : '3 2'} />
                {drawing.planned ? (
                  <SvgText x={x} y={y + r * 0.36} fontSize={Math.max(8, r * 0.95)} textAnchor="middle"
                    fill={next ? c.accentInk : done ? c.accent : c.inkStrong} fontFamily={amazen.font.mono}>
                    {done ? '✓' : String(i + 1)}
                  </SvgText>
                ) : null}
              </React.Fragment>
            );
          })}
        </Svg>
      ) : null}
    </Pressable>
  );
});
