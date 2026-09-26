/**
 * Just enough React to drive a HOOK as a function, across renders.
 *
 * These specs run without a renderer (see jest.config.js), and the older ones
 * mock React per file with hooks that forget everything between calls — fine
 * for one render's worth of a hook, useless for the questions the home's
 * offline and request specs ask: "does a second render re-fire this effect?",
 * "is this the same array as last time?". This keeps slots by call order, the
 * way React does, and runs effects only when their dependencies change.
 *
 * Used as `jest.mock('react', () => require('./hook-harness').react)`.
 */
type Deps = readonly unknown[] | undefined;
interface Slot { deps?: Deps; value?: unknown; current?: unknown; cleanup?: (() => void) | void }

let slots: Slot[] = [];
let cursor = 0;
let queue: (() => void)[] = [];
let dirty = false;

/** Whether the screen the hook lives on is focused — `useFocusEffect` reads it. */
export const focus = { focused: true, epoch: 0 };

const same = (a: Deps, b: Deps) =>
  !!a && !!b && a.length === b.length && a.every((x, j) => Object.is(x, b[j]));

export const react = {
  useRef<T>(v: T): { current: T } {
    const k = cursor++;
    if (!slots[k]) slots[k] = { current: v };
    return slots[k] as { current: T };
  },
  useMemo<T>(fn: () => T, deps: Deps): T {
    const k = cursor++;
    const s = slots[k];
    if (s && same(s.deps, deps)) return s.value as T;
    const value = fn();
    slots[k] = { deps, value };
    return value;
  },
  useCallback<T>(fn: T, deps: Deps): T {
    return react.useMemo(() => fn, deps);
  },
  useState<T>(init: T | (() => T)): [T, (v: T | ((p: T) => T)) => void] {
    const k = cursor++;
    if (!slots[k]) {
      const s: Slot = { value: typeof init === 'function' ? (init as () => T)() : init };
      s.current = (v: T | ((p: T) => T)) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(s.value as T) : v;
        if (!Object.is(next, s.value)) { s.value = next; dirty = true; }
      };
      slots[k] = s;
    }
    return [slots[k]!.value as T, slots[k]!.current as (v: T | ((p: T) => T)) => void];
  },
  useEffect(fn: () => (() => void) | void, deps?: Deps): void {
    const k = cursor++;
    const s = slots[k];
    if (s && same(s.deps, deps)) return;
    queue.push(() => {
      if (s?.cleanup) s.cleanup();
      slots[k] = { deps, cleanup: fn() };
    });
  },
};

/** expo-router's, reduced: runs while focused, cleans up on blur, re-runs on a new callback. */
export function useFocusEffect(cb: () => (() => void) | void): void {
  react.useEffect(() => (focus.focused ? cb() : undefined), [cb, focus.focused, focus.epoch]);
}

export interface Mounted<T> {
  readonly current: T;
  /** Render again — what React does after state moves or a parent renders. */
  render(): T;
  unmount(): void;
  renders: number;
}

export function mountHook<T>(hook: () => T): Mounted<T> {
  slots = [];
  queue = [];
  let current: T;
  const m: Mounted<T> = {
    renders: 0,
    get current() { return current; },
    render() {
      for (let pass = 0; pass < 20; pass++) {
        dirty = false;
        cursor = 0;
        current = hook();
        m.renders++;
        const run = queue;
        queue = [];
        run.forEach((f) => f());
        if (!dirty) break;
      }
      return current;
    },
    unmount() {
      for (const s of slots) if (s?.cleanup) s.cleanup();
      slots = [];
    },
  };
  m.render();
  return m;
}

/** Let promises settle, then render whatever they set. */
export async function settle<T>(m: Mounted<T>, rounds = 5, waitMs = 0): Promise<T> {
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  for (let r = 0; r < rounds; r++) await new Promise((resolve) => setImmediate(resolve));
  return m.render();
}
