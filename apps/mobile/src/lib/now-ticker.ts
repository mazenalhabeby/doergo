/**
 * A clock that moves `now` on an interval and STOPS while the app is in the
 * background — the rules behind `useNow`, without React.
 *
 * ⚠️ Nine screens each ran their own interval that moved `now` and
 * kept firing behind another app (Android keeps JS timers alive under a
 * foreground service — which is exactly when a shift is running), re-rendering
 * cards nobody could see. Nothing here counts: every figure is derived from
 * `now`, so pausing loses nothing, and the tick on return makes the screen
 * right the instant it is seen.
 */
export interface NowTicker {
  /** Run (or pause) the clock. `immediate` ticks at once when it starts. */
  setRunning(running: boolean, immediate?: boolean): void;
  stop(): void;
}

export function createNowTicker(opts: {
  intervalMs: number;
  onTick: (now: number) => void;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
}): NowTicker {
  const now = opts.now ?? (() => Date.now());
  const set = opts.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const clear = opts.clearInterval ?? ((id: unknown) => clearInterval(id as ReturnType<typeof setInterval>));
  let id: unknown = null;

  const ticker: NowTicker = {
    setRunning(running, immediate = true) {
      if (running === (id !== null)) return;
      if (!running) {
        clear(id);
        id = null;
        return;
      }
      if (immediate) opts.onTick(now());
      id = set(() => opts.onTick(now()), opts.intervalMs);
    },
    stop() { ticker.setRunning(false); },
  };
  return ticker;
}
