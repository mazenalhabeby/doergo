'use client';

/**
 * Shared presentational pieces for the laptop + phone scroll showcases.
 * These render identically in both; the only per-showcase difference is the
 * crossfade title's max-width (20ch laptop / 18ch phone), exposed as a prop.
 */

import { FONT_MONO, FONT_DISPLAY } from './fonts';

type ShotText = { kicker: string; title: string; body: string };
type Shot = ShotText & { img: string };

/** Progress dots — the active dot widens (22px) and turns brand-blue. */
export function ProgressDots({ count, active }: { count: number; active: number }) {
  return (
    <div className="mt-2 flex gap-2">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="h-1 rounded-full transition-all duration-300"
          style={{ width: i === active ? 22 : 8, backgroundColor: i === active ? '#5B9BD5' : 'rgba(255,255,255,0.2)' }}
        />
      ))}
    </div>
  );
}

/**
 * Absolute-stacked crossfade copy (kicker / title / body) in a fixed-height box
 * so the kicker and the dots below never shift between slides.
 * `titleMaxCh` differs only by showcase (20 laptop, 18 phone).
 */
export function CrossfadeCopy({
  items,
  active,
  titleMaxCls,
}: {
  items: Shot[];
  active: number;
  /** literal Tailwind class so JIT keeps it — `max-w-[20ch]` laptop / `max-w-[18ch]` phone */
  titleMaxCls: string;
}) {
  return (
    <div className="relative h-[250px]">
      {items.map((s, i) => (
        <div
          key={s.img}
          className="absolute inset-x-0 top-0 transition-all duration-500"
          style={{
            opacity: i === active ? 1 : 0,
            transform: i === active ? 'translateY(0)' : 'translateY(14px)',
            pointerEvents: i === active ? 'auto' : 'none',
          }}
        >
          <span style={{ fontFamily: FONT_MONO }} className="text-[11px] uppercase tracking-[0.28em] text-[#5B9BD5]">{s.kicker}</span>
          <h3 style={{ fontFamily: FONT_DISPLAY }} className={`mt-4 ${titleMaxCls} text-[clamp(1.5rem,3vw,2.3rem)] font-normal leading-[1.08] tracking-tight text-foreground`}>
            {s.title}
          </h3>
          <p className="mt-5 max-w-[42ch] text-[15px] leading-relaxed text-foreground/55">{s.body}</p>
        </div>
      ))}
    </div>
  );
}
