'use client';

import { useEffect, useRef, useState } from 'react';
import { onLenisScroll, isLenisActive } from './lenis-bus';

/**
 * Shared scroll-driven showcase controller for the laptop + phone showcases.
 *
 * Encapsulates the scroll-progress plumbing both showcases share BYTE-IDENTICALLY:
 *   - subscribe to Lenis's tick (`onLenisScroll`) so updates ride the smoothed
 *     scroll in the same frame, plus a native-scroll fallback when Lenis is idle
 *     (`isLenisActive` / `queued` / `raf`);
 *   - compute progress `p = -rect.top / (rect.height - innerHeight)` clamped 0..1;
 *   - split the post-`contentStart` scroll into `count` equal dwells and pick the
 *     active index (same `Math.floor((p - contentStart) / dwell)` math, same
 *     `prev === idx ? prev` guard);
 *   - each update calls `onFrame(p)` so the caller applies its OWN transform
 *     (laptop: lid + glow; phone: lift/tilt + wake).
 *
 * Returns the current active shot index. `onFrame` is read from a ref so callers
 * can pass an inline closure without re-running the effect.
 */
export function useScrollShowcase({
  sectionRef,
  reduced,
  contentStart,
  count,
  onFrame,
}: {
  sectionRef: React.RefObject<HTMLDivElement | null>;
  reduced: boolean;
  contentStart: number;
  count: number;
  onFrame: (p: number) => void;
}) {
  const [active, setActive] = useState(0);

  // keep the latest onFrame without retriggering the effect
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let queued = false;

    const update = () => {
      queued = false;
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;

      // caller applies its own transform for this frame's progress
      onFrameRef.current(p);

      // each scroll-step advances the shot — equal share of the scroll each.
      const dwell = (1 - contentStart) / count;
      const idx = p < contentStart ? 0 : Math.min(count - 1, Math.floor((p - contentStart) / dwell));
      setActive((prev) => (prev === idx ? prev : idx));
    };

    // Update in the SAME frame Lenis applies its smoothed scroll → smooth, in sync.
    const unsubscribe = onLenisScroll(update);
    const onScroll = () => {
      if (isLenisActive() || queued) return;
      queued = true;
      raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, contentStart, count]);

  return active;
}
