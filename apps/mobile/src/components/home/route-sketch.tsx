import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, View, type LayoutChangeEvent } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { LatLng, OptimizedRoute } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { over } from '../../theme/amazen';
import { AText } from '../amazen';
import { fitProjection, mapRegionFor, routeLine, splitLine, svgPath, thin, type DayStop } from '../../lib/route-day';
import { DARK_MAP_STYLE } from './dark-map-style';

const HEIGHT = 126;
const PAD = 22;
const PIN = 9;

type Pin = { s: DayStop; n: number; done: boolean; next: boolean };

/**
 * ⭐ THE ROUTE, ON A REAL MAP — a preview; a tap opens the map you can move.
 *
 * On the card the map is FIXED: it sits in a column that scrolls and is
 * dragged to reorder, and a map that pans there catches every finger meant for
 * the page. So, as Apple and Google do: the card previews, `onOpen` takes the
 * member to the full, interactive map (the route planner) — pan, zoom, every
 * stop's name and address.
 *
 * Underneath: LITE MODE on Android (Google renders it as a still image — made
 * for maps inside lists) and a fixed Apple map on iOS. The line and the
 * numbered pins are drawn BY the map, so they sit exactly on its streets.
 *
 * ⚠️ REVEALED ONLY ONCE LOADED. Until then — offline, or a map that cannot
 * authorise — our own drawing of the same places stands. Nothing appears and
 * then vanishes, and a failed map is never shown.
 *
 * Numbers mean there is an order; a line means there is a road.
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
  /** Open the full, interactive map. */
  onOpen?: () => void;
}) {
  const { amazen, isDark } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const ground = over(c.tile, c.well);

  const planned = ordered.length > 0;
  const pins: Pin[] = useMemo(() => (planned ? ordered : stops).map((s, i) => ({
    s, n: i + 1, done: doneIds.has(s.id), next: s.id === nextId,
  })), [planned, ordered, stops, doneIds, nextId]);
  const line = useMemo(() => thin(routeLine(route).map(([lng, lat]) => ({ lat, lng }))), [route]);
  const lastDone = useMemo(() => [...ordered].reverse().find((s) => doneIds.has(s.id)) ?? null, [ordered, doneIds]);
  const split = useMemo(() => splitLine(line, lastDone), [line, lastDone]);

  // The area is the stops and the road — not where you happen to be standing.
  const region = useMemo(() => mapRegionFor([...pins.map((p) => p.s), ...line], width, HEIGHT, PAD), [pins, line, width]);
  const areaKey = region ? `${region.latitude.toFixed(4)},${region.longitude.toFixed(4)},${region.latitudeDelta.toFixed(4)}` : '';

  /* Revealed only when loaded; a new area starts hidden again. */
  const [loaded, setLoaded] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => { setLoaded(false); reveal.setValue(0); }, [areaKey, reveal]);
  useEffect(() => { if (loaded) Animated.timing(reveal, { toValue: 1, duration: 260, useNativeDriver: true }).start(); }, [loaded, reveal]);

  const drawing = useMemo(() => {
    if (!width || loaded) return null;
    const proj = fitProjection([...pins.map((p) => p.s), ...line], width, HEIGHT, PAD);
    if (!proj) return null;
    let gap = Infinity;
    const xy = pins.map((p) => [proj.x(p.s), proj.y(p.s)] as const);
    for (let i = 0; i < xy.length; i++) for (let j = i + 1; j < xy.length; j++) gap = Math.min(gap, Math.hypot(xy[i]![0] - xy[j]![0], xy[i]![1] - xy[j]![1]));
    const me = position ? { x: proj.x(position), y: proj.y(position) } : null;
    return {
      proj, pin: Math.max(6, Math.min(PIN, gap / 2.3)),
      driven: split.driven.length > 1 ? svgPath(split.driven, proj) : '',
      ahead: split.ahead.length > 1 ? svgPath(split.ahead, proj) : '',
      me: me && me.x >= 0 && me.x <= width && me.y >= 0 && me.y <= HEIGHT ? me : null,
    };
  }, [width, loaded, pins, line, split, position]);

  const colours = (p: Pin) => ({
    fill: p.next ? c.accentSolid : p.done ? c.tile : c.well,
    stroke: p.next ? c.accentSolid : p.done ? c.inkMuted : planned ? c.inkStrong : c.inkMuted,
    ink: p.next ? c.accentInk : c.inkStrong,
  });

  return (
    <Pressable
      onPress={onOpen}
      disabled={!onOpen}
      accessibilityRole="button"
      accessibilityLabel={t('routeCard.openMap')}
      onLayout={onLayout}
      style={({ pressed }) => ({ height: HEIGHT, borderRadius: 16, overflow: 'hidden', backgroundColor: ground, opacity: pressed ? 0.85 : 1 })}
    >
      {region ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height: HEIGHT, opacity: reveal }}>
          <MapView
            key={areaKey}
            style={{ width, height: HEIGHT }}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            initialRegion={region}
            liteMode={Platform.OS === 'android'}
            userInterfaceStyle={isDark ? 'dark' : 'light'}
            customMapStyle={isDark ? DARK_MAP_STYLE : undefined}
            scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}
            toolbarEnabled={false} showsPointsOfInterest={false} showsCompass={false} showsUserLocation={false}
            onMapLoaded={() => setLoaded(true)}
          >
            {split.ahead.length > 1 ? (
              <Polyline coordinates={split.ahead.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={`${c.accent}99`} strokeWidth={4} />
            ) : null}
            {split.driven.length > 1 ? (
              <Polyline coordinates={split.driven.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={c.accent} strokeWidth={4} />
            ) : null}
            {pins.map((p) => {
              const k = colours(p);
              return (
                <Marker key={p.s.id} coordinate={{ latitude: p.s.lat, longitude: p.s.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: k.fill, borderWidth: 1.8, borderColor: k.stroke, borderStyle: planned ? 'solid' : 'dashed', alignItems: 'center', justifyContent: 'center' }}>
                    {planned ? <AText variant="caption" numeric style={{ fontSize: 9.5, lineHeight: 12, color: k.ink }}>{p.done ? '✓' : String(p.n)}</AText> : null}
                  </View>
                </Marker>
              );
            })}
            {position ? (
              <Marker coordinate={{ latitude: position.lat, longitude: position.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: c.accent, borderWidth: 2, borderColor: c.well }} />
              </Marker>
            ) : null}
          </MapView>
        </Animated.View>
      ) : null}

      {drawing ? (
        <Svg width={width} height={HEIGHT} style={{ position: 'absolute', left: 0, top: 0 }}>
          {drawing.ahead ? <Path d={drawing.ahead} stroke={`${c.accent}66`} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {drawing.driven ? <Path d={drawing.driven} stroke={c.accent} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {pins.map((p) => {
            const x = drawing.proj.x(p.s), y = drawing.proj.y(p.s);
            const k = colours(p);
            return (
              <React.Fragment key={p.s.id}>
                <Circle cx={x} cy={y} r={drawing.pin} fill={k.fill} stroke={k.stroke} strokeWidth={1.6} strokeDasharray={planned ? undefined : '3 2'} />
                {planned ? (
                  <SvgText x={x} y={y + drawing.pin * 0.36} fontSize={Math.max(7.5, drawing.pin * 1.05)} textAnchor="middle" fill={k.ink} fontFamily={amazen.font.mono}>
                    {p.done ? '✓' : String(p.n)}
                  </SvgText>
                ) : null}
              </React.Fragment>
            );
          })}
          {drawing.me ? (
            <>
              <Circle cx={drawing.me.x} cy={drawing.me.y} r={10} fill={`${c.accent}33`} />
              <Circle cx={drawing.me.x} cy={drawing.me.y} r={5} fill={c.accent} />
            </>
          ) : null}
        </Svg>
      ) : null}

      {/* Say that it opens. */}
      {onOpen ? (
        <View pointerEvents="none" style={{ position: 'absolute', right: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: `${c.well}cc` }}>
          <AText variant="caption" tone="ink" style={{ fontSize: 11 }}>{t('routeCard.openMapShort')}</AText>
        </View>
      ) : null}
    </Pressable>
  );
});
