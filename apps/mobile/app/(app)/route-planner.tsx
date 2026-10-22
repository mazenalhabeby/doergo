import { memo, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator,
  Linking, Platform, RefreshControl, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { DetentSheet, type Detent } from '@/features/route/detent-sheet';
import { BlurSheet } from '@/components/blur-sheet';
import { SheetPanel } from '@/components/sheet-panel';
import {
  detectNavApps,
  navDecision,
  preferredNavApp,
  rememberNavApp,
  rememberedNavApp,
  soleNavApp,
  type InstalledNavApp,
} from '@/lib/nav-apps';
import { PressableScale } from '@/components/pressable-scale';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getFix } from '@/lib/location-fix';
import { tasksApi, type Task } from '@/lib/api';
import { isMyRouteStop, hasArrived } from '@/lib/my-route';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '@/lib/constants';
import {
  buildGoogleMapsUrl,
  buildNavUrl,
  stopsAheadOf,
  type NavApp,
  type RouteStop,
  type OptimizedRoute,
  formatDuration,
} from '@hbcfield/shared/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOffline } from '@/offline/offline-context';
import { overlayTask } from '@/offline/tasks/overlay';
import { restoreRoute } from '@/offline/routes/saved-route';
import { planDay } from '@/offline/routes/plan-route';
import { isStalePlan } from '@/lib/route-day';
import { formatDistance } from '@/lib/distance';
import { useRoutePlannerScreen } from '@/features/route/use-route-planner-screen';
import { fmtDur, LegRow, PickRow, styles } from '@/features/route/route-planner-screen-helpers';
import { RoutePlannerScreenYourRoute } from '@/features/route/route-planner-screen-your-route';

export default function RoutePlannerScreen() {
  const vm = useRoutePlannerScreen();
  const {
    colors,
    t,
    user,
    tasks,
    loading,
    selected,
    start,
    locating,
    setNavApp,
    navApps,
    chooserFor,
    setChooserFor,
    result,
    setResult,
    optimizing,
    error,
    load,
    locateMe,
    stops,
    optimize,
    orderedStops,
    polyline,
    straightLine,
    legTo,
    openFullRoute,
    openIn,
    startNavigation,
    toDrive,
    aheadIds,
    resuming,
    toggleStop,
    selectedCount,
    insets,
    mapRef,
    detent,
    setDetent,
    fitToRoute,
    listStops,
  } = vm;

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
              <View
                style={[
                  styles.pinBubble,
                  {
                    backgroundColor: result ? COLORS.primary : colors.card,
                    borderColor: result ? COLORS.primary : colors.border,
                  },
                ]}>
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
        <PressableScale
          onPress={() => router.back()}
          style={[styles.fab, { backgroundColor: colors.card, borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Back')}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </PressableScale>
        <View style={styles.floatTopRight}>
          <PressableScale
            onPress={() => {
              locateMe();
              fitToRoute(true);
            }}
            style={[styles.fab, { backgroundColor: colors.card, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={t('route.useMyLocation', 'Use my location')}>
            {locating
              ? <ActivityIndicator size="small" color={COLORS.primary} />
              : <Ionicons name="locate" size={20} color={COLORS.primary} />}
          </PressableScale>
          <PressableScale
            onPress={() => fitToRoute(true)}
            style={[styles.fab, { backgroundColor: colors.card, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={t('route.fitRoute', 'Show the whole route')}>
            <Ionicons name="scan-outline" size={20} color={colors.textPrimary} />
          </PressableScale>
        </View>
      </View>

      <RoutePlannerScreenYourRoute vm={vm} />

      {/*
        Asked only when the answer is not already obvious — see navDecision.
        Reuses the app's one sheet presentation rather than inventing a second.
      */}
      <BlurSheet visible={!!chooserFor} onClose={() => setChooserFor(null)}>
        {/* Surface, handle and the safe bottom from SheetPanel — drawn by hand
            this sheet ended in a flat 32px foot, which on Android put the last
            row behind the navigation keys. */}
        <SheetPanel
          title={t('route.chooseApp', 'Open with')}
          onClose={() => setChooserFor(null)}
          style={styles.chooser}
        >
          {navApps.map((a) => (
            <TouchableOpacity
              key={a.key}
              style={[styles.chooserRow, { borderColor: colors.border }]}
              onPress={() => {
                const stop = chooserFor?.stop ?? null;
                setChooserFor(null);
                setNavApp(a.key);
                if (user?.id) void rememberNavApp(user.id, a.key); // remembered for the card too
                openIn(a.key, stop);
              }}
            >
              <Ionicons name="navigate" size={18} color={COLORS.primary} />
              <Text style={[styles.chooserLabel, { color: colors.textPrimary }]}>{a.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.chooserCancel} onPress={() => setChooserFor(null)}>
            <Text style={[styles.chooserCancelText, { color: colors.textMuted }]}>
              {t('common.cancel', 'Cancel')}
            </Text>
          </TouchableOpacity>
        </SheetPanel>
      </BlurSheet>
    </View>
  );
}
