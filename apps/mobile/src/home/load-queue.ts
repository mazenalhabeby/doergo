/**
 * ⭐ THE HOME ASKS THE SERVER IN THE MEMBER'S ORDER — `docs/design/home-loading`.
 *
 * Every card used to ask the moment it mounted, all at once: six requests
 * racing on a weak signal, and the card at the bottom as likely to win as the
 * one at the top. The member reads the home top-down, so it now loads that way:
 *
 *   1. what is on screen first, in the member's order;
 *   2. TWO at a time on a good signal, ONE on a slow one — a weak connection
 *      shared six ways answers nobody quickly;
 *   3. cards below the fold wait until the member scrolls near them, or (on a
 *      good signal) until everything above is done;
 *   4. a card asked again while it is already asking is asked ONCE more when
 *      it finishes — never twice in parallel, never dropped.
 *
 * Pure: no React, no network. The home owns one; every card's refreshes go
 * through it (`useLiveRefresh` finds it by context). A card with no place in
 * the order — a screen outside the home — runs at once, as before.
 *
 * ⚠️ A request that never settles must not hold a slot forever: after
 * STUCK_MS it is released (the card's own answer still lands when it does).
 */
export type LoadState = 'idle' | 'waiting' | 'loading';

export const STUCK_MS = 15_000;

interface Entry {
  /**
   * ⚠️ EVERY ASKER IN THE CARD, NOT THE LAST ONE. A card can hold several
   * refreshes (Today's route: its jobs AND the driver's position). One `run`
   * per card meant the second request REPLACED the first — the jobs loader
   * never ran and the card said "nothing to drive" forever. Keyed by asker.
   */
  runs: Map<unknown, () => unknown>;
  state: LoadState;
  again: boolean;
  startedAt: number;
}

export interface LoadQueue {
  /** The member's widget order — the priority. */
  setOrder(keys: readonly string[]): void;
  /** The cards on screen or about to be (scrolled near). */
  setVisible(keys: readonly string[]): void;
  /** A slow signal: one at a time, and below the fold only when scrolled to. */
  setSlow(slow: boolean): void;
  /** Ask for this card. Coalesced per card AND per asker (`from`, stable per hook). */
  request(key: string, run: () => unknown, from?: unknown): void;
  state(key: string): LoadState;
  /** When `key` started its current request, or null. */
  startedAt(key: string): number | null;
  subscribe(cb: () => void): () => void;
  /** Forget everything (sign-out, unmount). */
  clear(): void;
}

export function createLoadQueue(
  opts: { now?: () => number; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout } = {},
): LoadQueue {
  const now = opts.now ?? Date.now;
  const setTimer = opts.setTimer ?? setTimeout;
  const clearTimer = opts.clearTimer ?? clearTimeout;
  let order: string[] = [];
  let visible = new Set<string>();
  /** Until the list reports what is on screen, the first two cards are. */
  let visibleKnown = false;
  let slow = false;
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  const stuck = new Map<string, ReturnType<typeof setTimeout>>();

  const emit = () => listeners.forEach((l) => l());
  const rank = (k: string) => { const i = order.indexOf(k); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  const isVisible = (k: string) => (visibleKnown ? visible.has(k) : rank(k) < 2);
  const busy = () => [...entries.values()].filter((e) => e.state === 'loading').length;
  const aboveDone = () => [...entries.entries()].every(([k, e]) => !isVisible(k) || e.state === 'idle');

  function eligible(k: string): boolean {
    if (!order.includes(k)) return true; // not a home card — never held back
    if (isVisible(k)) return true;
    return !slow && aboveDone();
  }

  function finish(k: string) {
    const e = entries.get(k);
    const t = stuck.get(k);
    if (t) { clearTimer(t); stuck.delete(k); }
    if (!e || e.state !== 'loading') return;
    if (e.again) { e.again = false; e.state = 'waiting'; } else e.state = 'idle';
    pump();
    emit();
  }

  function start(k: string, e: Entry) {
    e.state = 'loading';
    e.startedAt = now();
    stuck.set(k, setTimer(() => finish(k), STUCK_MS));
    // Everything asked for this card so far, together; asks that arrive while it runs make the next round.
    const runs = [...e.runs.values()];
    e.runs = new Map();
    const results = runs.map((run) => {
      try {
        return Promise.resolve(run()).catch(() => undefined);
      } catch {
        return Promise.resolve();
      }
    });
    Promise.all(results).then(() => finish(k));
  }

  /*
    ⚠️ GATHERED, THEN SORTED. Every card asks in its own mount effect, and
    those fire in whatever order React commits them — so starting each request
    the instant it arrived let a card lower down win the slot. Requests made
    in the same tick are collected and started in the member's order.
  */
  let scheduled = false;
  function schedulePump() {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(() => { scheduled = false; pump(); emit(); });
  }

  function pump() {
    const limit = slow ? 1 : 2;
    const waiting = [...entries.entries()]
      .filter(([, e]) => e.state === 'waiting')
      .sort(([a], [b]) => rank(a) - rank(b));
    for (const [k, e] of waiting) {
      // Cards outside the order are not rationed — they are not the home's.
      if (order.includes(k) && busy() >= limit) break;
      if (!eligible(k)) continue;
      start(k, e);
    }
  }

  return {
    setOrder(keys) { order = [...keys]; pump(); emit(); },
    setVisible(keys) { visible = new Set(keys); visibleKnown = true; pump(); emit(); },
    setSlow(v) { if (slow !== v) { slow = v; pump(); emit(); } },
    request(key, run, from = run) {
      const e = entries.get(key);
      if (e) {
        e.runs.set(from, run); // this asker's latest refresh; other askers keep theirs
        if (e.state === 'loading') e.again = true;
        else if (e.state === 'idle') e.state = 'waiting';
      } else {
        entries.set(key, { runs: new Map([[from, run]]), state: 'waiting', again: false, startedAt: 0 });
      }
      schedulePump();
      emit();
    },
    state: (k) => entries.get(k)?.state ?? 'idle',
    startedAt: (k) => { const e = entries.get(k); return e?.state === 'loading' ? e.startedAt : null; },
    subscribe(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    clear() { stuck.forEach((t) => clearTimer(t)); stuck.clear(); entries.clear(); emit(); },
  };
}
