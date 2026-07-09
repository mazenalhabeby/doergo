'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Drives whether the 3D render loop should run. Returns a ref to attach to the
 * canvas wrapper and an `active` flag that is true only when the element is
 * on screen AND the tab is visible. Starts `true` so the hero renders on first
 * paint without a blank frame; the observers then pause it when it scrolls out
 * of view or the tab is backgrounded — no wasted GPU/battery.
 */
export function useCanvasActive() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let onScreen = true;
    let tabVisible = document.visibilityState === 'visible';
    const sync = () => setActive(onScreen && tabVisible);

    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      { rootMargin: '120px' },
    );
    io.observe(el);

    const onVisibility = () => {
      tabVisible = document.visibilityState === 'visible';
      sync();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { ref, active };
}
