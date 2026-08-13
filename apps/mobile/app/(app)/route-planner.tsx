import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
  Linking, Platform, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { tasksApi, TaskStatus, type Task } from '../../src/lib/api';
import { routesApi } from '../../src/lib/api';
import { useTheme } from '../../src/contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';
import {
  buildGoogleMapsUrl, buildNavUrl, supportsMultiStop,
  type NavApp, type RouteStop, type OptimizedRoute,
} from '@hbcfield/shared/client';

type LatLng = { lat: number; lng: number; label?: string };

const OPEN_HIDDEN = [TaskStatus.COMPLETED, TaskStatus.CANCELED, TaskStatus.CLOSED] as string[];
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

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [start, setStart] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [navApp, setNavApp] = useState<NavApp>(Platform.OS === 'ios' ? 'apple' : 'google');
  const [result, setResult] = useState<OptimizedRoute | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the worker's open tasks that have a location.
  const load = useCallback(async () => {
    try {
      const all = await tasksApi.list({ limit: 100 } as any);
      const withLoc = (all || []).filter(
        (x) => x.locationLat != null && x.locationLng != null && !OPEN_HIDDEN.includes(x.status as string),
      );
      setTasks(withLoc);
      // Preselect all by default.
      setSelected(Object.fromEntries(withLoc.map((x) => [x.id, true])));
    } catch (e: any) {
      setError(e?.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('route.title', 'Plan my route')}</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: SPACING.md, paddingBottom: SPACING.xl }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={COLORS.primary} />}
      >
        {/* Start */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>{t('route.start', 'Start')}</Text>
          <TouchableOpacity onPress={useMyLocation} style={styles.startRow} disabled={locating}>
            {locating ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="locate" size={18} color={COLORS.primary} />}
            <Text style={{ color: colors.textPrimary, fontSize: FONT_SIZE.sm }}>
              {start ? `${start.label} (${start.lat.toFixed(3)}, ${start.lng.toFixed(3)})` : t('route.useMyLocation', 'Use my location')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Map preview */}
        {(start || stops.length > 0) && (
          <View style={[styles.mapWrap, { borderColor: colors.border }]}>
            <MapView
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              style={StyleSheet.absoluteFill}
              initialRegion={{
                latitude: start?.lat ?? stops[0]?.lat ?? 48.2,
                longitude: start?.lng ?? stops[0]?.lng ?? 16.37,
                latitudeDelta: 0.15, longitudeDelta: 0.15,
              }}
            >
              {start && <Marker coordinate={{ latitude: start.lat, longitude: start.lng }} title={start.label} pinColor="#111" />}
              {(result ? orderedStops : stops).map((s, i) => (
                <Marker key={s.id} coordinate={{ latitude: s.lat, longitude: s.lng }} title={`${result ? i + 1 + '. ' : ''}${s.label ?? ''}`} />
              ))}
              {polyline.length > 1 && <Polyline coordinates={polyline} strokeColor={COLORS.primary} strokeWidth={4} />}
            </MapView>
          </View>
        )}

        {/* Stops */}
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('route.todaysStops', "Today's stops")}</Text>
          <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.xs }}>{selectedCount} {t('route.selected', 'selected')}</Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginVertical: SPACING.lg }} color={COLORS.primary} />
        ) : tasks.length === 0 ? (
          <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.sm, textAlign: 'center', paddingVertical: SPACING.lg }}>
            {t('route.noStops', 'No tasks with a location. Add a location to a task to route to it.')}
          </Text>
        ) : (
          tasks.map((x) => {
            const on = !!selected[x.id];
            return (
              <TouchableOpacity
                key={x.id}
                onPress={() => setSelected((p) => ({ ...p, [x.id]: !on }))}
                style={[styles.stopRow, { backgroundColor: colors.card, borderColor: on ? COLORS.primary : colors.border }]}
              >
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? COLORS.primary : colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium as any }} numberOfLines={1}>{x.title}</Text>
                  {!!x.locationAddress && <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.xs }} numberOfLines={1}>{x.locationAddress}</Text>}
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {!!error && <Text style={{ color: '#dc2626', fontSize: FONT_SIZE.sm, marginTop: SPACING.sm }}>{error}</Text>}

        {/* Optimize */}
        <TouchableOpacity
          onPress={optimize}
          disabled={optimizing || selectedCount === 0}
          style={[styles.primaryBtn, { backgroundColor: selectedCount === 0 ? colors.textMuted : COLORS.primary }]}
        >
          {optimizing ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="git-network" size={18} color="#fff" />}
          <Text style={styles.primaryBtnText}>{t('route.optimize', 'Optimize route')}</Text>
        </TouchableOpacity>

        {/* Result */}
        {result && (
          <View style={{ marginTop: SPACING.lg }}>
            <View style={[styles.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Stat label={t('route.distance', 'Distance')} value={fmtKm(result.totalMeters)} colors={colors} />
              <Stat label={t('route.driveTime', 'Drive time')} value={fmtDur(result.totalSeconds)} colors={colors} />
              <Stat label={t('route.stops', 'Stops')} value={String(result.order.length)} colors={colors} />
            </View>

            {/* Nav app selector */}
            <View style={styles.navApps}>
              {NAV_APPS.map((a) => (
                <TouchableOpacity
                  key={a.key}
                  onPress={() => setNavApp(a.key)}
                  style={[styles.navChip, { borderColor: navApp === a.key ? COLORS.primary : colors.border, backgroundColor: navApp === a.key ? COLORS.primary + (isDark ? '30' : '15') : 'transparent' }]}
                >
                  <Text style={{ color: navApp === a.key ? COLORS.primary : colors.textMuted, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium as any }}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {supportsMultiStop(navApp) && (
              <TouchableOpacity onPress={openFullRoute} style={[styles.primaryBtn, { backgroundColor: COLORS.primary, marginTop: SPACING.sm }]}>
                <Ionicons name="navigate" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>{t('route.openFull', 'Open full route')}</Text>
              </TouchableOpacity>
            )}

            {/* Ordered stops */}
            <View style={{ marginTop: SPACING.md, gap: 8 }}>
              {orderedStops.map((s, i) => {
                const leg = result.legs[i];
                return (
                  <View key={s.id} style={[styles.orderedRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.orderNum}><Text style={styles.orderNumText}>{i + 1}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium as any }} numberOfLines={1}>{s.label}</Text>
                      {leg && <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.xs }}>{fmtKm(leg.meters)} · {fmtDur(leg.seconds)}</Text>}
                    </View>
                    <TouchableOpacity onPress={() => navTo(s)} style={styles.navBtn}>
                      <Ionicons name="navigate-outline" size={16} color={COLORS.primary} />
                      <Text style={{ color: COLORS.primary, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium as any }}>{t('route.navigate', 'Go')}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.textMuted, fontSize: FONT_SIZE.xs }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold as any }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold as any },
  card: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  cardLabel: { fontSize: FONT_SIZE.xs, marginBottom: 6 },
  startRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mapWrap: { height: 200, borderRadius: RADIUS.md, borderWidth: 1, overflow: 'hidden', marginBottom: SPACING.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  sectionTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold as any },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: 8 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: RADIUS.md, marginTop: SPACING.md },
  primaryBtnText: { color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold as any },
  statsRow: { flexDirection: 'row', borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm },
  navApps: { flexDirection: 'row', gap: 8, marginTop: SPACING.md },
  navChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  orderedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm },
  orderNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  orderNumText: { color: '#fff', fontSize: FONT_SIZE.xs, fontWeight: '700' },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.sm },
});
