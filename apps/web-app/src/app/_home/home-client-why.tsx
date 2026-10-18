'use client';

import { Check } from 'lucide-react';
import { formatCents } from '@hbcfield/shared/client';
import { asArray } from './i18n-array';
import { FIELD_STACK_PER_PERSON, DISPLAY, MONO, Reveal, Label } from './home-client-helpers';
import type { HomeClientState } from './use-home-client';

/** Part of HomeClient's markup, moved here unchanged; it reads the page's state from `vm`. */
export function HomeClientWhy({ vm }: { vm: HomeClientState }) {
  const { t } = vm;
  return (
    <section className="border-t border-foreground/[0.08] px-6 py-20 sm:px-10 sm:py-40">
      <div className="mx-auto max-w-[1600px]">
        <Label className="mb-10 block">{t('home.why.label')}</Label>
        <h2
          className={(`${DISPLAY} max-w-[20ch] text-[clamp(1.8rem,5vw,3.6rem)] font-normal ` +
            `leading-[1.02] tracking-[-0.02em] text-foreground`)}>
          {t('home.why.heading')}
        </h2>
        <p className="mt-6 max-w-[54ch] text-[15px] leading-relaxed text-foreground/50">{t('home.why.lead')}</p>

        {/* comparison */}
        <Reveal delay={0.1}>
          <div
            className={"mt-14 overflow-hidden rounded-[20px] border border-foreground/[0.1] " +
              "bg-gradient-to-b from-foreground/[0.04] to-transparent " +
              "shadow-[0_28px_70px_-45px_rgba(0,0,0,0.5)]"}>
            <div className="hidden grid-cols-[1.7fr_1fr_1.1fr] items-center gap-4 border-b border-foreground/[0.08] px-8 py-5 sm:grid">
              <span className={`${MONO} text-[10px] uppercase tracking-[0.2em] text-foreground/35`}>{t('home.why.compare.otherwise')}</span>
              <span
                className={`${MONO} text-[10px] uppercase tracking-[0.2em] text-foreground/35`}>{t('home.why.compare.typicalCost')}</span>
              <span className={`${DISPLAY} text-[15px] font-medium text-foreground`}>HBCField</span>
            </div>
            {asArray<{ name: string; vendors: string; cost: string }>(t('home.why.compare.rows', { returnObjects: true })).map((r) => (
              <div
                key={r.name}
                className={"grid grid-cols-1 gap-1.5 border-b border-foreground/[0.05] px-8 py-5 " +
                  "transition-colors hover:bg-foreground/[0.015] " +
                  "sm:grid-cols-[1.7fr_1fr_1.1fr] sm:items-center sm:gap-4"}>
                <span className="text-[15px] text-foreground/85">
                  {r.name} <span className="text-foreground/35">{r.vendors}</span>
                </span>
                <span className={`${MONO} text-[13px] text-foreground/45`}>{r.cost}</span>
                <span className="inline-flex items-center gap-2.5">
                  <span className="flex size-5 items-center justify-center rounded-full bg-[#10b981]/15">
                    <Check className="h-3 w-3 text-[#10b981]" strokeWidth={3} />
                  </span>
                  <span className="text-[13px] text-foreground/70">{t('home.why.compare.included')}</span>
                </span>
              </div>
            ))}
            <div
              className={"grid grid-cols-1 gap-1.5 border-t border-foreground/[0.1] " +
                "bg-gradient-to-r from-[#5B9BD5]/[0.08] via-transparent to-transparent " +
                "px-8 py-6 sm:grid-cols-[1.7fr_1fr_1.1fr] sm:items-center sm:gap-4"}>
              <span className={`${DISPLAY} text-[17px] font-medium text-foreground`}>{t('home.why.compare.sumLabel')}</span>
              <span className={`${MONO} text-[13px] text-foreground/40 line-through`}>{t('home.why.compare.sumCost')}</span>
              <span
                className={`${DISPLAY} text-[16px] font-medium text-[#2f6fb0] dark:text-[#7db4e6]`}>{t(
                  'home.why.compare.sumUs',
                  { price: formatCents(FIELD_STACK_PER_PERSON) })}</span>
            </div>
          </div>
        </Reveal>

        {/* differentiators */}
        <Label className="mb-8 mt-24 block">{t('home.why.diffLabel')}</Label>
        <div className="grid gap-4 sm:grid-cols-2">
          {asArray<{ title: string; body: string }>(t('home.why.diffs', { returnObjects: true })).map((d, i) => (
            <Reveal key={d.title} delay={i * 0.06} className="h-full">
              <div
                className={"group h-full rounded-[18px] border border-foreground/[0.09] " +
                  "bg-gradient-to-b from-foreground/[0.04] to-transparent p-8 " +
                  "transition-all duration-300 hover:border-foreground/20 " +
                  "hover:from-foreground/[0.06]"}>
                <span className={`${MONO} text-[11px] tracking-[0.1em] text-[#5B9BD5]`}>{String(i + 1).padStart(2, '0')}</span>
                <h3 className={`${DISPLAY} mt-5 text-[19px] font-medium tracking-[-0.01em] text-foreground`}>{d.title}</h3>
                <p className="mt-3 text-[14px] leading-relaxed text-foreground/50">{d.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
