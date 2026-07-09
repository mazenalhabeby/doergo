'use client';

import { useEffect, useState } from 'react';
import { AnimatedLogo } from '@hbcfield/shared/components';
import { FONT_MONO } from './fonts';

/**
 * Studio-grade intro, modelled on the reference:
 *   grey field → centred logo lockup framed by "+" registration marks →
 *   page label + dot tagline → a 3-digit slot-reel counter (000→100) →
 *   the screen wipes away as horizontal "belts" to reveal the dark page.
 *
 * Robustness (hard-won): dismissal is driven by wall-clock setTimeout, never by
 * the rAF counter — rAF is throttled/paused in backgrounded tabs and would hang
 * the overlay. The reveal is a CSS transition (also reliable off-rAF). Shown
 * once per browser session.
 */

const GREY = '#c9c9c6';

function Reel({ digit }: { digit: number }) {
  return (
    <span className="relative inline-block h-[1em] w-[0.62em] overflow-hidden align-baseline">
      <span
        className="absolute left-0 top-0 flex flex-col transition-transform duration-200 ease-[cubic-bezier(0.33,1,0.68,1)]"
        style={{ transform: `translateY(${-digit * 10}%)` }}
      >
        {Array.from({ length: 10 }, (_, n) => (
          <span key={n} className="flex h-[1em] items-center justify-center leading-none">
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}

export function LoadingScreen({
  onDone,
  reduced,
}: {
  onDone: () => void;
  reduced: boolean;
}) {
  const [pct, setPct] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // read the REAL motion preference here — the `reduced` prop can still be its
    // pessimistic initial `true` at mount, which would flash the loader by.
    const rm =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const COUNT = rm ? 300 : 2200;  // count 0 → 100
    const HOLD = rm ? 120 : 550;    // sit on 100 so it's seen
    const WIPE = rm ? 250 : 950;    // then the centre-split reveal

    // count-up (even progression so it visibly rolls through the numbers)
    const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / COUNT);
      setPct(Math.round(easeInOutCubic(p) * 100));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // guaranteed lifecycle (wall-clock) — reach 100, hold, THEN wipe away
    const toFull = setTimeout(() => setPct(100), COUNT);
    const toLeave = setTimeout(() => setLeaving(true), COUNT + HOLD);
    const toDone = setTimeout(onDone, COUNT + HOLD + WIPE);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(toFull);
      clearTimeout(toLeave);
      clearTimeout(toDone);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const h = Math.floor(pct / 100);
  const t = Math.floor(pct / 10) % 10;
  const u = pct % 10;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]">
      {/* the grey screen splits at the centre — top half lifts up, bottom half
          drops down — revealing the page cleanly from the middle (no seams). */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 h-[50.5%] transition-transform duration-[900ms] ease-[cubic-bezier(0.76,0,0.24,1)]"
          style={{ backgroundColor: GREY, transform: leaving ? 'translateY(-101%)' : 'translateY(0)' }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-[50.5%] transition-transform duration-[900ms] ease-[cubic-bezier(0.76,0,0.24,1)]"
          style={{ backgroundColor: GREY, transform: leaving ? 'translateY(101%)' : 'translateY(0)' }}
        />
      </div>

      {/* centre lockup */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-[#141414] transition-opacity duration-300"
        style={{ opacity: leaving ? 0 : 1, fontFamily: FONT_MONO }}
      >
        {/* page label */}
        <div className="mb-8 text-[10px] uppercase tracking-[0.35em] text-[#141414]/50">
          Index / 00
        </div>

        {/* logo in a corner-plus frame */}
        <div className="relative px-12 py-8">
          <Plus className="-left-1 -top-1" />
          <Plus className="-right-1 -top-1" />
          <Plus className="-bottom-1 -left-1" />
          <Plus className="-bottom-1 -right-1" />
          <AnimatedLogo size="large" variant="dark" />
        </div>

        {/* dot tagline */}
        <div className="mt-8 flex items-center gap-3 text-[10px] uppercase tracking-[0.3em] text-[#141414]/60">
          <span>Dispatch</span>
          <span className="h-1 w-1 rounded-full bg-[#141414]/50" />
          <span>Track</span>
          <span className="h-1 w-1 rounded-full bg-[#141414]/50" />
          <span>Deliver</span>
        </div>

        {/* slot-reel counter — the count to 100 is the focus */}
        <div className="mt-12 flex items-baseline font-semibold tabular-nums text-[#141414]" style={{ fontSize: '30px' }}>
          <Reel digit={h} />
          <Reel digit={t} />
          <Reel digit={u} />
        </div>
      </div>
    </div>
  );
}

function Plus({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute select-none text-[13px] leading-none text-[#141414]/70 ${className}`}
    >
      +
    </span>
  );
}
