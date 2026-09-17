/**
 * Tour target registry — the RN replacement for the web's `data-tour` +
 * `document.querySelector`. Screens register a View under a string key; the
 * engine measures it on demand via `measureInWindow`. Screens can also register
 * an "enter action" (e.g. switch a tab / open a sheet) that a step invokes.
 *
 * Open/closed: adding tour coverage to a screen is just tagging Views with
 * `useTourTarget(key)` / `<TourTarget>` — no engine changes.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { isComfortablyInView, offsetToCentre, type Box, type Viewport } from './measure';
import type { TargetRect } from './types';

/**
 * The screen's scrollable, as the engine needs it: where it is scrolled to, and
 * how to send it somewhere else. A list can only be told an ABSOLUTE offset, so
 * both halves are required — see `offsetToCentre`.
 */
interface Scroller {
  offsetY: () => number;
  scrollToY: (y: number) => void;
}

/** The two RN scroll components, by the only methods we call. */
interface ScrollLike {
  scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void;
  scrollTo?: (opts: { y: number; animated?: boolean }) => void;
}

interface TargetRegistry {
  register: (name: string, node: View | null) => void;
  registerAction: (name: string, fn: (() => void) | null) => void;
  /** The FOCUSED screen's scrollable (see `useTourScroll`). */
  registerScroller: (s: Scroller | null) => void;
  /** Tell the engine the list moved, so it can re-measure without polling. */
  notifyScroll: () => void;
}

const Ctx = createContext<TargetRegistry | null>(null);

/**
 * Owns the name→node and name→action maps + the measure/runAction helpers.
 * Used by <TourProvider>; returns the context Provider to wrap the app with.
 */
export function useTargetRegistry() {
  const nodes = useRef(new Map<string, View>());
  const actions = useRef(new Map<string, () => void>());
  const scroller = useRef<Scroller | null>(null);
  const scrollListener = useRef<(() => void) | null>(null);

  const register = useCallback((name: string, node: View | null) => {
    if (node) nodes.current.set(name, node);
    else nodes.current.delete(name);
  }, []);

  const registerAction = useCallback((name: string, fn: (() => void) | null) => {
    if (fn) actions.current.set(name, fn);
    else actions.current.delete(name);
  }, []);

  /** Measure a registered target in window coordinates (null if absent/zero-size). */
  const measure = useCallback((name: string): Promise<TargetRect | null> => {
    return new Promise((resolve) => {
      const node = nodes.current.get(name);
      if (!node || typeof node.measureInWindow !== 'function') return resolve(null);
      node.measureInWindow((x, y, width, height) => {
        if (!width && !height) resolve(null);
        else resolve({ x, y, width, height });
      });
    });
  }, []);

  const runAction = useCallback((name: string) => {
    actions.current.get(name)?.();
  }, []);

  const registerScroller = useCallback((s: Scroller | null) => {
    scroller.current = s;
  }, []);

  const notifyScroll = useCallback(() => {
    scrollListener.current?.();
  }, []);

  /**
   * Scroll the focused screen so a measured target is on screen.
   *
   * Returns whether it asked for a scroll — the caller waits and re-measures if
   * it did. `false` means the target is already comfortably visible, OR the
   * screen registered no scrollable at all (a tab bar button, a header): the
   * engine then falls back to refusing to draw an off-screen rect, which is the
   * one thing worse than a skipped step.
   */
  const bringIntoView = useCallback((box: Box, viewport: Viewport): boolean => {
    const s = scroller.current;
    if (!s) return false;
    if (isComfortablyInView(box, viewport)) return false;
    s.scrollToY(offsetToCentre(box, viewport, s.offsetY()));
    return true;
  }, []);

  /** Subscribe to "the list moved" — the native stand-in for a scroll listener. */
  const onScrolled = useCallback((fn: () => void) => {
    scrollListener.current = fn;
    return () => {
      if (scrollListener.current === fn) scrollListener.current = null;
    };
  }, []);

  const api = useMemo<TargetRegistry>(
    () => ({ register, registerAction, registerScroller, notifyScroll }),
    [register, registerAction, registerScroller, notifyScroll],
  );

  return { api, measure, runAction, bringIntoView, onScrolled, Provider: Ctx.Provider };
}

/**
 * Attach the returned ref callback to a <View> to make it a tour target.
 * On Android the View needs `collapsable={false}` to stay measurable — prefer
 * the <TourTarget> wrapper, which sets that for you.
 */
export function useTourTarget(name: string) {
  const reg = useContext(Ctx);
  return useCallback((node: View | null) => reg?.register(name, node), [reg, name]);
}

/**
 * Register an entry action for a step's `enter` (tab switch, open a sheet, …).
 * `fn` must be stable (wrap in useCallback) to avoid re-registering each render.
 */
export function useTourAction(name: string, fn: () => void) {
  const reg = useContext(Ctx);
  useEffect(() => {
    reg?.registerAction(name, fn);
    return () => reg?.registerAction(name, null);
  }, [reg, name, fn]);
}

/**
 * Make a screen's list scrollable BY THE TOUR: `<FlatList {...useTourScroll()} …>`
 * (works for `ScrollView` too — the same two props, and we call whichever
 * scroll method the component has).
 *
 * Why a screen has to opt in at all: the web engine can call
 * `el.scrollIntoView()` on anything, because the browser knows every scroll
 * container above it. React Native knows nothing of the sort — a target below
 * the fold measured off-screen, and the engine drew the spotlight there
 * regardless, outside the viewport or clipped to an edge. One prop spread per
 * screen is the smallest honest way to give the engine the offset and the
 * scroll method it needs; nothing else about the screen changes.
 *
 * Registration follows FOCUS, not mount: a tab navigator keeps every visited
 * screen mounted, so the last one mounted would otherwise own the scroller and
 * the tour would scroll a list the member cannot see.
 */
export function useTourScroll() {
  const reg = useContext(Ctx);
  const node = useRef<ScrollLike | null>(null);
  const offsetY = useRef(0);

  // A CALLBACK ref, not an object ref: one object ref cannot be typed for both
  // <FlatList> and <ScrollView>, while a callback taking the two methods we
  // actually call is accepted by either.
  const ref = useCallback((n: ScrollLike | null) => {
    node.current = n;
  }, []);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetY.current = e.nativeEvent.contentOffset.y;
      reg?.notifyScroll();
    },
    [reg],
  );

  useFocusEffect(
    useCallback(() => {
      const mine: Scroller = {
        offsetY: () => offsetY.current,
        scrollToY: (y) => {
          const list = node.current;
          if (!list) return;
          // FlatList speaks `scrollToOffset`, ScrollView `scrollTo`.
          if (typeof list.scrollToOffset === 'function') list.scrollToOffset({ offset: y, animated: true });
          else if (typeof list.scrollTo === 'function') list.scrollTo({ y, animated: true });
        },
      };
      reg?.registerScroller(mine);
      return () => reg?.registerScroller(null);
    }, [reg]),
  );

  // `scrollEventThrottle` is iOS-only and free on Android; without it onScroll
  // fires once per gesture and the spotlight lags the list by a whole swipe.
  return { ref, onScroll, scrollEventThrottle: 16 } as const;
}

/** Convenience wrapper: `<TourTarget name="key" style={…}>…</TourTarget>`. */
export function TourTarget({
  name,
  style,
  children,
}: {
  name: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const ref = useTourTarget(name);
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}
