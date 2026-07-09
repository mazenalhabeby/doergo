'use client';

/**
 * Tiny subscription bus so scroll-driven components (laptop / phone showcases)
 * can update in the SAME frame Lenis applies its smoothed scroll position —
 * instead of listening to the native `scroll` event on a separate rAF, which
 * runs a frame out of step with Lenis and makes pinned animations stutter.
 *
 * `useLenis` calls `emitLenisScroll()` from Lenis's own scroll callback; a
 * component subscribes with `onLenisScroll(update)` and reads its rect there.
 * If Lenis isn't mounted (reduced-motion / load failure) nothing emits, so
 * subscribers keep a native-scroll fallback of their own.
 */

type Callback = () => void;

const subscribers = new Set<Callback>();

/** Subscribe to Lenis scroll ticks. Returns an unsubscribe function. */
export function onLenisScroll(cb: Callback): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** Fired by useLenis on every Lenis scroll update. */
export function emitLenisScroll(): void {
  subscribers.forEach((cb) => cb());
}

/** Whether a Lenis instance is currently driving scroll (has subscribers wired). */
let lenisActive = false;
export function setLenisActive(active: boolean): void {
  lenisActive = active;
}
export function isLenisActive(): boolean {
  return lenisActive;
}

/* ── programmatic smooth scroll (nav anchor links) ── */

type LenisLike = {
  scrollTo: (target: HTMLElement | string | number, opts?: Record<string, unknown>) => void;
  stop?: () => void;
  start?: () => void;
  scroll?: number;
};
let lenisInstance: LenisLike | null = null;

/** useLenis registers its instance here so anchor clicks can drive the scroll. */
export function setLenisInstance(l: LenisLike | null): void {
  lenisInstance = l;
}

/**
 * Smooth-scroll to an on-page anchor (e.g. "#work"). `offset` clears the fixed
 * navbar so the section top isn't hidden under it.
 *
 * Lenis's own programmatic scroll is unreliable in this version (it reverts the
 * position on its next tick), so we hand off to the browser's native smooth
 * scroll: pause Lenis, `scrollTo({behavior:'smooth'})`, then resume Lenis once
 * the scroll settles (it re-syncs to the final position with no snap). Falls
 * back to a plain native smooth scroll when Lenis isn't driving.
 */
export function scrollToHash(hash: string, offset = -76): void {
  if (typeof document === 'undefined') return;
  const el = document.querySelector<HTMLElement>(hash);
  if (!el) return;
  const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY + offset);

  const lenis = lenisInstance;
  if (lenis?.stop && lenis.start) {
    lenis.stop(); // release the wheel to the browser so native scroll isn't reverted
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener('scroll', onScroll);
      lenis.start?.(); // resume smoothing, re-synced to the final position
    };
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(finish, 140); // debounce: fire once scrolling stops
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.scrollTo({ top, behavior: 'smooth' });
    setTimeout(finish, 1600); // safety: never leave Lenis stopped
  } else {
    window.scrollTo({ top, behavior: 'smooth' });
  }

  // reflect the section in the URL (shareable) without triggering a jump
  if (window.history?.replaceState) window.history.replaceState(null, '', hash);
}
