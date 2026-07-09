'use client';

/**
 * Scroll-driven 3D laptop showcase. The section is tall and PINS the laptop in
 * view; as you scroll, (a) the lid opens, then (b) the product screenshots cycle
 * one per scroll-step while their descriptions cross-fade beside it. Because it's
 * pinned, the page holds on each screen until you scroll to the next — the shots
 * are driven entirely by scroll position, and the section releases right after
 * the last one. Pure CSS 3D; the scroll updates ride Lenis's own tick so they're
 * smooth. Reduced-motion → a static open laptop with a plain list.
 */

import { useRef } from 'react';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import { usePrefersReducedMotion } from './use-reduced-motion';
import { useScrollShowcase } from './use-scroll-showcase';
import { asArray } from './i18n-array';
import { FONT_MONO as MONO, FONT_DISPLAY as DISPLAY } from './fonts';
import { ProgressDots, CrossfadeCopy } from './showcase-parts';

// Image paths stay hardcoded and pair with the translated text by index.
const SHOT_IMAGES = [
  '/shots/board.png',
  '/shots/map.png',
  '/shots/dashboard.png',
  '/shots/timeline.png',
];

type ShotText = { kicker: string; title: string; body: string };

// Where the shots start cycling (after the lid is open). The remaining scroll is
// split evenly across the shots, so each gets the same amount of scroll and the
// last one's turn ends exactly as the section releases.
const LID_OPEN_END = 0.14;
const CONTENT_START = 0.16;

