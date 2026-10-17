'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { orgMonthlyCost } from '@hbcfield/shared/client';
import { usePrefersReducedMotion } from './use-reduced-motion';
import { useReveal } from './use-reveal';

/** HomeClient's module-level helpers, moved here unchanged so its sections can read them too. */
/**
 * What the stack on the left actually costs here, per person.
 *
 * Hard-coded once as "from €29 / user" — a tier price — and it outlived the
 * tiers by a month, quoting a number the product could no longer charge. It is
 * computed now, from the same function the invoice is built from, against the
 * same set of capabilities the three subscriptions beside it replace: a team of
 * six running GPS, clock-in and signed reports. Six because it is a real small
 * firm rather than a flattering one — the per-person price only improves from
 * there.
 */
export const FIELD_STACK_TEAM = 6;

export const FIELD_STACK_PER_PERSON = Math.round(
  orgMonthlyCost({
    seatCount: FIELD_STACK_TEAM,
    spaces: [
      {
        spaceId: 'compare',
        spaceName: 'compare',
        enabledModules: ['checklists', 'attachments', 'tracking', 'time_tracking', 'service_reports'],
        usage: {},
      },
    ],
    addOns: [],
  }).monthlyCents / FIELD_STACK_TEAM,
);

export const DISPLAY = 'font-[family:var(--font-familjen)]';

export const MONO = 'font-[family:var(--font-martian)]';

/** Fade + rise reveal (progressive enhancement, always ends visible). */
export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}s` }}>
      {children}
    </div>
  );
}

/** Masked line-rise reveal — each line slides up from behind a clip (the
 *  studio-grade headline effect). Lines are explicit strings. */
export function LineReveal(
  {
    lines,
    className = '',
    delayStep = 0.08,
    nowrap = false
  }: { lines: string[]; className?: string; delayStep?: number; nowrap?: boolean }) {
  const ref = useReveal<HTMLSpanElement>();
  return (
    <span ref={ref} className={`lr ${className}`}>
      {lines.map((l, i) => (
        <span key={i} className="lr-row">
          <span className={`lr-in ${nowrap ? 'whitespace-nowrap' : ''}`} style={{ transitionDelay: `${i * delayStep}s` }}>
            {l}
          </span>
        </span>
      ))}
    </span>
  );
}

/** Mono count-up with a wall-clock fallback (never stuck at 0). */
export function Count({ to }: { to: number }) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) { setN(to); return; }
    let raf = 0;
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      let start = 0;
      const dur = 1200;
      const tick = (t: number) => {
        if (!start) start = t;
        const p = Math.min(1, (t - start) / dur);
        setN(Math.round((1 - Math.pow(1 - p, 3)) * to));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { run(); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(el);
    const fb = setTimeout(() => setN(to), 1600);
    return () => { cancelAnimationFrame(raf); clearTimeout(fb); io.disconnect(); };
  }, [reduced, to]);
  return <span ref={ref} className="tabular-nums">{n}</span>;
}

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`${MONO} text-[11px] uppercase tracking-[0.28em] text-muted-foreground ${className}`}>{children}</span>;
}

/** Cycles through `words`, revealing each new word letter-by-letter from behind
 *  a clip — the trionn headline treatment. Reduced-motion shows the first word. */
export function CyclingWord({ words, className = '' }: { words: string[]; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setI((v) => (v + 1) % words.length), 2600);
    return () => clearInterval(id);
  }, [reduced, words.length]);
  const word = words[i];
  return (
    <span className={`inline-flex ${className}`} aria-label={word}>
      {word.split('').map((ch, idx) => (
        <span key={`${i}-${idx}`} className="cw-row" aria-hidden>
          <span className="cw-in" style={{ animationDelay: `${idx * 0.035}s` }}>{ch}</span>
        </span>
      ))}
    </span>
  );
}

/** A titled column of footer links — on-page anchors (#) smooth-scroll, routes
 *  use Next's client nav. */
export function FooterCol(
  { title, links }: { title: string; links: { label: string; href: string; onClick?: (e: React.MouseEvent) => void }[] }) {
  const linkCls = 'text-[14px] text-foreground/55 transition-colors hover:text-foreground';
  return (
    <div>
      <div className={`${MONO} mb-5 text-[10px] uppercase tracking-[0.28em] text-foreground/30`}>{title}</div>
      <ul className="space-y-3">
        {links.map((l) => (
          <li key={l.label}>
            {l.href.startsWith('#') ? (
              <a href={l.href} onClick={l.onClick} className={linkCls}>{l.label}</a>
            ) : (
              <Link href={l.href} className={linkCls}>{l.label}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Four "+" registration marks pinned to the viewport corners. */
export function FramePlus() {
  const cls = `${MONO} pointer-events-none fixed z-30 select-none text-[13px] text-foreground/25`;
  return (
    <>
      <span className={`${cls} left-3 top-3`}>+</span>
      <span className={`${cls} right-3 top-3`}>+</span>
      <span className={`${cls} bottom-3 left-3`}>+</span>
      <span className={`${cls} bottom-3 right-3`}>+</span>
    </>
  );
}
