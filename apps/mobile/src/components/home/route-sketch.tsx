import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, View, type LayoutChangeEvent } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import type { LatLng, OptimizedRoute } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useConnectivity } from '../../offline/offline-context';
import { over } from '../../theme/amazen';
import { keepRouteMap, keptRouteMap, type RouteMapSnapshot } from '../../offline/routes/route-map-snapshot';
import {
  fitProjection, mapKey, mapRegionFor, mercatorProjection, routeLine, splitLine, svgPath, thin,
  type DayStop, type Projection,
} from '../../lib/route-day';
import { DARK_MAP_STYLE } from './dark-map-style';

const HEIGHT = 126;
const PAD = 22;
const PIN = 9;
/** A map that has not finished drawing by then is given up on; the drawing alone stands. */
const SNAPSHOT_TIMEOUT_MS = 10_000;

/**
 * ⭐ THE ROUTE ON A REAL MAP — at the cost of a picture.
 *
 * Underneath: the real Apple / Google map of the area, drawn ONCE per plan and
 * kept as a snapshot (offline/routes/route-map-snapshot.ts). On top, live: the
 * road line, numbered pins (✓ when done), where you are — projected in Web
 * Mercator onto the snapshot's own bounds, so they sit on its streets.
 *
 * No live map view stays on the home: it mounts only while a snapshot is being
 * taken, then is replaced by one image. With no snapshot and no signal the
 * drawing stands alone on a plain ground — the order and the line are still
 * right, the streets simply are not there yet.
 *
 * Numbers mean there is an order; a line means there is a road.
 */
