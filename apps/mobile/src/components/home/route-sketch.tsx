import React, { memo, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import type { LatLng, OptimizedRoute } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { over } from '../../theme/amazen';
import { fitProjection, routeLine, splitLine, svgPath, thin, type DayStop } from '../../lib/route-day';

const HEIGHT = 126;
const PAD = 16;
const PIN = 9;

/**
 * ⭐ THE ROUTE, DRAWN — not a map.
 *
 * The real places and the real road line from the plan, fitted to the card
 * with their true shape (`fitProjection`). No tiles: nothing to download, no
 * cost, the same with no signal, and no native map view inside a scrolling,
 * draggable home column. The planner holds the real map.
 *
 * The one visual rule (STATES ⑥): numbers mean there is an order; a line means
 * there is a road. Not planned → dashed pins, no numbers. Straight-line plan →
 * numbered pins, no line.
 *
 * ⚠️ PURE AND MEMOISED: the path strings are computed once per plan/progress,
 * the line is thinned to ≤240 points, and the whole drawing re-renders only
 * when what it shows changes.
 */
export const RouteSketch = memo(function RouteSketch({
  route, stops, ordered, doneIds, nextId, position,
}: {
  route: OptimizedRoute | null;
  /** Every stop (booked order) — drawn as unnumbered pins when there is no plan. */
  stops: readonly DayStop[];
  /** The planned order — empty when not planned. */
  ordered: readonly DayStop[];
  doneIds: ReadonlySet<string>;
  nextId: string | null;
  position: LatLng | null;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const ground = over(c.tile, c.well);

  const drawing = useMemo(() => {
    if (!width) return null;
    const planned = ordered.length > 0;
    const pins = planned ? ordered : stops;
    const line = thin(routeLine(route).map(([lng, lat]) => ({ lat, lng })));
    const proj = fitProjection([...pins, ...line, ...(position ? [position] : [])], width, HEIGHT, PAD);
    if (!proj) return null;
    const lastDone = [...ordered].reverse().find((s) => doneIds.has(s.id)) ?? null;
    const { driven, ahead } = splitLine(line, lastDone);
    return {
      proj, planned, pins,
      driven: driven.length > 1 ? svgPath(driven, proj) : '',
      ahead: ahead.length > 1 ? svgPath(ahead, proj) : '',
    };
  }, [width, route, stops, ordered, doneIds, position]);

  return (
    <View onLayout={onLayout} style={{ height: HEIGHT, borderRadius: 16, overflow: 'hidden', backgroundColor: ground }}>
      {drawing ? (
        <Svg width={width} height={HEIGHT}>
          {drawing.ahead ? <Path d={drawing.ahead} stroke={`${c.accent}66`} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {drawing.driven ? <Path d={drawing.driven} stroke={c.accent} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {drawing.pins.map((s, i) => {
            const x = drawing.proj.x(s), y = drawing.proj.y(s);
            const isDone = doneIds.has(s.id), isNext = s.id === nextId;
            const fill = isNext ? c.accentSolid : isDone ? c.tile : ground;
            const stroke = isNext ? c.accentSolid : isDone ? c.tile : drawing.planned ? c.ink : c.inkMuted;
            return (
              <React.Fragment key={s.id}>
                <Circle cx={x} cy={y} r={PIN} fill={fill} stroke={stroke} strokeWidth={1.6} strokeDasharray={drawing.planned ? undefined : '3 2'} />
                {drawing.planned ? (
                  <SvgText x={x} y={y + 3.5} fontSize={9.5} textAnchor="middle" fill={isNext ? c.accentInk : c.ink} fontFamily={amazen.font.mono}>
                    {isDone ? '✓' : String(i + 1)}
                  </SvgText>
                ) : null}
              </React.Fragment>
            );
          })}
          {position ? (
            <>
              <Circle cx={drawing.proj.x(position)} cy={drawing.proj.y(position)} r={10} fill={`${c.accent}33`} />
              <Circle cx={drawing.proj.x(position)} cy={drawing.proj.y(position)} r={5} fill={c.accent} />
            </>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
});
