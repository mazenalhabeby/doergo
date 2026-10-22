import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { type InstalledNavApp } from '@/lib/nav-apps';
import { useTranslation } from 'react-i18next';
import { getFix } from '@/lib/location-fix';
import { tasksApi, type Task } from '@/lib/api';
import { isMyRouteStop, hasArrived } from '@/lib/my-route';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { type NavApp, type RouteStop, type OptimizedRoute } from '@hbcfield/shared/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOffline } from '@/offline/offline-context';
import { overlayTask } from '@/offline/tasks/overlay';
import { restoreRoute } from '@/offline/routes/saved-route';
import { planDay } from '@/offline/routes/plan-route';
import { isStalePlan } from '@/lib/route-day';
import { caught } from '@/lib/caught';

export type LatLng = { lat: number; lng: number; label?: string };

/** useRoutePlannerScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useRoutePlannerScreenData() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { user } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [start, setStart] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [navApp, setNavApp] = useState<NavApp>(Platform.OS === 'ios' ? 'apple' : 'google');
  /*
    Which map apps this phone actually has, and what to do with a tap.

    Asked once when the screen opens rather than at the moment of the tap: the
    probe is cheap but it is asynchronous, and a navigation button that pauses
    before doing anything feels broken in a way a spinner does not fix.
  */
  const [navApps, setNavApps] = useState<InstalledNavApp[]>([]);
  const [chooserFor, setChooserFor] = useState<{ stop: RouteStop | null } | null>(null);
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
  const offline = useOffline();
  const load = useCallback(async () => {
    try {
      /*
        The phone's copy when it has one — the planner is opened on the road as
        often as in the yard. The server otherwise, as before.
      */
      let all: Task[] | null = null;
      if (offline.records && offline.engine && (await offline.records.cursor('tasks')).lastPullAt !== null) {
        const ops = offline.engine.operations();
        all = (await offline.records.list<Task>('tasks')).map((r) => overlayTask(r.data, ops) as Task);
      }
      all ??= await tasksApi.list({ limit: 100 });
      const mine = (all || []).filter((x) => isMyRouteStop(x, user?.id));
      setTasks(mine);
      // Preselect all by default.
      setSelected(Object.fromEntries(mine.map((x) => [x.id, true])));
    } catch (e: unknown) {
      setError(caught(e).message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [user?.id, offline.records, offline.engine]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    locateMe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /*
    ⚠️ NOT A HOOK, and it used to be called `useMyLocation`.

    Everything named `use*` is a hook as far as the rules-of-hooks lint is
    concerned, so this plain async function made the linter report two errors it
    could do nothing about — and a file whose errors are known-false is a file
    nobody reads the errors of. It was also simply untrue: it takes no state,
    returns nothing, and is called from a button.
  */
  const locateMe = async () => {
    setLocating(true);
    try {
      const pos = await getFix({ purpose: 'pick', ask: true });
      setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: t('route.myLocation', 'My location') });
    } catch {
      /* ignore */
    } finally {
      setLocating(false);
    }
  };

  const stops: RouteStop[] = useMemo(
    () =>
      tasks
        .filter((x) => selected[x.id])
        .map((x) => ({
          id: x.id,
          lat: x.locationLat as number,
          lng: x.locationLng as number,
          label: x.title,
          address: x.locationAddress,
        })),
    [tasks, selected],
  );

  // Today's plan, if one was made — shown at once, with or without signal.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || loading || !user?.id || tasks.length === 0) return;
    restored.current = true;
    void restoreRoute(
      AsyncStorage,
      user.id,
      tasks.map((x) => x.id),
    ).then((plan) => {
      if (!plan) return;
      restoredPlan.current = plan;
      setResult((current) => current ?? plan);
    });
  }, [loading, tasks, user?.id]);

  /*
    ⚠️ A saved plan made FAR from here, with nothing done yet, is not today's
    plan — the home card's 1701 km bug (`isStalePlan`, shared with the card).
    Judged once the driver's position is known; a plan the driver made on this
    screen is never second-guessed, only the restored one.
  */
  const restoredPlan = useRef<typeof result>(null);
  useEffect(() => {
    const plan = restoredPlan.current;
    if (!plan || result !== plan || !start) return;
    const arrived = tasks.filter((x) => plan.order.includes(x.id) && hasArrived(x)).length;
    if (isStalePlan(plan, start, arrived)) {
      restoredPlan.current = null;
      setResult(null);
    }
  }, [start, result, tasks]);

  const optimize = async () => {
    setError(null);
    const from = start ?? (stops[0] ? { lat: stops[0].lat, lng: stops[0].lng } : null);
    if (!from) {
      setError(t('route.needStart', 'Turn on location to set your start point'));
      return;
    }
    const list = start ? stops : stops.slice(1);
    if (list.length === 0) {
      setError(t('route.needStops', 'Select at least one stop'));
      return;
    }
    setOptimizing(true);
    try {
      // ONE implementation with the home's route card (offline/routes/plan-route.ts).
      const r = user?.id ? await planDay(user.id, start, stops) : null;
      if (r) setResult(r);
    } catch (e: unknown) {
      setError(caught(e).message || 'Could not optimize the route');
    } finally {
      setOptimizing(false);
    }
  };

  const orderedStops: RouteStop[] = useMemo(() => {
    if (!result) return [];
    const byId = new Map(stops.map((s) => [s.id, s]));
    return result.order.map((id) => byId.get(id)).filter(Boolean) as RouteStop[];
  }, [result, stops]);

  const polyline = useMemo(() => {
    // GeoJSON from the routing engine (a LineString); anything else draws no line.
    const g = result?.geometry as { coordinates?: unknown } | null | undefined;
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

  return {
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
  };
}
