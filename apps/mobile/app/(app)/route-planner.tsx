import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
  Linking, Platform, RefreshControl, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { DetentSheet, type Detent } from '../../src/components/route/detent-sheet';
import { PressableScale } from '../../src/components/pressable-scale';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { tasksApi, type Task } from '../../src/lib/api';
import { isMyRouteStop } from '../../src/lib/my-route';
import { useAuth } from '../../src/contexts/auth-context';
import { routesApi } from '../../src/lib/api';
import { useTheme } from '../../src/contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';
import {
  buildGoogleMapsUrl, buildNavUrl, supportsMultiStop,
  type NavApp, type RouteStop, type OptimizedRoute,
} from '@hbcfield/shared/client';

type LatLng = { lat: number; lng: number; label?: string };

const NAV_APPS: { key: NavApp; label: string }[] = [
  { key: 'google', label: 'Google Maps' },
  { key: 'waze', label: 'Waze' },
  { key: 'apple', label: 'Apple Maps' },
];

const fmtKm = (m: number) => `${(m / 1000).toFixed(1)} km`;
const fmtDur = (s: number) => {
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};

export default function RoutePlannerScreen() {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { user } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [start, setStart] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [navApp, setNavApp] = useState<NavApp>(Platform.OS === 'ios' ? 'apple' : 'google');
  const [result, setResult] = useState<OptimizedRoute | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    My open jobs that have somewhere to be.

    The list endpoint answers with everything the caller may SEE, which for
    anyone who oversees work is the whole site's workload — so this screen used
    to propose a driving route around other people's jobs. "My route" means
    mine: the same rule the Tasks banner uses to decide whether to offer this at
    all.
  */
  const load = useCallback(async () => {
    try {
      const all = await tasksApi.list({ limit: 100 } as any);
      const mine = (all || []).filter((x) => isMyRouteStop(x, user?.id));
      setTasks(mine);
      // Preselect all by default.
      setSelected(Object.fromEntries(mine.map((x) => [x.id, true])));
    } catch (e: any) {
      setError(e?.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { useMyLocation(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocating(false); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: t('route.myLocation', 'My location') });
    } catch { /* ignore */ } finally { setLocating(false); }
  };

  const stops: RouteStop[] = useMemo(
    () => tasks
      .filter((x) => selected[x.id])
      .map((x) => ({ id: x.id, lat: x.locationLat as number, lng: x.locationLng as number, label: x.title, address: x.locationAddress })),
    [tasks, selected],
  );

  const optimize = async () => {
    setError(null);
    const from = start ?? (stops[0] ? { lat: stops[0].lat, lng: stops[0].lng } : null);
    if (!from) { setError(t('route.needStart', 'Turn on location to set your start point')); return; }
    const list = start ? stops : stops.slice(1);
    if (list.length === 0) { setError(t('route.needStops', 'Select at least one stop')); return; }
    setOptimizing(true);
    try {
      const r = await routesApi.optimize({ start: from, stops: list });
      setResult(r);
    } catch (e: any) {
      setError(e?.message || 'Could not optimize the route');
    } finally { setOptimizing(false); }
  };

  const orderedStops: RouteStop[] = useMemo(() => {
    if (!result) return [];
    const byId = new Map(stops.map((s) => [s.id, s]));
    return result.order.map((id) => byId.get(id)).filter(Boolean) as RouteStop[];
  }, [result, stops]);

  const polyline = useMemo(() => {
    const g: any = result?.geometry;
    const coords = g?.coordinates;
    if (!Array.isArray(coords)) return [];
    return coords.map((c: number[]) => ({ latitude: c[1], longitude: c[0] }));
  }, [result]);

  /*
    The order, drawn, when there is no road to draw.

    Without a routing engine the optimizer still answers with a sensible visit
    order — it just cannot say which roads join them. Showing numbered pins and
    nothing between them looks like a route that failed to load; a dashed line
    says "this is the order, not the drive", which is exactly what it is.
  */
  const straightLine = useMemo(() => {
    if (!result || polyline.length > 1) return [];
    const pts = (result.waypoints ?? []).map((w) => ({ latitude: w.lat, longitude: w.lng }));
    return pts.length > 1 ? pts : [];
  }, [result, polyline.length]);

  /** Distance and time for the drive that ARRIVES at ordered stop `i`. */
  const legTo = useCallback((i: number) => result?.legs?.[i] ?? null, [result]);

  const openFullRoute = () => {
    if (!result || !start) return;
    const url = buildGoogleMapsUrl(start, orderedStops);
    if (url) Linking.openURL(url).catch(() => {});
  };
  const navTo = (stop: RouteStop) => {
    if (!start) return;
    const url = buildNavUrl(navApp, { start, orderedStops, nextStop: stop });
    if (url) Linking.openURL(url).catch(() => {});
  };

  const selectedCount = stops.length;
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const mapRef = useRef<MapView | null>(null);
  const [detent, setDetent] = useState<Detent>('mid');

  /*
    Frame everything that matters, under the sheet rather than behind it.

    A map centred on a fixed span shows the first stop and hides the rest; the
    bottom inset keeps the route in the half of the screen the sheet is not
    covering, which is the difference between a map you read and one you fight.
  */
  const fitToRoute = useCallback((animated = true) => {
    const pts = [
      ...(start ? [{ latitude: start.lat, longitude: start.lng }] : []),
      ...(result ? orderedStops : stops).map((s) => ({ latitude: s.lat, longitude: s.lng })),
    ];
    if (pts.length === 0 || !mapRef.current) return;
    mapRef.current.fitToCoordinates(pts, {
      edgePadding: {
        top: insets.top + 80,
        bottom: Math.round(winH * 0.5),
        left: 56,
        right: 56,
      },
      animated,
    });
  }, [start, stops, orderedStops, result, insets.top, winH]);

  // Re-frame when the shape of the route changes, not on every render.
  useEffect(() => {
    const id = setTimeout(() => fitToRoute(true), 350);
    return () => clearTimeout(id);
  }, [fitToRoute]);

  // A finished route is a result to read: open the sheet to it.
  useEffect(() => { if (result) setDetent('mid'); }, [result]);

  const listStops = result ? orderedStops : stops;

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface }]}>
      {/*
        The map is the page, not an illustration inside it.

        It sits under everything at full bleed — including behind the status bar
        and the sheet — because a route is a shape, and a shape cropped into a
        200px window is a picture of a route rather than the route itself.
      */}
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: start?.lat ?? stops[0]?.lat ?? 48.2,
          longitude: start?.lng ?? stops[0]?.lng ?? 16.37,
          latitudeDelta: 0.25,
          longitudeDelta: 0.25,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        onMapReady={() => fitToRoute(false)}
      >
        {/* The road geometry underneath the pins, so a pin never sits under a line. */}
        {polyline.length > 1 && (
          <>
            <Polyline coordinates={polyline} strokeColor="rgba(37,99,235,0.25)" strokeWidth={11} />
            <Polyline coordinates={polyline} strokeColor={COLORS.primary} strokeWidth={5} />
          </>
        )}
        {straightLine.length > 1 && (
          <Polyline
            coordinates={straightLine}
            strokeColor={colors.textMuted}
            strokeWidth={2}
            lineDashPattern={[6, 6]}
          />
        )}

        {start && (
          <Marker coordinate={{ latitude: start.lat, longitude: start.lng }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.originOuter}>
              <View style={styles.originInner} />
            </View>
          </Marker>
        )}

        {listStops.map((s, i) => (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            anchor={{ x: 0.5, y: 1 }}
            onPress={() => setDetent('mid')}
          >
            {/* Numbered once the route is ordered — the number IS the plan, and
                a default red pin cannot carry it. */}
            <View style={styles.pin}>
              <View style={[styles.pinBubble, { backgroundColor: result ? COLORS.primary : colors.card, borderColor: result ? COLORS.primary : colors.border }]}>
                <Text style={[styles.pinText, { color: result ? '#fff' : colors.textPrimary }]}>
                  {result ? String(i + 1) : '•'}
                </Text>
              </View>
              <View style={[styles.pinTail, { borderTopColor: result ? COLORS.primary : colors.border }]} />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Floating controls — the map's furniture, not a header bar. A solid bar
          across the top would crop the very thing it sits on. */}
      <View style={[styles.floatTop, { top: insets.top + 8 }]} pointerEvents="box-none">
        <PressableScale onPress={() => router.back()} style={[styles.fab, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={t('common.back', 'Back')}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </PressableScale>
        <View style={styles.floatTopRight}>
          <PressableScale onPress={() => { useMyLocation(); fitToRoute(true); }} style={[styles.fab, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={t('route.useMyLocation', 'Use my location')}>
            {locating
              ? <ActivityIndicator size="small" color={COLORS.primary} />
              : <Ionicons name="locate" size={20} color={COLORS.primary} />}
          </PressableScale>
          <PressableScale onPress={() => fitToRoute(true)} style={[styles.fab, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={t('route.fitRoute', 'Show the whole route')}>
            <Ionicons name="scan-outline" size={20} color={colors.textPrimary} />
          </PressableScale>
        </View>
      </View>

      <DetentSheet
        detent={detent}
        onDetentChange={setDetent}
        peekHeight={result ? 250 : 210}
        backgroundColor={colors.card}
        borderColor={colors.border}
        grabberColor={colors.border}
        header={
          <View style={styles.sheetHead}>
            <View style={styles.sheetTitleRow}>
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                {result ? t('route.yourRoute', 'Your route') : t('route.title', 'Plan my route')}
              </Text>
              {!!result && (
                <TouchableOpacity onPress={() => setResult(null)} hitSlop={8}>
                  <Text style={[styles.sheetReset, { color: COLORS.primary }]}>{t('route.edit', 'Edit')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* One line that answers "is this my morning or a detour?" */}
            <Text style={[styles.sheetMeta, { color: colors.textMuted }]} numberOfLines={1}>
              {result
                ? `${result.order.length} ${t('route.stopsWord', 'stops')} · ${fmtKm(result.totalMeters)} · ${fmtDur(result.totalSeconds)}`
                : `${selectedCount} ${t('route.selected', 'selected')}${start ? ` · ${start.label}` : ''}`}
            </Text>

            {/*
              An estimate is not a drive time, and it must say so. Without a
              routing engine these numbers come from straight-line distance with
              a road factor, which is close enough to plan by and wrong enough
              that nobody should quote it to a client.
            */}
            {!!result && result.engine === 'nearest-neighbour' && (
              <Text style={[styles.sheetNote, { color: colors.textMuted }]}>
                {t('route.estimatedOnly', 'Order and estimates only — no road route available.')}
              </Text>
            )}

            {!!error && <Text style={styles.sheetError}>{error}</Text>}

            {result ? (
              <PressableScale onPress={openFullRoute} style={[styles.cta, { backgroundColor: COLORS.primary }]} accessibilityRole="button">
                <Ionicons name="navigate" size={17} color="#fff" />
                <Text style={styles.ctaText}>{t('route.startNav', 'Start navigation')}</Text>
              </PressableScale>
            ) : (
              <PressableScale
                onPress={optimize}
                disabled={optimizing || selectedCount === 0}
                style={[styles.cta, { backgroundColor: selectedCount === 0 ? colors.border : COLORS.primary }]}
                accessibilityRole="button"
              >
                {optimizing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="git-network" size={17} color="#fff" />}
                <Text style={[styles.ctaText, selectedCount === 0 && { color: colors.textMuted }]}>
                  {t('route.optimize', 'Optimize route')}
                </Text>
              </PressableScale>
            )}
          </View>
        }
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={COLORS.primary} />}
        >
          {loading ? (
            <ActivityIndicator style={{ marginVertical: SPACING.xl }} color={COLORS.primary} />
          ) : tasks.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="map-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {t('route.noStops', 'No tasks with a location. Add a location to a task to route to it.')}
              </Text>
            </View>
          ) : result ? (
            orderedStops.map((s, i) => (
              <View key={s.id} style={styles.legRow}>
                <View style={styles.legRail}>
                  <View style={[styles.legDot, { backgroundColor: COLORS.primary }]}>
                    <Text style={styles.legDotText}>{i + 1}</Text>
                  </View>
                  {i < orderedStops.length - 1 && <View style={[styles.legLine, { backgroundColor: colors.border }]} />}
                </View>
                <View style={styles.legBody}>
                  <Text style={[styles.legTitle, { color: colors.textPrimary }]} numberOfLines={1}>{s.label}</Text>
                  {!!s.address && <Text style={[styles.legAddr, { color: colors.textMuted }]} numberOfLines={1}>{s.address}</Text>}
                  {/* The drive that gets you here — the number a rep plans the
                      morning around, and the reason the order matters. */}
                  {!!legTo(i) && (
                    <Text style={[styles.legDrive, { color: colors.textMuted }]}>
                      {fmtKm(legTo(i)!.meters)} · {fmtDur(legTo(i)!.seconds)}
                    </Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => navTo(s)} hitSlop={8} style={[styles.legNav, { borderColor: colors.border }]}>
                  <Ionicons name="navigate-outline" size={16} color={COLORS.primary} />
                </TouchableOpacity>
              </View>
            ))
          ) : (
            tasks.map((x) => {
              const on = !!selected[x.id];
              return (
                <TouchableOpacity
                  key={x.id}
                  onPress={() => setSelected((p) => ({ ...p, [x.id]: !on }))}
                  activeOpacity={0.7}
                  style={[styles.pickRow, { borderColor: on ? COLORS.primary : colors.border, backgroundColor: on ? 'rgba(37,99,235,0.06)' : 'transparent' }]}
                >
                  <Ionicons
                    name={on ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={on ? COLORS.primary : colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickTitle, { color: colors.textPrimary }]} numberOfLines={1}>{x.title}</Text>
                    {!!x.locationAddress && (
                      <Text style={[styles.pickAddr, { color: colors.textMuted }]} numberOfLines={1}>{x.locationAddress}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          {/* Which app does the driving — a preference, so it sits at the end
              rather than competing with the route. */}
          {!!result && (
            <>
              <View style={styles.navApps}>
                {NAV_APPS.map((a) => (
                  <TouchableOpacity
                    key={a.key}
                    onPress={() => setNavApp(a.key)}
                    style={[styles.navChip, { borderColor: navApp === a.key ? COLORS.primary : colors.border }]}
                  >
                    <Text style={{ color: navApp === a.key ? COLORS.primary : colors.textMuted, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium as any }}>
                      {a.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/*
                Only Google takes a whole route in one link. Said plainly rather
                than by hiding the other two: somebody who prefers Waze should
                keep it and know they will be handed one stop at a time, not
                find the option missing and wonder whether the app forgot it.
              */}
              {!supportsMultiStop(navApp) && orderedStops.length > 1 && (
                <Text style={[styles.navNote, { color: colors.textMuted }]}>
                  {t('route.singleStopOnly', 'This app takes one stop at a time — use the arrow beside a stop to drive to it.')}
                </Text>
              )}
            </>
          )}
        </ScrollView>
      </DetentSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // ── Map furniture ───────────────────────────────────────────────────────
  floatTop: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  floatTopRight: { gap: SPACING.sm },
  fab: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },

  // Where the driver is standing: a dot, not a pin. A pin says "a place you
  // are going to", and this is the place they already are.
  originOuter: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(37,99,235,0.22)',
  },
  originInner: {
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: COLORS.primary,
    borderWidth: 2, borderColor: '#fff',
  },

  pin: { alignItems: 'center' },
  pinBubble: {
    minWidth: 26, height: 26, borderRadius: 13,
    paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  pinText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold as any },
  // The stem that plants the bubble on its coordinate.
  pinTail: {
    width: 0, height: 0, marginTop: -2,
    borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 6,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },

  // ── Sheet ───────────────────────────────────────────────────────────────
  sheetHead: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, gap: 6 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold as any, letterSpacing: -0.2 },
  sheetReset: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold as any },
  sheetMeta: { fontSize: FONT_SIZE.base },
  sheetError: { color: '#dc2626', fontSize: FONT_SIZE.sm },
  sheetNote: { fontSize: FONT_SIZE.xs, lineHeight: 15 },
  cta: {
    marginTop: SPACING.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: 14,
    borderRadius: RADIUS.lg,
  },
  ctaText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold as any },

  // ── Picking stops ───────────────────────────────────────────────────────
  pickRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md, borderWidth: 1,
    marginBottom: SPACING.sm,
  },
  pickTitle: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold as any },
  pickAddr: { fontSize: FONT_SIZE.xs, marginTop: 1 },

  // ── The ordered route ───────────────────────────────────────────────────
  // A rail with a connecting line, so the list reads as one journey rather
  // than a set of unrelated rows that happen to be numbered.
  legRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  legRail: { alignItems: 'center', width: 26 },
  legDot: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  legDotText: { color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold as any },
  legLine: { width: 2, flex: 1, minHeight: 26, marginVertical: 2 },
  legBody: { flex: 1, paddingBottom: SPACING.lg },
  legTitle: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold as any },
  legAddr: { fontSize: FONT_SIZE.xs, marginTop: 1 },
  legDrive: { fontSize: FONT_SIZE.xs, marginTop: 3, fontWeight: FONT_WEIGHT.medium as any },
  legNav: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },

  navApps: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  navNote: { fontSize: FONT_SIZE.xs, marginTop: SPACING.sm, lineHeight: 16 },
  navChip: {
    paddingVertical: 7, paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full, borderWidth: 1,
  },

  empty: { alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.xxxl },
  emptyText: { fontSize: FONT_SIZE.base, textAlign: 'center', paddingHorizontal: SPACING.lg },
});
