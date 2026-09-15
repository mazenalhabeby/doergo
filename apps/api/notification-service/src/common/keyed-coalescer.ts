/**
 * Folds a burst of the same notification into one, per key.
 *
 * The case it exists for: a phone that was offline all afternoon comes back in
 * range and replays its queue — ten fuel receipts, ten filings, ten events a
 * few hundred milliseconds apart. Delivered as they arrive, the approver's
 * phone buzzes ten times for what is, to them, one thing: "Ahmed sent in his
 * expenses". The third buzz teaches them to mute the app, which costs every
 * notification after it.
 *
 * LEADING, then one SUMMARY. The first event for a key is delivered at once —
 * a single expense must never wait for a window to close, and if this process
 * restarts mid-window the thing that is lost is the summary, never the first
 * notice. Everything else arriving inside the window is held, and when the
 * window closes it is delivered as ONE summary. If more arrived during that
 * window the key stays open for another, so a replay that runs for three
 * minutes is at most one notice a minute, not one per receipt.
 *
 * ⚠️ IN MEMORY, AND THAT IS DELIBERATE — READ BEFORE ADDING A REPLICA.
 * Events reach this service over Redis pub/sub, which delivers every event to
 * EVERY subscribed instance: with two notification-service replicas, every
 * push in the product is already sent twice, coalesced or not. Coalescing is
 * therefore exactly as replica-safe as the rest of delivery, no less. The day
 * this service is scaled out, delivery as a whole needs a claim (a Redis
 * `SET NX` per event, or a queue instead of pub/sub) — and at that point this
 * window moves into Redis with it, as `SET key NX PX window` for the leading
 * edge and an `INCR` for the held count. Doing that for this one class of
 * notification alone would buy nothing.
 */
export class KeyedCoalescer<T> {
  private readonly open = new Map<string, { held: T[]; timer: ReturnType<typeof setTimeout> }>();

  constructor(
    private readonly windowMs: number,
    /** Everything held for `key` while its window was open. Never called with an empty list. */
    private readonly onSummary: (key: string, held: T[]) => void | Promise<void>,
  ) {}

  /**
   * Offer one event.
   *
   * Returns true when the caller should deliver it NOW (the first in its
   * window), false when it has been held for the window's summary.
   */
  offer(key: string, item: T): boolean {
    const slot = this.open.get(key);
    if (slot) {
      slot.held.push(item);
      return false;
    }
    this.open.set(key, { held: [], timer: this.arm(key) });
    return true;
  }

  /** Stop every window without delivering — for shutdown and tests. */
  dispose(): void {
    for (const slot of this.open.values()) clearTimeout(slot.timer);
    this.open.clear();
  }

  private arm(key: string): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => this.close(key), this.windowMs);
    // A pending summary must never be what keeps a stopping process alive.
    timer.unref?.();
    return timer;
  }

  private close(key: string): void {
    const slot = this.open.get(key);
    if (!slot) return;
    if (slot.held.length === 0) {
      this.open.delete(key);
      return;
    }
    const held = slot.held;
    // Still busy: keep the key open for one more window, so the next event is
    // held too rather than delivered as a fresh leading notice.
    this.open.set(key, { held: [], timer: this.arm(key) });
    try {
      const done = this.onSummary(key, held);
      if (done && typeof (done as Promise<void>).catch === 'function') {
        (done as Promise<void>).catch(() => undefined);
      }
    } catch {
      // A summary that failed to send must not stop the window machinery.
    }
  }
}
