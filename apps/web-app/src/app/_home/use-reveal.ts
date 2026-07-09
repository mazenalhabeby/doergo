'use client';

import { useEffect, useRef } from 'react';

/**
 * Adds the `is-visible` class to an element when it scrolls into view.
 *
 * Progressive enhancement, never a visibility gate: an IntersectionObserver
 * (reliable, not rAF-throttled) reveals the element, and a fallback timer forces
 * it after `fallbackMs` so a backgrounded/throttled tab can't strand content.
 * The resting/hidden state lives in CSS with a reduced-motion + <noscript>
 * override, so content is always eventually visible.
 */
export function useReveal<T extends HTMLElement>(fallbackMs = 1400) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || el.classList.contains('is-visible')) return;
    let shown = false;
    const show = () => {
      if (shown) return;
      shown = true;
      el.classList.add('is-visible');
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          show();
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    const fallback = setTimeout(show, fallbackMs);
    return () => {
      io.disconnect();
      clearTimeout(fallback);
    };
  }, [fallbackMs]);

  return ref;
}
