'use client';

import { useEffect } from 'react';
import Lenis from '@studio-freight/lenis';
import { emitLenisScroll, setLenisActive, setLenisInstance } from './lenis-bus';

/**
 * Mounts a single Lenis smooth-scroll instance for the marketing page.
 * Disabled entirely when `enabled` is false (e.g. reduced-motion users) so
 * native scrolling — and assistive tech expectations — are preserved.
 */
export function useLenis(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const lenis = new Lenis({
      lerp: 0.1,           // frame-rate-independent smoothing — responsive, not floaty
      wheelMultiplier: 1,
      smoothWheel: true,
      syncTouch: false,    // leave native scrolling on touch devices (feels better)
    });

    // Broadcast Lenis's smoothed position so scroll-driven sections update in the
    // SAME frame the page moves (no separate rAF lag → no pinned-section stutter).
    lenis.on('scroll', emitLenisScroll);
    setLenisActive(true);
    setLenisInstance(lenis);

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      setLenisActive(false);
      setLenisInstance(null);
      lenis.destroy();
    };
  }, [enabled]);
}
