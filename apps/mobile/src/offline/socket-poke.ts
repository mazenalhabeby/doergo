/**
 * A live event as a signal to re-sync — never as data.
 *
 * Every task event used to make whichever screen was open fetch again, and a
 * screen that was not open missed it — so the phone's copy stayed stale until
 * the list was visited. Offline-first, an event only says "tasks changed": one
 * listener for the whole app pulls, and every screen reading the copy re-reads
 * itself when the pull lands. Events missed while disconnected are covered by
 * the cursor on the next pull anyway.
 *
 * A burst (an admin reassigning ten jobs) is one pull, not ten.
 */
export const POKE_DEBOUNCE_MS = 2000;

export function createPoke(
  pull: () => Promise<unknown>,
  timers: { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  },
  delayMs = POKE_DEBOUNCE_MS,
) {
  let handle: unknown = null;
  return {
    poke(): void {
      if (handle !== null) timers.clear(handle);
      handle = timers.set(() => {
        handle = null;
        void pull().catch(() => undefined);
      }, delayMs);
    },
    cancel(): void {
      if (handle !== null) timers.clear(handle);
      handle = null;
    },
  };
}
