'use client';

/**
 * SSR-safe boundary for the interactive 3D faceted gemstone / crystal mark.
 *
 * - HeroLogo (three.js / R3F) loads via next/dynamic({ ssr:false }) so the
 *   server never evaluates WebGL.
 * - HeroFallback is a static CSS wordmark — first-paint loading state AND the
 *   render for reduced-motion users (no three.js downloaded).
 * - The render loop pauses when off-screen / tab-hidden (useCanvasActive).
 */

import dynamic from 'next/dynamic';
import { useCanvasActive } from './use-canvas-active';
import { HeroLines2D } from './HeroLines2D';

const HeroLogo = dynamic(() => import('./HeroLogo'), {
  ssr: false,
  loading: () => <HeroFallback />,
});

export function HeroFallback() {
  // static, faint arrow mark for first paint / reduced motion (no WebGL)
  return (
    <div aria-hidden className="absolute inset-0 flex items-center justify-center opacity-[0.12]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/favicon.svg" alt="" className="h-[34vh] w-auto grayscale" />
    </div>
  );
}

export function HeroCanvas({ interactive }: { interactive: boolean }) {
  const { ref, active } = useCanvasActive();

  return (
    <div ref={ref} className="absolute inset-0">
      {/* sparse faint field-lines (2D canvas) behind — coexists with the gem */}
      <HeroLines2D active={active} />
      {interactive ? <HeroLogo active={active} /> : <HeroFallback />}
    </div>
  );
}
