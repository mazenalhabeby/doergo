'use client';

/**
 * Scroll-driven phone showcase — the mobile companion to the laptop. The section
 * PINS the phone; as you scroll, (a) it floats up, tilts upright and the screen
 * wakes, then (b) the app screenshots cycle one per scroll-step while their
 * descriptions cross-fade beside it. The shots are driven by scroll position, and
 * the section releases right after the last one. Reduced-motion → static phone.
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
  '/shots/mobile-home.png',
  '/shots/mobile-tasks.png',
  '/shots/mobile-attendance.png',
  '/shots/mobile-team.png',
];

type ShotText = { kicker: string; title: string; body: string };

const ENTER_END = 0.16; // phone finishes rising/waking by here
const CONTENT_START = 0.18;

export function PhoneShowcase() {
  const { t } = useTranslation();
  const reduced = usePrefersReducedMotion();
  const sectionRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const wakeRef = useRef<HTMLDivElement>(null);

  const shotTexts = asArray<ShotText>(t('home.app.shots', { returnObjects: true }));
  const SHOTS = SHOT_IMAGES.map((img, i) => ({ img, ...shotTexts[i] }));

  const active = useScrollShowcase({
    sectionRef,
    reduced,
    contentStart: CONTENT_START,
    count: SHOT_IMAGES.length,
    onFrame: (p) => {
      // float up + tilt upright + wake as you scroll in
      const enter = Math.min(1, p / ENTER_END);
      const lift = (1 - enter) * 60; // px it starts lower
      const tilt = (1 - enter) * 16; // deg it starts tilted
      if (phoneRef.current) phoneRef.current.style.transform = `translateY(${lift}px) rotateY(${-tilt}deg) rotateX(${tilt * 0.4}deg)`;
      if (wakeRef.current) wakeRef.current.style.opacity = String(1 - enter * enter);
    },
  });

  if (reduced) {
    return (
      <section className="border-t border-white/[0.08] px-6 py-24 sm:px-10 sm:py-32">
        <div className="mx-auto max-w-[1600px]">
          <span style={{ fontFamily: MONO }} className="mb-6 block text-[11px] uppercase tracking-[0.28em] text-white/40">{t('home.app.label')}</span>
          <h2 style={{ fontFamily: DISPLAY }} className="mb-12 text-[clamp(1.8rem,4.4vw,3.4rem)] font-normal tracking-tight text-[#e8e8e5]">{t('home.app.reducedHeading')}</h2>
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <ul className="space-y-8">
              {SHOTS.map((s) => (
                <li key={s.img}>
                  <span style={{ fontFamily: MONO }} className="text-[11px] uppercase tracking-[0.28em] text-white/40">{s.kicker}</span>
                  <h3 style={{ fontFamily: DISPLAY }} className="mt-2 text-[1.4rem] font-normal text-[#eaeae7]">{s.title}</h3>
                  <p className="mt-2 max-w-[44ch] text-[14px] leading-relaxed text-white/50">{s.body}</p>
                </li>
              ))}
            </ul>
            <Phone activeSrc={SHOTS[0].img} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={sectionRef} id="field" className="relative border-t border-white/[0.08]" style={{ height: '270vh' }}>
      <div className="sticky top-0 flex h-screen items-center overflow-hidden px-6 sm:px-10">
        <div className="mx-auto grid w-full max-w-[1600px] items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          {/* descriptions (left) */}
          <div className="order-2 lg:order-1">
            <span style={{ fontFamily: MONO }} className="mb-8 block text-[11px] uppercase tracking-[0.28em] text-white/40">{t('home.app.label')}</span>
            <CrossfadeCopy items={SHOTS} active={active} titleMaxCls="max-w-[18ch]" />
            {/* progress dots — reflect the scroll position */}
            <ProgressDots count={SHOTS.length} active={active} />
          </div>

          {/* phone (right) */}
          <div className="order-1 flex justify-center lg:order-2 [perspective:1800px]">
            <div ref={phoneRef} className="[transform-style:preserve-3d] will-change-transform">
              <Phone shots={SHOTS} active={active} wakeRef={wakeRef} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── the phone ── */
function Phone({
  shots,
  active = 0,
  activeSrc,
  wakeRef,
}: {
  shots?: { img: string; title: string }[];
  active?: number;
  activeSrc?: string;
  wakeRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="relative mx-auto aspect-[1170/2532] w-[clamp(240px,27vw,320px)]">
      {/* body */}
      <div className="absolute inset-0 rounded-[2.8rem] border-[3px] border-white/15 bg-[#0a0b0e] p-[10px] shadow-[0_50px_120px_-30px_rgba(0,0,0,0.9)]">
        <div className="relative h-full w-full overflow-hidden rounded-[2.2rem] bg-black">
          {shots
            ? shots.map((s, i) => (
                <Image key={s.img} src={s.img} alt={s.title} fill sizes="(max-width: 1024px) 40vw, 320px" className="object-cover transition-opacity duration-500" style={{ opacity: i === active ? 1 : 0 }} />
              ))
            : activeSrc && (
                <Image src={activeSrc} alt="" fill sizes="(max-width: 1024px) 40vw, 320px" className="object-cover" />
              )}
          {/* dynamic island */}
          <div className="absolute left-1/2 top-[10px] z-10 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-black" />
          {/* screen wake veil (fades out as it "turns on") */}
          <div ref={wakeRef} aria-hidden className="pointer-events-none absolute inset-0 bg-black" />
          {/* sheen */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.05] to-transparent" />
        </div>
      </div>
      {/* soft reflection */}
      <div aria-hidden className="mx-auto mt-3 h-10 w-[60%] rounded-[50%] bg-[#5B9BD5]/12 blur-2xl" />
    </div>
  );
}
