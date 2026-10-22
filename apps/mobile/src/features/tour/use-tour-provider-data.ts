import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { hasAccessModule, hasFeatureModule, normalizeRole } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { TOURS } from './registry';
import { tabAccessFor } from '../../lib/tab-layout';
import { createTourStorage } from './tour-storage';
import { useTargetRegistry } from './tour-target';
import type { TargetRect, TourGateContext } from './types';

export const storage = createTourStorage();

/** Match a route against a tour's `autoRunOn` (exact or path-prefix). */
export function routeMatches(pathname: string, pattern: string) {
  if (pattern === '/') return pathname === '/';
  return pathname === pattern || pathname.startsWith(pattern.endsWith('/') ? pattern : pattern + '/');
}

/** useTourProvider's state and handlers — everything before its markup, moved here unchanged. */
export function useTourProviderData({ children }: Pick<Pick<{ children: ReactNode }, 'children'>, 'children'>) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { api, measure, isRegistered, runAction, bringIntoView, onScrolled, Provider } = useTargetRegistry();

  const [ready, setReady] = useState(false);
  const [tourId, setTourId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  // What is ON SCREEN: a settled rectangle together with the step it belongs to.
  // The two travel as ONE value on purpose. They used to be separate, so the
  // moment `stepIndex` advanced the tooltip showed the NEW step's words over the
  // PREVIOUS step's spotlight until a measurement arrived — and since a step
  // whose target never registers is SKIPPED (most of this app's tour targets are
  // anchored on the home screens only), the member could read several steps'
  // text in a row while one unrelated card stayed highlighted. The text and the
  // highlight now change in the same render, always.
  const [shown, setShown] = useState<{ index: number; rect: TargetRect; target: string } | null>(null);
  const shownTarget = shown?.target ?? null;

  // Hydrate completion state once.
  useEffect(() => {
    storage.load().then(() => setReady(true));
  }, []);

  const gateCtx: TourGateContext = useMemo(
    () => ({
      role: user?.role ?? '',
      isAdmin: normalizeRole(user?.role ?? '') === 'ADMIN',
      // Cast the module strings / user shape — the shared helpers' param types
      // are narrower than the tour gate's generic string / the mobile User type.
      hasModule: (m) => (user ? hasAccessModule(user, m as never) : false),
      hasFeature: (f) => (user ? hasFeatureModule(user as never, f) : false),
      canManageUsers: !!user?.canManageUsers,
      canCreateTasks: !!user?.canCreateTasks,
      team: tabAccessFor(user as never).team,
    }),
    [user],
  );

  const availableTours = useMemo(() => TOURS.filter((tr) => !tr.gate || tr.gate(gateCtx)), [gateCtx]);
  const tour = useMemo(() => (tourId ? TOURS.find((t) => t.id === tourId) ?? null : null), [tourId]);

  const contextualTourId = useMemo(() => {
    const match = availableTours.find(
      (tr) => tr.autoRunOn && (tr.autoRunExact ? pathname === tr.autoRunOn : routeMatches(pathname, tr.autoRunOn)),
    );
    return match?.id ?? null;
  }, [availableTours, pathname]);

  const start = useCallback(
    (id: string) => {
      // Navigate to the tour's screen first if we're not already there, so its
      // targets resolve (the resolve effect re-runs when pathname updates).
      const tr = TOURS.find((t) => t.id === id);
      if (tr?.autoRunOn) {
        const onRoute = tr.autoRunExact ? pathname === tr.autoRunOn : routeMatches(pathname, tr.autoRunOn);
        if (!onRoute) router.push(tr.autoRunOn as never);
      }
      setShown(null);
      setStepIndex(0);
      setTourId(id);
    },
    [pathname, router],
  );

  const finish = useCallback(
    (complete: boolean) => {
      if (complete && tourId) storage.markCompleted(tourId);
      setShown(null);
      setTourId(null);
    },
    [tourId],
  );

  // Dismissing (X / skip) marks the tour seen so auto-run doesn't re-open it;
  // still replayable from the Help launcher.
  const stop = useCallback(() => {
    if (tourId) storage.markCompleted(tourId);
    finish(false);
  }, [tourId, finish]);

  // Both buttons move relative to the step ON SCREEN, not to the engine's
  // cursor. The two differ while a step is resolving — and by several steps if
  // the engine is skipping targets that never registered — so reading the cursor
  // made Next jump past a step the member never saw, and Back walk forward.
  /*
    ⚠️ BACK LANDS ON A STEP THAT CAN BE SHOWN. Stepping to `index - 1` when that
    step's target was missing made the engine skip it forward again — Back
    re-showed the same step, and the member could never go back past a gap.
    A step on another route is assumed reachable: its screen is not mounted
    until the engine navigates there.
  */
  const reachable = useCallback(
    (i: number) => {
      const st = tour?.steps[i];
      if (!st) return false;
      if (st.route && !routeMatches(pathname, st.route)) return true;
      return isRegistered(st.target);
    },
    [tour, pathname, isRegistered],
  );
  const next = useCallback(() => {
    if (!tour) return;
    const from = shown?.index ?? stepIndex;
    // Straight to the next step that can be shown — stepping into a missing
    // target left the old card up for up to four seconds while it gave up.
    let i = from + 1;
    while (i < tour.steps.length && !reachable(i)) i++;
    if (i >= tour.steps.length) {
      finish(true);
      return;
    }
    setStepIndex(i);
  }, [tour, stepIndex, shown, finish, reachable]);

  const back = useCallback(() => {
    let i = (shown?.index ?? stepIndex) - 1;
    while (i > 0 && !reachable(i)) i--;
    setStepIndex(Math.max(0, i));
  }, [shown, stepIndex, reachable]);

  // Do-it-with-me: run the action of the target the member is LOOKING at, then
  // advance. Reading it off `shown` rather than `stepIndex` means a tap during
  // the ~130ms handover can never fire the next step's action.
  const onTapTarget = useCallback(() => {
    if (shownTarget) runAction(shownTarget);
    next();
  }, [shownTarget, runAction, next]);

  return {
    user,
    pathname,
    router,
    api,
    measure,
    runAction,
    bringIntoView,
    onScrolled,
    Provider,
    ready,
    tourId,
    stepIndex,
    setStepIndex,
    shown,
    setShown,
    shownTarget,
    gateCtx,
    availableTours,
    tour,
    contextualTourId,
    start,
    finish,
    stop,
    reachable,
    next,
    back,
    onTapTarget,
  };
}
