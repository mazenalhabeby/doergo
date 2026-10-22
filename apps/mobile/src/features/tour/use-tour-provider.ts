import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Dimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { hasAccessModule, hasFeatureModule, normalizeRole } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { TOURS } from './registry';
import { tabAccessFor } from '../../lib/tab-layout';
import { createTourStorage } from './tour-storage';
import { useTargetRegistry } from './tour-target';
import {
  beginSettle,
  boxesAgree,
  isDrawableBox,
  settleTick,
  MEASURE_INTERVAL_MS,
  type Viewport,
} from './measure';
import type { TargetRect, TourDef, TourGateContext } from './types';
import { useTourProviderData, storage, routeMatches } from './use-tour-provider-data';
export { storage, routeMatches } from './use-tour-provider-data';

export interface TourContextValue {
  start: (id: string) => void;
  stop: () => void;
  availableTours: TourDef[];
  contextualTourId: string | null;
  activeTourId: string | null;
  isTourCompleted: (id: string) => boolean;
}

/**
 * A step's `enter` action usually ANIMATES (a tab switching, a sheet opening).
 * This is not a settle time — the stability loop does that — it is only long
 * enough that the animation has STARTED, so the loop cannot mistake the two
 * pre-animation frames for the final position. It replaces the 480ms guess that
 * used to stand in for the whole wait.
 */
export const ENTER_ANIMATION_START_MS = 120;

/**
 * How long to keep looking for a target that hasn't registered yet, before
 * skipping the step. Unchanged in wall-clock terms from the counts this
 * replaces (14/32 tries at 120ms) — an `optional` step gives up sooner because
 * its target legitimately may not exist at all.
 */
export const ABSENT_BUDGET_MS = { optional: 1700, required: 3800 };

/**
 * Backstop re-measure once a step has settled. The list moving is delivered by
 * `onScrolled` (a real signal, not a timer); this catches what no signal
 * reports — a sheet collapsing above the target, a card growing as data lands.
 * It stops entirely while the app is backgrounded, and never sets state unless
 * the rectangle actually moved.
 */
export const IDLE_RECHECK_MS = 900;

/**
 * Bringing a target into view may need a second go: the list header grows as
 * today's jobs arrive, and a target scrolled to perfectly a moment ago is
 * pushed back off the bottom. Capped, and never twice inside one cooldown —
 * a scroll takes ~300ms and re-issuing one mid-flight fights the animation,
 * which is its own kind of never settling.
 */
export const MAX_SCROLL_ATTEMPTS = 3;

export const SCROLL_COOLDOWN_TICKS = 8;

/** The screen, as the geometry rules judge a rect against it. */
export function viewportOf(): Viewport {
  const { width, height } = Dimensions.get('window');
  return { width, height };
}

