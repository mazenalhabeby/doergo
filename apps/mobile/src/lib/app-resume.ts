import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { createResumeCoordinator, type AppStateName, type ResumeCoordinator } from './app-resume-core';

/**
 * The app's ONE AppState listener for "came back" work — see app-resume-core.ts.
 *
 * Created on first use, never torn down: it lives as long as the JS runtime.
 */
let coordinator: ResumeCoordinator | null = null;

function get(): ResumeCoordinator {
  if (!coordinator) {
    const c = createResumeCoordinator({ initialState: AppState.currentState });
    AppState.addEventListener('change', (s) => c.handle(s));
    coordinator = c;
  }
  return coordinator;
}

/** Network work on a return to the foreground — at most once per 30 s. */
export function onAppResume(cb: () => void): () => void {
  return get().onResume(cb);
}

/** Every AppState change, unthrottled — sockets, locks, clocks. */
export function onAppStateChange(cb: (state: AppStateName) => void): () => void {
  return get().onChange(cb);
}

/** Asked of React Native itself — the source of truth — with the coordinator as the fallback. */
export function isAppActive(): boolean {
  const now = AppState.currentState as string | null | undefined;
  return now ? now === 'active' : get().isActive();
}

/** Tests only: forget the coordinator, so the next use starts from the current AppState. */
export function __resetAppResume(): void {
  coordinator = null;
}

/**
 * `onAppResume` for a component. The latest callback is called, so it need
 * not be stable; `enabled: false` unsubscribes.
 */
export function useAppResume(cb: () => void, enabled = true): void {
  const latest = useRef(cb);
  latest.current = cb;
  useEffect(() => {
    if (!enabled) return;
    return onAppResume(() => latest.current());
  }, [enabled]);
}