export const RouteSketch = memo(function RouteSketch({
  route, stops, ordered, doneIds, nextId, position,
}: {
  route: OptimizedRoute | null;
  stops: readonly DayStop[];
  ordered: readonly DayStop[];
  doneIds: ReadonlySet<string>;
  nextId: string | null;
  position: LatLng | null;
}) {
  const { amazen, isDark } = useTheme();
  const c = amazen.color;
  const { user } = useAuth();
  const online = useConnectivity() === 'online';
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const ground = over(c.tile, c.well);

  const planned = ordered.length > 0;
  const pins = planned ? ordered : stops;
  const line = useMemo(() => thin(routeLine(route).map(([lng, lat]) => ({ lat, lng }))), [route]);

  // The area is the stops and the road — not where you happen to be standing.
  const region = useMemo(() => mapRegionFor([...pins, ...line], width, HEIGHT, PAD), [pins, line, width]);
  const key = region ? mapKey(region.bounds, width, HEIGHT, isDark) : null;

  const [snap, setSnap] = useState<RouteMapSnapshot | null>(null);
  const [capturing, setCapturing] = useState(false);
  useEffect(() => {
    if (!key || !user?.id) return;
    let live = true;
    void keptRouteMap(user.id, key).then((k) => {
      if (!live) return;
      setSnap(k);
      setCapturing(!k && online);
    });
    return () => { live = false; };
  }, [key, user?.id, online]);

  const map = useRef<MapView>(null);
  const done = useRef(false);
  useEffect(() => { done.current = false; }, [key]);
  const capture = useCallback(async () => {
    if (done.current || !map.current || !key || !user?.id) return;
    done.current = true;
    try {
      const [uri, b] = await Promise.all([
        map.current.takeSnapshot({ width, height: HEIGHT, format: 'jpg', quality: 0.85, result: 'file' }),
        map.current.getMapBoundaries(),
      ]);
      const kept = await keepRouteMap(user.id, key, uri, {
        northEast: { lat: b.northEast.latitude, lng: b.northEast.longitude },
        southWest: { lat: b.southWest.latitude, lng: b.southWest.longitude },
      });
      if (kept) setSnap(kept);
    } catch { /* the drawing alone stands */ }
    setCapturing(false);
  }, [key, user?.id, width]);
  useEffect(() => {
    if (!capturing) return;
    const id = setTimeout(() => setCapturing(false), SNAPSHOT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [capturing]);

  const drawing = useMemo(() => {
    if (!width) return null;
    const proj: Projection | null = snap
      ? mercatorProjection(snap.bounds, width, HEIGHT)
      : fitProjection([...pins, ...line], width, HEIGHT, PAD);
    if (!proj) return null;
    const lastDone = [...ordered].reverse().find((s) => doneIds.has(s.id)) ?? null;
    const { driven, ahead } = splitLine(line, lastDone);
    const me = position ? { x: proj.x(position), y: proj.y(position) } : null;
    /* Stops close together would cover each other: the pins shrink to the gap between the nearest two (never below 6). */
    const xy = pins.map((p) => [proj.x(p), proj.y(p)] as const);
    let gap = Infinity;
    for (let i = 0; i < xy.length; i++) for (let j = i + 1; j < xy.length; j++) gap = Math.min(gap, Math.hypot(xy[i]![0] - xy[j]![0], xy[i]![1] - xy[j]![1]));
    const pin = Math.max(6, Math.min(PIN, gap / 2.3));
    return {
      proj, pin,
      driven: driven.length > 1 ? svgPath(driven, proj) : '',
      ahead: ahead.length > 1 ? svgPath(ahead, proj) : '',
      // You are drawn only when you are on this map, never pinned to its edge.
      me: me && me.x >= 0 && me.x <= width && me.y >= 0 && me.y <= HEIGHT ? me : null,
    };
  }, [width, snap, pins, line, ordered, doneIds, position]);

  return (
    <View onLayout={onLayout} style={{ height: HEIGHT, borderRadius: 16, overflow: 'hidden', backgroundColor: ground }}>
      {capturing && region ? (
        <MapView
          ref={map}
          style={{ position: 'absolute', left: 0, top: 0, width, height: HEIGHT }}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={region}
          liteMode={Platform.OS === 'android'}
          userInterfaceStyle={isDark ? 'dark' : 'light'}
          customMapStyle={isDark ? DARK_MAP_STYLE : undefined}
          scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}
          toolbarEnabled={false} showsPointsOfInterest={false} showsCompass={false}
          pointerEvents="none"
          onMapLoaded={() => { setTimeout(() => void capture(), 350); }}
        />
      ) : null}
      {snap ? <Image source={{ uri: snap.uri }} style={{ position: 'absolute', left: 0, top: 0, width, height: HEIGHT }} fadeDuration={200} /> : null}
      {snap ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: `${c.well}33` }} /> : null}
      {drawing ? (
        <Svg width={width} height={HEIGHT} style={{ position: 'absolute', left: 0, top: 0 }}>
          {drawing.ahead ? <Path d={drawing.ahead} stroke={snap ? c.accent : `${c.accent}66`} strokeOpacity={snap ? 0.55 : 1} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {drawing.driven ? <Path d={drawing.driven} stroke={c.accent} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {pins.map((s, i) => {
            const x = drawing.proj.x(s), y = drawing.proj.y(s);
            const isDone = doneIds.has(s.id), isNext = s.id === nextId;
            const fill = isNext ? c.accentSolid : isDone ? c.tile : c.well;
            const stroke = isNext ? c.accentSolid : isDone ? c.inkMuted : planned ? c.inkStrong : c.inkMuted;
            return (
              <React.Fragment key={s.id}>
                <Circle cx={x} cy={y} r={drawing.pin} fill={fill} stroke={stroke} strokeWidth={1.8} strokeDasharray={planned ? undefined : '3 2'} />
                {planned ? (
                  <SvgText x={x} y={y + drawing.pin * 0.36} fontSize={Math.max(7.5, drawing.pin * 1.05)} textAnchor="middle" fill={isNext ? c.accentInk : c.inkStrong} fontFamily={amazen.font.mono}>
                    {isDone ? '✓' : String(i + 1)}
                  </SvgText>
                ) : null}
              </React.Fragment>
            );
          })}
          {drawing.me ? (
            <>
              <Circle cx={drawing.me.x} cy={drawing.me.y} r={11} fill={`${c.accent}33`} />
              <Circle cx={drawing.me.x} cy={drawing.me.y} r={5.5} fill={c.accent} stroke={c.well} strokeWidth={1.5} />
            </>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
});