export function LaptopShowcase() {
  const { t } = useTranslation();
  const reduced = usePrefersReducedMotion();
  const sectionRef = useRef<HTMLDivElement>(null);
  const lidRef = useRef<HTMLDivElement>(null);
  const screenGlowRef = useRef<HTMLDivElement>(null);

  const shotTexts = asArray<ShotText>(t('home.product.shots', { returnObjects: true }));
  const SHOTS = SHOT_IMAGES.map((img, i) => ({ img, ...shotTexts[i] }));

  const active = useScrollShowcase({
    sectionRef,
    reduced,
    contentStart: CONTENT_START,
    count: SHOT_IMAGES.length,
    onFrame: (p) => {
      // lid opens as you start scrolling into the section
      const open = Math.min(1, p / LID_OPEN_END);
      const angle = -92 + open * 92; // −92° closed → 0° open
      if (lidRef.current) lidRef.current.style.transform = `rotateX(${angle}deg)`;
      if (screenGlowRef.current) screenGlowRef.current.style.opacity = String(open * open);
    },
  });

  /* ── reduced motion / no-JS friendly: static open laptop + list ── */
  if (reduced) {
    return (
      <section className="border-t border-white/[0.08] px-6 py-24 sm:px-10 sm:py-32">
        <div className="mx-auto max-w-[1600px]">
          <span style={{ fontFamily: MONO }} className="mb-6 block text-[11px] uppercase tracking-[0.28em] text-white/40">{t('home.product.label')}</span>
          <h2 style={{ fontFamily: DISPLAY }} className="mb-12 text-[clamp(1.8rem,4.4vw,3.4rem)] font-normal tracking-tight text-[#e8e8e5]">{t('home.product.reducedHeading')}</h2>
          <div className="grid gap-10 lg:grid-cols-2">
            <Laptop activeSrc={SHOTS[0].img} lidStatic />
            <ul className="space-y-8">
              {SHOTS.map((s) => (
                <li key={s.img}>
                  <span style={{ fontFamily: MONO }} className="text-[11px] uppercase tracking-[0.28em] text-white/40">{s.kicker}</span>
                  <h3 style={{ fontFamily: DISPLAY }} className="mt-2 text-[1.4rem] font-normal text-[#eaeae7]">{s.title}</h3>
                  <p className="mt-2 max-w-[44ch] text-[14px] leading-relaxed text-white/50">{s.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={sectionRef} id="work" className="relative border-t border-white/[0.08]" style={{ height: '280vh' }}>
      <div className="sticky top-0 flex h-screen items-center overflow-hidden px-6 sm:px-10">
        <div className="mx-auto grid w-full max-w-[1600px] items-center gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          {/* laptop */}
          <div className="[perspective:2200px]">
            <div className="[transform-style:preserve-3d] [transform:rotateX(7deg)]">
              <Laptop lidRef={lidRef} screenGlowRef={screenGlowRef} shots={SHOTS} active={active} />
            </div>
          </div>

          {/* descriptions (cross-fade with the active shot) */}
          <div>
            <span style={{ fontFamily: MONO }} className="mb-8 block text-[11px] uppercase tracking-[0.28em] text-white/40">{t('home.product.label')}</span>
            {/* FIXED-height crossfade area — every slide's text is top-aligned in the
                same box, so the kicker and the dots below never shift. */}
            <CrossfadeCopy items={SHOTS} active={active} titleMaxCls="max-w-[20ch]" />

            {/* progress dots — reflect the scroll position */}
            <ProgressDots count={SHOTS.length} active={active} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── the CSS-3D laptop ── */
function Laptop({
  lidRef,
  screenGlowRef,
  shots,
  active = 0,
  activeSrc,
  lidStatic = false,
}: {
  lidRef?: React.RefObject<HTMLDivElement | null>;
  screenGlowRef?: React.RefObject<HTMLDivElement | null>;
  shots?: { img: string; title: string }[];
  active?: number;
  activeSrc?: string;
  lidStatic?: boolean;
}) {
  return (
    <div className="relative mx-auto w-[clamp(300px,48vw,680px)]">
      {/* screen / lid — hinged at the bottom edge */}
      <div
        ref={lidRef}
        className="relative aspect-[16/10] w-full origin-bottom rounded-[14px] border border-white/12 bg-[#0a0b0e] p-[6px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] will-change-transform [backface-visibility:hidden]"
        style={{ transformOrigin: 'center bottom', transform: lidStatic ? 'none' : 'rotateX(-92deg)' }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[9px] bg-black">
          {shots
            ? shots.map((s, i) => (
                <Image key={s.img} src={s.img} alt={s.title} fill sizes="(max-width: 1024px) 90vw, 680px" className="object-cover transition-opacity duration-500" style={{ opacity: i === active ? 1 : 0 }} />
              ))
            : activeSrc && (
                <Image src={activeSrc} alt="" fill sizes="(max-width: 1024px) 90vw, 680px" className="object-cover" />
              )}
          {/* screen light-up glow while opening */}
          <div ref={screenGlowRef} aria-hidden className="pointer-events-none absolute inset-0" style={{ opacity: lidStatic ? 0 : 0, background: 'radial-gradient(120% 80% at 50% 0%, rgba(120,170,255,0.12), transparent 60%)' }} />
          {/* subtle screen sheen */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.06] to-transparent" />
        </div>
      </div>

      {/* base / deck — a foreshortened keyboard deck below the hinge */}
      <div className="relative mx-auto h-[22px] w-[106%] rounded-b-[12px] rounded-t-[4px] border border-t-0 border-white/10 bg-gradient-to-b from-[#1b1c20] via-[#131418] to-[#0a0b0e] shadow-[0_20px_40px_-12px_rgba(0,0,0,0.7)]">
        {/* hinge lip */}
        <div className="absolute inset-x-[16%] top-0 h-[4px] rounded-b-md bg-black/50" />
        {/* trackpad notch */}
        <div className="absolute inset-x-[44%] bottom-[4px] h-[4px] rounded bg-white/[0.08]" />
      </div>
      {/* soft reflection */}
      <div aria-hidden className="mx-auto mt-2 h-10 w-[74%] rounded-[50%] bg-[#5B9BD5]/12 blur-2xl" />
    </div>
  );
}
