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
import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { TargetRect } from './types';

interface TargetRegistry {
  register: (name: string, node: View | null) => void;
  registerAction: (name: string, fn: (() => void) | null) => void;
}

const Ctx = createContext<TargetRegistry | null>(null);

/**
 * Owns the name→node and name→action maps + the measure/runAction helpers.
 * Used by <TourProvider>; returns the context Provider to wrap the app with.
 */
export function useTargetRegistry() {
  const nodes = useRef(new Map<string, View>());
  const actions = useRef(new Map<string, () => void>());

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

  const api = useMemo<TargetRegistry>(() => ({ register, registerAction }), [register, registerAction]);

  return { api, measure, runAction, Provider: Ctx.Provider };
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
