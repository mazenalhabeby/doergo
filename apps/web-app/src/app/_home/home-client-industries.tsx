'use client';

import Link from 'next/link';
import { Zap } from 'lucide-react';
import { asArray } from './i18n-array';
import { INDUSTRY_SLUGS, industryPath, industriesHubPath } from '@/lib/industries';
import { DISPLAY, MONO, Reveal, Label } from './home-client-helpers';
import type { HomeClientState } from './use-home-client';
import type HomeClient from './HomeClient';

/** Part of HomeClient's markup, moved here unchanged; it reads the page's state from `vm`. */
export function HomeClientIndustries({ vm, lang }: { vm: HomeClientState; lang: NonNullable<Parameters<typeof HomeClient>[0]['lang']> }) {
  const { t } = vm;
  return (
    <section id="industries" className="border-t border-foreground/[0.08] px-6 py-20 sm:px-10 sm:py-40">
      <div className="mx-auto max-w-[1600px]">
        <Label className="mb-10 block">{t('home.industries.label')}</Label>
        <h2 className={`${DISPLAY} max-w-[20ch] text-[clamp(1.8rem,5vw,3.6rem)] font-normal leading-[1.02] tracking-[-0.02em] text-foreground`}>
          {t('home.industries.heading')}
        </h2>
        <p className="mt-6 max-w-[56ch] text-[15px] leading-relaxed text-foreground/50">{t('home.industries.lead')}</p>

        <div className="mt-16 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {asArray<{ name: string; who: string; how: string; benefit: string }>(t('home.industries.fields', { returnObjects: true })).map((f, i) => (
            <Reveal key={f.name} delay={(i % 3) * 0.06} className="h-full">
              <Link href={industryPath(lang, INDUSTRY_SLUGS[i] ?? INDUSTRY_SLUGS[0])} className="group flex h-full flex-col rounded-[18px] border border-foreground/[0.09] bg-gradient-to-b from-foreground/[0.04] to-transparent p-7 transition-all duration-300 hover:border-foreground/20 hover:from-foreground/[0.06]">
                <span className={`${MONO} text-[11px] tracking-[0.1em] text-[#5B9BD5]`}>{String(i + 1).padStart(2, '0')}</span>
                <h3 className={`${DISPLAY} mt-4 text-[19px] font-medium tracking-[-0.01em] text-foreground`}>{f.name}</h3>
                <dl className="mt-6 flex-1 space-y-4 text-[13.5px] leading-relaxed">
                  <div>
                    <dt className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-foreground/35`}>{t('home.industries.whoLabel')}</dt>
                    <dd className="mt-1 text-foreground/60">{f.who}</dd>
                  </div>
                  <div>
                    <dt className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-foreground/35`}>{t('home.industries.howLabel')}</dt>
                    <dd className="mt-1 text-foreground/60">{f.how}</dd>
                  </div>
                </dl>
                <div className="mt-5 border-t border-foreground/[0.08] pt-4">
                  <dt className={`${MONO} flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[#10b981]`}>
                    <Zap className="h-3 w-3 shrink-0" />{t('home.industries.benefitLabel')}
                  </dt>
                  <dd className="mt-1 text-[13.5px] font-medium leading-relaxed text-emerald-700 dark:text-[#cfe8da]">{f.benefit}</dd>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
        <Link href={industriesHubPath(lang)} className={`${MONO} mt-10 inline-block text-[11px] uppercase tracking-[0.14em] text-foreground/40 transition-colors hover:text-foreground`}>
          {t('home.industries.more')} →
        </Link>
      </div>
    </section>
  );
}