/** TourProvider's state and handlers — everything before its markup, moved here unchanged. */
export function useTourProvider({ children }: Pick<{ children: ReactNode }, 'children'>) {
  const {
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
  } = useTourProviderData({ children });

  // Resolve the current step: navigate if needed, run the enter action, wait for
  // the target to register, BRING IT INTO VIEW — and then measure until it stops
  // moving rather than measuring once after a guess.
  //
  // Two bugs this fixes. (1) The engine never scrolled, so a target below the
  // fold was measured off-screen and the spotlight was drawn outside the screen
  // or clipped to an edge — on the home screens most tour targets sit inside a
  // long list, so this was the common case, not the exotic one. (2) The single
  // measurement after `step.enter ? 480 : 80` raced whatever the screen was
  // doing (a tab animating, a sheet opening, tasks arriving), and a 350ms poll
  // then dragged the spotlight to the right place in full view of the member.
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
    let absentTicks = 0;
    let settle = beginSettle();
    let scrollAttempts = 0;
    let ticksSinceScroll = SCROLL_COOLDOWN_TICKS; // the first attempt is immediate
    let timer: ReturnType<typeof setTimeout>;

    const absentLimit = Math.ceil(
      (step.optional ? ABSENT_BUDGET_MS.optional : ABSENT_BUDGET_MS.required) / MEASURE_INTERVAL_MS,
    );

    // Never registered (a screen without that anchor, a conditional card), or
    // never held still, or off-screen with no scrollable to fix it → skip to
    // keep the tour flowing (or end if this was the last step). Keep the last
    // SETTLED step on screen, so the member never sees new words over an old
    // spotlight, and never a spotlight over nothing.
    const giveUp = () => {
      if (stepIndex < tour.steps.length - 1) setStepIndex((i) => i + 1);
      else finish(false);
    };

    const tick = async () => {
      if (cancelled) return;
      const r = await measure(step.target);
      if (cancelled) return;

      if (!r) {
        if (absentTicks++ > absentLimit) return giveUp();
        timer = setTimeout(tick, MEASURE_INTERVAL_MS);
        return;
      }

      // Ask the focused screen's list to bring it into view. `bringIntoView`
      // answers false when it is already comfortably visible (or when no screen
      // registered a list at all), so this costs nothing in the common case.
      ticksSinceScroll++;
      if (
        scrollAttempts < MAX_SCROLL_ATTEMPTS &&
        ticksSinceScroll >= SCROLL_COOLDOWN_TICKS &&
        bringIntoView(r, viewportOf())
      ) {
        scrollAttempts++;
        ticksSinceScroll = 0;
        settle = beginSettle(); // every reading taken before the scroll is now worthless
        timer = setTimeout(tick, MEASURE_INTERVAL_MS);
        return;
      }

      const { state, status, box } = settleTick(settle, r, viewportOf());
      settle = state;
      if (status === 'measuring') {
        timer = setTimeout(tick, MEASURE_INTERVAL_MS);
        return;
      }
      if (!box) return giveUp(); // exhausted with nothing drawable — a wrong spotlight is worse than a skipped step
      setShown({ index: stepIndex, rect: box, target: step.target });
    };

    // An `enter` action usually starts an animation; give it a frame or two to
    // start (not to finish — the loop decides when it has finished).
    timer = setTimeout(tick, step.enter ? ENTER_ANIMATION_START_MS : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tour, stepIndex, pathname, router, measure, runAction, bringIntoView, finish]);

  // Once a step has settled, keep the spotlight glued to its target — driven by
  // the list actually moving, with a slow backstop, instead of re-measuring
  // every 350ms for the life of the tour. Both paths go through the same guard:
  // a reading not worth drawing is ignored rather than rendered, and an
  // unchanged reading never touches state, so a still screen costs no renders.
  useEffect(() => {
    if (!tourId || !shownTarget) return;
    let cancelled = false;

    const update = async () => {
      const r = await measure(shownTarget);
      if (cancelled || !r || !isDrawableBox(r, viewportOf())) return;
      setShown((prev) =>
        !prev || prev.target !== shownTarget || boxesAgree(prev.rect, r) ? prev : { ...prev, rect: r },
      );
    };

    const unsubscribe = onScrolled(update);

    // The backstop runs only while the app is on screen: a tour left open in the
    // background has nothing to re-measure, and a timer there is pure battery.
    let iv: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (!iv) iv = setInterval(update, IDLE_RECHECK_MS);
    };
    const stopPolling = () => {
      if (iv) clearInterval(iv);
      iv = null;
    };
    if (AppState.currentState === 'active') startPolling();
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void update(); // catch up on whatever moved while we were away
        startPolling();
      } else stopPolling();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      stopPolling();
      appSub.remove();
    };
  }, [tourId, shownTarget, measure, onScrolled]);

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

  /*
    ⚠️ "STEP 4 OF 6" ON THE FIRST CARD ANYBODY SAW. The counter used the
    registry's list, so every step whose target is not on this member's screen
    (no crew, no time off, an empty list) was counted and never shown. It counts
    what can be shown now: the steps whose targets are mounted, plus any that
    wait on another screen.
  */
  const progress = useMemo(() => {
    if (!tour || !shown) return { position: 1, total: 1 };
    let position = 0;
    let total = 0;
    tour.steps.forEach((_, i) => {
      if (i === shown.index || reachable(i)) {
        total++;
        if (i <= shown.index) position++;
      }
    });
    return { position, total };
  }, [tour, shown, reachable]);

  // One object per change of its parts, so `useTour()` readers re-render only when one moves.
  const value = useMemo<TourContextValue>(() => ({
    start, stop, availableTours, contextualTourId, activeTourId: tourId,
    isTourCompleted: (id) => storage.isCompleted(id),
  }), [start, stop, availableTours, contextualTourId, tourId]);

  return {
    api,
    Provider,
    shown,
    tour,
    stop,
    next,
    back,
    onTapTarget,
    progress,
    value,
  };
}
