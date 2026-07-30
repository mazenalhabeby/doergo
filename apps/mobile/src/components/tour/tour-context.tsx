/**
 * Guided-tour engine (React Native). Mirrors the web TourProvider: auto-run a
 * role-appropriate tour once per screen, a Help launcher, "Take a tour", and the
 * two web bug-fixes (start() navigates to the tour's screen; dismissing marks it
 * completed so auto-run doesn't immediately re-open it).
 *
 * RN specifics: targets are measured via a ref registry (no DOM); navigation via
 * expo-router; step.enter runs a registered callback (no synthetic clicks).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { hasAccessModule, hasFeatureModule, normalizeRole } from '@hbcfield/shared/client';

import { useAuth } from '../../contexts/auth-context';
import { TOURS } from './registry';
import { createTourStorage } from './tour-storage';
import { useTargetRegistry } from './tour-target';
import { TourOverlay } from './tour-overlay';
import type { TargetRect, TourDef, TourGateContext } from './types';

interface TourContextValue {
  start: (id: string) => void;
  stop: () => void;
  availableTours: TourDef[];
  contextualTourId: string | null;
  activeTourId: string | null;
  isTourCompleted: (id: string) => boolean;
}

const Ctx = createContext<TourContextValue | null>(null);
const storage = createTourStorage();

/** Match a route against a tour's `autoRunOn` (exact or path-prefix). */
function routeMatches(pathname: string, pattern: string) {
  if (pattern === '/') return pathname === '/';
  return pathname === pattern || pathname.startsWith(pattern.endsWith('/') ? pattern : pattern + '/');
}

export function TourProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { api, measure, runAction, Provider } = useTargetRegistry();

  const [ready, setReady] = useState(false);
  const [tourId, setTourId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const activeTarget = useRef<string | null>(null);

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
      activeTarget.current = null;
      setRect(null);
      setStepIndex(0);
      setTourId(id);
    },
    [pathname, router],
  );

  const finish = useCallback(
    (complete: boolean) => {
      if (complete && tourId) storage.markCompleted(tourId);
      activeTarget.current = null;
      setRect(null);
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

  const next = useCallback(() => {
    if (!tour) return;
    if (stepIndex >= tour.steps.length - 1) {
      finish(true);
      return;
    }
    activeTarget.current = null;
    setStepIndex((i) => i + 1);
  }, [tour, stepIndex, finish]);

  const back = useCallback(() => {
    activeTarget.current = null;
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  // Do-it-with-me: run the target's registered action (if any), then advance.
  const onTapTarget = useCallback(() => {
    if (tour) runAction(tour.steps[stepIndex]!.target);
    next();
  }, [tour, stepIndex, runAction, next]);

  // Resolve the current step: navigate if needed, run enter action, then poll
  // for the target to be measurable; skip fast if it never appears.
  useEffect(() => {
    if (!tour) return;
    const step = tour.steps[stepIndex];
    if (!step) return;

    if (step.route && !routeMatches(pathname, step.route)) {
      router.push(step.route as never);
      return; // re-runs when pathname updates
    }
    if (step.enter) runAction(step.enter);

    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const find = async () => {
      if (cancelled) return;
      const r = await measure(step.target);
      if (cancelled) return;
      if (r) {
        activeTarget.current = step.target;
        setRect(r);
        return;
      }
      if (tries++ > (step.optional ? 14 : 32)) {
        // Never appeared → skip to keep the tour flowing (or end if last step).
        if (stepIndex < tour.steps.length - 1) setStepIndex((i) => i + 1);
        else finish(false);
        return;
      }
      timer = setTimeout(find, 120);
    };
    // An `enter` action often animates (tab switch / sheet). Let it settle first.
    timer = setTimeout(find, step.enter ? 480 : 80);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tour, stepIndex, pathname, router, measure, runAction, finish]);

  // Keep the spotlight glued to the target as layout shifts (scroll / async).
  useEffect(() => {
    if (!tourId) return;
    const iv = setInterval(async () => {
      if (!activeTarget.current) return;
      const r = await measure(activeTarget.current);
      if (r) setRect((prev) => (prev && r.x === prev.x && r.y === prev.y && r.height === prev.height ? prev : r));
    }, 350);
    return () => clearInterval(iv);
  }, [tourId, stepIndex, measure]);

  // Auto-run a role-appropriate tour once, the first time the user lands on its
  // route (and hasn't seen it).
  useEffect(() => {
    if (!ready || tourId || !user) return;
    const candidate = TOURS.find(
      (tr) =>
        tr.autoRunOn &&
        (tr.autoRunExact ? pathname === tr.autoRunOn : routeMatches(pathname, tr.autoRunOn)) &&
        (!tr.gate || tr.gate(gateCtx)) &&
        !storage.isCompleted(tr.id),
    );
    if (!candidate) return;
    const to = setTimeout(() => start(candidate.id), 900);
    return () => clearTimeout(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, user?.id, user?.role, tourId, ready, start]);

  const value: TourContextValue = {
    start,
    stop,
    availableTours,
    contextualTourId,
    activeTourId: tourId,
    isTourCompleted: (id) => storage.isCompleted(id),
  };

  return (
    <Ctx.Provider value={value}>
      <Provider value={api}>
        {children}
        {tour && rect && (
          <TourOverlay
            rect={rect}
            step={tour.steps[stepIndex]!}
            index={stepIndex}
            total={tour.steps.length}
            onNext={next}
            onBack={back}
            onSkip={stop}
            onTapTarget={onTapTarget}
          />
        )}
      </Provider>
    </Ctx.Provider>
  );
}

export function useTour() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTour must be used within <TourProvider>');
  return ctx;
}
