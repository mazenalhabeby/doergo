import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { buildNavUrl, type NavApp, type OptimizedRoute } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useHomeTasks } from '../../offline/tasks/use-home-tasks';
import { planDay, todaysPlan } from '../../offline/routes/plan-route';
import { useDriverPosition } from '../../hooks/use-driver-position';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { detectNavApps, preferredNavApp, rememberNavApp, rememberedNavApp, type InstalledNavApp } from '../../lib/nav-apps';
import {
  arrivedIdsOf, dayStops, inPlanOrder, isStalePlan, notInPlan, isStraightLine, primaryVerb, progress, routeFigures, routeState,
  type DayStop,
} from '../../lib/route-day';

/**
 * Today's route — the data, the state and the two verbs. The card only draws.
 *
 * ⚠️ NO REQUEST OF ITS OWN on opening: jobs from the home's task list, the plan
 * from the phone, the position from the OS. The server is asked only by
 * `plan()`, which the button states the cost of before it is pressed.
 */
export function useRouteDay() {
  const { user } = useAuth();
  const memberId = user?.id ?? null;
  const { tasks, load } = useHomeTasks();
  useLiveRefresh(load);
  const { position, allowed, fresh, ask } = useDriverPosition();

  const stops = useMemo(() => dayStops(tasks, memberId), [tasks, memberId]);
  const stopKey = stops.map((s) => s.id).join(',');

  /** The plan as kept on the phone — `plan` below is it, unless it was made from somewhere else. */
  const [saved, setPlan] = useState<OptimizedRoute | null>(null);
  const [planning, setPlanning] = useState(false);
  /** The server refused a plan — said on the card, never thrown. */
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!memberId) return;
    let live = true;
    void todaysPlan(memberId, stops.map((s) => s.id)).then((p) => { if (live) setPlan(p); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, stopKey]);

  const [apps, setApps] = useState<InstalledNavApp[]>([]);
  const [navApp, setNavApp] = useState<NavApp | null>(null);
  useEffect(() => {
    if (!memberId) return;
    let live = true;
    void Promise.all([detectNavApps(), rememberedNavApp(memberId)]).then(([found, saved]) => {
      if (!live) return;
      setApps(found);
      setNavApp(preferredNavApp(found, saved));
    });
    return () => { live = false; };
  }, [memberId]);
  const app: NavApp = navApp ?? preferredNavApp(apps, null);

  const arrived = useMemo(() => arrivedIdsOf(tasks), [tasks]);
  /*
    ⚠️ A plan made far from here, with nothing done yet, is no plan (the 1701 km
    bug — `isStalePlan`). "Done" is judged against the SAVED plan first: a
    driver already standing at a stop of it keeps it.
  */
  const plan = useMemo(() => {
    if (!saved) return null;
    const judged = progress(inPlanOrder(saved, stops), position, arrived);
    return isStalePlan(saved, position, judged.done.length) ? null : saved;
  }, [saved, stops, position, arrived]);
  const ordered = useMemo(() => inPlanOrder(plan, stops), [plan, stops]);
  const unplanned = useMemo(() => notInPlan(plan, stops), [plan, stops]);
  const { ahead, done } = useMemo(() => progress(ordered, position, arrived), [ordered, position, arrived]);
  const state = routeState({ stops, plan, start: position, ahead, doneCount: done.length });
  const figures = useMemo(() => routeFigures(plan, ordered, ahead, position), [plan, ordered, ahead, position]);
  const next = ahead[0];

  /** Plan — one billed request, or the phone's own order with no signal. */
  const plan_ = useCallback(async () => {
    if (!memberId || planning) return;
    setPlanning(true);
    setFailed(null);
    try { setPlan(await planDay(memberId, await fresh(), stops)); }
    catch (e) { setFailed(e instanceof Error ? e.message : String(e)); }
    finally { setPlanning(false); }
  }, [memberId, planning, fresh, stops]);

  /**
   * Drive. `stop` → that stop only (no plan or GPS needed — the address is
   * enough); none → everything still ahead, re-judged from where they are NOW,
   * in the planned order (never re-optimised: continuing is not replanning).
   */
  const drive = useCallback(async (stop?: DayStop) => {
    const from = await fresh();
    let url: string;
    if (stop) url = buildNavUrl(app, { start: from, orderedStops: [stop], nextStop: stop });
    else {
      const left = progress(ordered, from, arrived).ahead;
      if (!left.length) return;
      url = buildNavUrl(app, { start: from, orderedStops: left });
    }
    if (url) await Linking.openURL(url).catch(() => undefined);
  }, [app, fresh, ordered, arrived]);

  const chooseApp = useCallback((a: NavApp) => {
    setNavApp(a);
    if (memberId) void rememberNavApp(memberId, a);
  }, [memberId]);

  return {
    state, stops, route: plan, ordered, unplanned, ahead, done, next, position, allowed, figures,
    straight: isStraightLine(plan), verb: primaryVerb(app, done.length, next),
    app, apps, planning, failed,
    makePlan: plan_, drive, ask, chooseApp,
  };
}
