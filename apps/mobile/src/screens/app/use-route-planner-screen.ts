import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Linking, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView from 'react-native-maps';
import { type Detent } from '../../components/route/detent-sheet';
import {
  detectNavApps,
  navDecision,
  preferredNavApp,
  rememberedNavApp,
  soleNavApp,
  type InstalledNavApp,
} from '../../lib/nav-apps';
import { useTranslation } from 'react-i18next';
import { getFix } from '../../lib/location-fix';
import { tasksApi, type Task } from '../../lib/api';
import { isMyRouteStop, hasArrived } from '../../lib/my-route';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import {
  buildGoogleMapsUrl,
  buildNavUrl,
  stopsAheadOf,
  type NavApp,
  type RouteStop,
  type OptimizedRoute,
} from '@hbcfield/shared/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOffline } from '../../offline/offline-context';
import { overlayTask } from '../../offline/tasks/overlay';
import { restoreRoute } from '../../offline/routes/saved-route';
import { planDay } from '../../offline/routes/plan-route';
import { isStalePlan } from '../../lib/route-day';
import { useRoutePlannerScreenData } from './use-route-planner-screen-data';
export { type LatLng } from './use-route-planner-screen-data';

/** RoutePlannerScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useRoutePlannerScreen() {
  const {
    colors,
    t,
    user,
    tasks,
    loading,
    selected,
    setSelected,
    start,
    setStart,
    locating,
    setNavApp,
    navApps,
    setNavApps,
    chooserFor,
    setChooserFor,
    result,
    setResult,
    optimizing,
    error,
    setError,
    load,
    locateMe,
    stops,
    optimize,
    orderedStops,
    polyline,
    straightLine,
  } = useRoutePlannerScreenData();

  /** Distance and time for the drive that ARRIVES at ordered stop `i`. */
  const legTo = useCallback((i: number) => result?.legs?.[i] ?? null, [result]);

  const openFullRoute = () => { void resumeRoute(); };
  useEffect(() => {
    let alive = true;
    detectNavApps().then((found) => {
      if (!alive) return;
      setNavApps(found);
      // The member's remembered app when it is still installed — the SAME
      // choice the home's route card uses (lib/nav-apps.ts) — else one that exists.
      void (user?.id ? rememberedNavApp(user.id) : Promise.resolve(null)).then((saved) => {
        if (alive) setNavApp(preferredNavApp(found, saved));
      });
    });
    return () => { alive = false; };
  }, [user?.id]);

  /** Hand the driving off. `stop` null means the whole route. */
  const openIn = useCallback((app: NavApp, stop: RouteStop | null) => {
    if (!start) return;
    const url = stop
      ? buildNavUrl(app, { start, orderedStops, nextStop: stop })
      : buildGoogleMapsUrl(start, orderedStops);
    if (!url) return;
    Linking.openURL(url).catch(() => {
      setError(t('route.navFailed', 'Could not open that map app.'));
    });
  }, [start, orderedStops, t]);

  /*
    One tap, three outcomes, decided by what is on the phone.

    Several apps → ask. One, or none detected → go straight there; a question
    with a single answer is a step, not a choice. Note that a WHOLE route only
    Google can take, so that path does not ask at all.
  */
  const startNavigation = useCallback((stop: RouteStop | null) => {
    if (stop === null) { openIn('google', null); return; }
    if (navDecision(navApps) === 'choose') { setChooserFor({ stop }); return; }
    openIn(soleNavApp(navApps), stop);
  }, [navApps, openIn]);

  /*
    Stops already behind the driver.

    Pressing Start navigation at the second stop used to rebuild the whole trip
    from where the phone was when the screen opened — through stop one, which
    the driver had already done. A route link is a list of waypoints, and a
    waypoint already visited is a detour they have to argue with.
  */
  const arrivedIds = useMemo(
    () => new Set(tasks.filter(hasArrived).map((x) => x.id)),
    [tasks],
  );
  /*
    What is left, by the same rule the button uses — recorded arrivals plus
    "you are standing at it". `start` tracks the driver's position, so the
    count and the tick marks follow them down the route.
  */
  const toDrive = useMemo(
    () => stopsAheadOf(start, orderedStops, arrivedIds),
    [start, orderedStops, arrivedIds],
  );
  const aheadIds = useMemo(() => new Set(toDrive.map((s) => s.id)), [toDrive]);

  /*
    Resume, rather than replay.

    Two things are refreshed at the moment of pressing, not at screen load: the
    driver's position, because they have moved since, and which stops are left.
    Without both, the link is a plan for a morning that has already partly
    happened.
  */
  const [resuming, setResuming] = useState(false);
  const resumeRoute = useCallback(async () => {
    if (!result) return;
    setError(null);
    setResuming(true);

    // Where they are NOW, not where the phone was when the screen opened.
    let from = start;
    try {
      const pos = await getFix({ purpose: 'tap' });
      from = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: t('route.myLocation', 'My location') };
      setStart(from);
    } catch {
      // Keep the origin we already had rather than refusing to navigate.
    } finally {
      setResuming(false);
    }

    /*
      Standing at stop one means the next drive is to stop two.

      The planned ORDER is untouched — this only decides where in it the driver
      currently is. Re-optimising here would hand back a different route from
      the one on screen, which is not what continuing a route means.
    */
    const ahead = stopsAheadOf(from, orderedStops, arrivedIds);
    if (ahead.length === 0) {
      setError(t('route.allDone', 'Every stop on this route is done.'));
      return;
    }
    if (!from) return;
    const url = buildGoogleMapsUrl(from, ahead);
    if (url) Linking.openURL(url).catch(() => setError(t('route.navFailed', 'Could not open that map app.')));
  }, [result, orderedStops, arrivedIds, start, t]);

  // One callback for every pick row, so `memo(PickRow)` holds.
  const toggleStop = useCallback((id: string) => setSelected((p) => ({ ...p, [id]: !p[id] })), []);

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

  return {
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
  };
}

/** What RoutePlannerScreen and its sections read. */
export type RoutePlannerScreenState = ReturnType<typeof useRoutePlannerScreen>;
