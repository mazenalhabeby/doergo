/**
 * ONE ANSWER TO "THE APP CAME BACK" — the rules, without React Native.
 *
 * ⚠️ Fifteen screens and providers each had their own AppState listener, and
 * most of them fetched something on `active`: the version, the profile, the
 * document requirements, the push token, the outbox, the live screens. A
 * glance at a message and back cost about six requests and a GPS fix, every
 * time — and iOS reports `inactive → active` for a permission dialog or the
 * control centre too.
 *
 * Network work subscribes to `onResume`, which fires at most once per
 * `minIntervalMs` (counted from the last time it fired; the launch counts as
 * one). Work that must follow the state exactly — a socket, a lock screen, a
 * permission re-read after Settings, a ticking clock — subscribes to
 * `onChange`, which is never throttled.
 *
 * `app-resume.ts` binds this to React Native's AppState; this file is plain
 * TypeScript so the rules are unit-tested.
 */
export type AppStateName = 'active' | 'background' | 'inactive' | 'unknown' | 'extension' | string;

export interface ResumeCoordinator {
  /** Feed every AppState change here. */
  handle(next: AppStateName): void;
  /** A return to the foreground, throttled. Returns the unsubscribe. */
  onResume(cb: () => void): () => void;
  /** Every state change, unthrottled. Returns the unsubscribe. */
  onChange(cb: (state: AppStateName) => void): () => void;
  state(): AppStateName;
  isActive(): boolean;
}

export const RESUME_MIN_INTERVAL_MS = 30_000;

export function createResumeCoordinator(opts: {
  initialState?: AppStateName | null;
  minIntervalMs?: number;
  now?: () => number;
} = {}): ResumeCoordinator {
  const now = opts.now ?? (() => Date.now());
  const minInterval = opts.minIntervalMs ?? RESUME_MIN_INTERVAL_MS;
  let current: AppStateName = opts.initialState ?? 'active';
  // The launch is a resume: everything mounted just loaded.
  let lastResume = now();
  const resumeSubs = new Set<() => void>();
  const changeSubs = new Set<(s: AppStateName) => void>();

  const run = <A extends unknown[]>(fn: (...a: A) => void, ...a: A) => {
    try { fn(...a); } catch (e) { console.warn('[resume] subscriber failed:', e); }
  };

  return {
    handle(next) {
      const prev = current;
      if (next === prev) return;
      current = next;
      [...changeSubs].forEach((cb) => run(cb, next));
      if (next !== 'active' || prev === 'active') return;
      const at = now();
      if (at - lastResume < minInterval) return;
      lastResume = at;
      [...resumeSubs].forEach((cb) => run(cb));
    },
    onResume(cb) {
      resumeSubs.add(cb);
      return () => { resumeSubs.delete(cb); };
    },
    onChange(cb) {
      changeSubs.add(cb);
      return () => { changeSubs.delete(cb); };
    },
    state: () => current,
    isActive: () => current === 'active',
  };
}
